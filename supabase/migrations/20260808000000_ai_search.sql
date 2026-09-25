-- ============================================================
-- StockMe — IA, étape 2 : la recherche intelligente (côté base)
--
-- À coller quand on branche la recherche IA (étape 2 du plan).
-- L'IA ne décide PAS du classement : elle traduit la demande de l'acheteur
-- en mots-clés et en filtres (catégorie, ville, prix). Le classement reste
-- ici, où vivent tes règles commerciales :
--
--   1. la pertinence (ce que l'acheteur a demandé) ;
--   2. la qualité réelle (contacts, vues, favoris, fraîcheur, promo) ;
--   3. tes règles : mise en avant PAYÉE d'abord, puis fournisseur vérifié.
--
-- Idempotent : peut être relancé sans effet de bord.
-- ============================================================

CREATE OR REPLACE FUNCTION public.search_products_ai(
  p_keywords text[] DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_cities text[] DEFAULT NULL,
  p_price_min int DEFAULT NULL,
  p_price_max int DEFAULT NULL,
  p_sort text DEFAULT 'pertinence',
  p_limit int DEFAULT 24,
  p_offset int DEFAULT 0
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v json;
  c_verified_bonus constant numeric := 8;    -- avantage « fournisseur vérifié »
  c_boost_bonus constant numeric := 15;      -- produit actuellement mis en avant
  c_name_weight constant numeric := 12;      -- mot-clé trouvé dans le NOM du produit
  c_keyword_weight constant numeric := 4;    -- mot-clé trouvé ailleurs (description, mots-clés IA)
  v_has_keywords boolean := coalesce(array_length(p_keywords, 1), 0) > 0;
BEGIN
  WITH base AS (
    SELECT p.id, p.name, p.category, p.price_fcfa, p.promo_price_fcfa, p.quantity, p.moq,
           p.city, p.zone, p.images, p.sold_out, p.dropshipping, p.owner_id, p.created_at,
           extract(epoch FROM (now() - p.created_at)) / 86400.0 AS age_days,
           lower(p.name) AS haystack_name,
           lower(
             p.name || ' ' || coalesce(p.category, '') || ' ' || coalesce(p.description, '') || ' ' ||
             coalesce(array_to_string(p.ai_keywords, ' '), '')
           ) AS haystack,
           coalesce(pf.verified AND (pf.verified_until IS NULL OR pf.verified_until > now()), false) AS seller_verified,
           EXISTS (
             SELECT 1 FROM public.ads a
             WHERE a.product_id = p.id AND a.kind = 'product' AND a.active = true
               AND a.starts_at <= now() AND (a.ends_at IS NULL OR a.ends_at >= now())
           ) AS is_boosted
      FROM public.products p
      LEFT JOIN public.profiles pf ON pf.id = p.owner_id
     WHERE p.published = true
       AND (p_city IS NULL OR p.city = p_city)
       AND (p_cities IS NULL OR p.city = ANY(p_cities))
       AND (p_category IS NULL OR p.category = p_category)
       AND (p_price_max IS NULL OR coalesce(p.promo_price_fcfa, p.price_fcfa) <= p_price_max)
       AND (p_price_min IS NULL OR coalesce(p.promo_price_fcfa, p.price_fcfa) >= p_price_min)
  ),
  hits AS (
    SELECT b.id,
           count(*) FILTER (WHERE b.haystack_name LIKE '%' || k || '%') AS name_hits,
           count(*) FILTER (WHERE b.haystack LIKE '%' || k || '%') AS all_hits
      FROM base b
      CROSS JOIN unnest(coalesce(p_keywords, ARRAY[]::text[])) AS k
     WHERE length(k) >= 2
     GROUP BY b.id
  ),
  -- Avec des mots-clés, on ne garde que les produits qui en contiennent au
  -- moins un (sinon on afficherait du hasard). Sans mot-clé, on garde tout.
  filtered AS (
    SELECT b.*, coalesce(h.name_hits, 0) AS name_hits, coalesce(h.all_hits, 0) AS all_hits
      FROM base b
      LEFT JOIN hits h ON h.id = b.id
     WHERE NOT v_has_keywords OR coalesce(h.all_hits, 0) > 0
  ),
  ev AS (
    SELECT e.product_id,
      count(*) FILTER (WHERE e.event = 'contact' AND e.created_at >= now() - interval '30 days') AS contacts_30,
      count(*) FILTER (WHERE e.event = 'view' AND e.created_at >= now() - interval '30 days') AS views_30,
      count(*) FILTER (WHERE e.created_at >= now() - interval '7 days') AS events_7,
      count(*) FILTER (WHERE e.event = 'contact') AS contacts_total
    FROM public.product_events e
    WHERE e.product_id IN (SELECT id FROM filtered)
    GROUP BY e.product_id
  ),
  fv AS (
    SELECT f.product_id, count(*) AS favorites
    FROM public.favorites f
    WHERE f.product_id IN (SELECT id FROM filtered)
    GROUP BY f.product_id
  ),
  scored AS (
    SELECT f.*,
      coalesce(ev.contacts_30, 0) AS contacts_30,
      coalesce(ev.views_30, 0) AS views_30,
      coalesce(ev.events_7, 0) AS events_7,
      coalesce(ev.contacts_total, 0) AS contacts_total,
      coalesce(fv.favorites, 0) AS favorites,
      coalesce(promo_price_fcfa, price_fcfa) AS eff_price,
      (CASE WHEN promo_price_fcfa IS NOT NULL AND promo_price_fcfa < price_fcfa THEN 1 ELSE 0 END) AS is_promo,
      (
        c_name_weight * f.name_hits
        + c_keyword_weight * f.all_hits
        + 3 * ln(1 + coalesce(ev.contacts_30, 0))
        + 1.5 * ln(1 + coalesce(ev.views_30, 0))
        + 2 * ln(1 + coalesce(fv.favorites, 0))
        + 18 * exp(-f.age_days / 12.0)
        + 1.5 * ln(1 + coalesce(ev.events_7, 0))
        + (CASE WHEN f.promo_price_fcfa IS NOT NULL AND f.promo_price_fcfa < f.price_fcfa THEN 10 ELSE 0 END)
        + (CASE WHEN f.seller_verified THEN c_verified_bonus ELSE 0 END)
        + (CASE WHEN f.is_boosted THEN c_boost_bonus ELSE 0 END)
        - (CASE WHEN f.sold_out THEN 20 ELSE 0 END)
      ) AS score
    FROM filtered f
    LEFT JOIN ev ON ev.product_id = f.id
    LEFT JOIN fv ON fv.product_id = f.id
  )
  SELECT coalesce(json_agg(row_to_json(t)), '[]'::json) INTO v FROM (
    SELECT id, name, category, price_fcfa, promo_price_fcfa, quantity, moq, city, zone, images,
           sold_out, dropshipping, owner_id, seller_verified, is_boosted,
           name_hits, all_hits, round(score::numeric, 2) AS score,
           contacts_total, views_30, favorites
      FROM scored
     ORDER BY
       CASE WHEN p_sort = 'prix_asc' THEN eff_price END ASC NULLS LAST,
       CASE WHEN p_sort = 'prix_desc' THEN eff_price END DESC NULLS LAST,
       CASE WHEN p_sort = 'nouveau' THEN created_at END DESC NULLS LAST,
       CASE WHEN p_sort = 'populaire' THEN contacts_total END DESC NULLS LAST,
       -- À pertinence comparable : la mise en avant payée passe devant,
       -- puis le fournisseur vérifié.
       score DESC,
       CASE WHEN is_boosted THEN 0 ELSE 1 END,
       CASE WHEN seller_verified THEN 0 ELSE 1 END,
       created_at DESC
     LIMIT greatest(p_limit, 1) OFFSET greatest(p_offset, 0)
  ) t;
  RETURN v;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.search_products_ai(text[], text, text, text[], int, int, text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_products_ai(text[], text, text, text[], int, int, text, int, int) TO anon, authenticated;

-- ============================================================
-- CONTRÔLE : doit renvoyer des produits
-- ============================================================
-- select public.search_products_ai(array['savon','mains'], null, null, null, null, null, 'pertinence', 5, 0);
