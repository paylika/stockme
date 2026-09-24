-- ============================================================
-- StockMe — Badge « Fournisseur vérifié » visible DANS LES LISTES
--
-- Le badge doit apparaître sur les cartes produit (grille d'accueil,
-- boutique vendeur, produits similaires), pas seulement sur la fiche.
-- On l'ajoute donc directement dans les fonctions qui alimentent ces
-- listes : aucun appel supplémentaire côté navigateur, et le calcul
-- respecte la date d'expiration (verified_until).
-- ============================================================

-- ------------------------------------------------------------------
-- 1. Classement de l'accueil : on expose le vendeur et son badge
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_ranked_products(
  p_sort text DEFAULT 'pertinence',
  p_limit int DEFAULT 24,
  p_offset int DEFAULT 0,
  p_city text DEFAULT NULL,
  p_cities text[] DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_q text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v json;
BEGIN
  WITH base AS (
    SELECT p.id, p.name, p.category, p.price_fcfa, p.promo_price_fcfa, p.quantity, p.moq,
           p.city, p.zone, p.images, p.sold_out, p.dropshipping, p.owner_id, p.created_at,
           extract(epoch FROM (now() - p.created_at)) / 86400.0 AS age_days
    FROM public.products p
    WHERE p.published = true
      AND (p_city IS NULL OR p.city = p_city)
      AND (p_cities IS NULL OR p.city = ANY(p_cities))
      AND (p_category IS NULL OR p.category = p_category)
      AND (p_q IS NULL OR p.name ILIKE '%' || p_q || '%')
  ),
  ev AS (
    SELECT e.product_id,
      count(*) FILTER (WHERE e.event = 'contact' AND e.created_at >= now() - interval '30 days') AS contacts_30,
      count(*) FILTER (WHERE e.event = 'view' AND e.created_at >= now() - interval '30 days') AS views_30,
      count(*) FILTER (WHERE e.created_at >= now() - interval '7 days') AS events_7,
      count(*) FILTER (WHERE e.event = 'contact') AS contacts_total
    FROM public.product_events e
    WHERE e.product_id IN (SELECT id FROM base)
    GROUP BY e.product_id
  ),
  fv AS (
    SELECT f.product_id, count(*) AS favorites
    FROM public.favorites f
    WHERE f.product_id IN (SELECT id FROM base)
    GROUP BY f.product_id
  ),
  scored AS (
    SELECT b.*,
      coalesce(ev.contacts_30, 0) AS contacts_30,
      coalesce(ev.views_30, 0) AS views_30,
      coalesce(ev.events_7, 0) AS events_7,
      coalesce(ev.contacts_total, 0) AS contacts_total,
      coalesce(fv.favorites, 0) AS favorites,
      (
        3 * ln(1 + coalesce(ev.contacts_30, 0))
        + 1.5 * ln(1 + coalesce(ev.views_30, 0))
        + 2 * ln(1 + coalesce(fv.favorites, 0))
        + 18 * exp(-b.age_days / 12.0)
        + 1.5 * ln(1 + coalesce(ev.events_7, 0))
        + (CASE WHEN b.promo_price_fcfa IS NOT NULL AND b.promo_price_fcfa < b.price_fcfa THEN 10 ELSE 0 END)
        - (CASE WHEN b.sold_out THEN 20 ELSE 0 END)
      ) AS score
    FROM base b
    LEFT JOIN ev ON ev.product_id = b.id
    LEFT JOIN fv ON fv.product_id = b.id
  ),
  ranked AS (
    SELECT s.*,
      coalesce(promo_price_fcfa, price_fcfa) AS eff_price,
      (CASE WHEN promo_price_fcfa IS NOT NULL AND promo_price_fcfa < price_fcfa THEN 1 ELSE 0 END) AS is_promo,
      row_number() OVER (PARTITION BY owner_id ORDER BY
        (
          3 * ln(1 + contacts_30) + 1.5 * ln(1 + views_30) + 2 * ln(1 + favorites)
          + 18 * exp(-age_days / 12.0) + 1.5 * ln(1 + events_7)
          + (CASE WHEN promo_price_fcfa IS NOT NULL AND promo_price_fcfa < price_fcfa THEN 10 ELSE 0 END)
          - (CASE WHEN sold_out THEN 20 ELSE 0 END)
        ) DESC, created_at DESC
      ) AS seller_rank
    FROM scored s
  ),
  final AS (
    SELECT r.*, (r.score - 4 * (r.seller_rank - 1)) AS effective_score,
      coalesce(pf.verified AND (pf.verified_until IS NULL OR pf.verified_until > now()), false) AS seller_verified
    FROM ranked r
    LEFT JOIN public.profiles pf ON pf.id = r.owner_id
  )
  SELECT coalesce(json_agg(row_to_json(t)), '[]'::json) INTO v FROM (
    SELECT id, name, category, price_fcfa, promo_price_fcfa, quantity, moq, city, zone, images,
           sold_out, dropshipping, owner_id, seller_verified,
           round(score::numeric, 2) AS score,
           contacts_total, views_30, favorites
    FROM final
    ORDER BY
      CASE WHEN p_sort = 'nouveau' THEN created_at END DESC NULLS LAST,
      CASE WHEN p_sort = 'populaire' THEN contacts_total END DESC NULLS LAST,
      CASE WHEN p_sort = 'promo' THEN is_promo END DESC NULLS LAST,
      CASE WHEN p_sort = 'prix_asc' THEN eff_price END ASC NULLS LAST,
      CASE WHEN p_sort = 'prix_desc' THEN eff_price END DESC NULLS LAST,
      CASE WHEN p_sort = 'pertinence' THEN effective_score END DESC NULLS LAST,
      created_at DESC
    LIMIT greatest(p_limit, 1) OFFSET greatest(p_offset, 0)
  ) t;
  RETURN v;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_ranked_products(text, int, int, text, text[], text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_ranked_products(text, int, int, text, text[], text, text) TO anon, authenticated;

-- ------------------------------------------------------------------
-- 2. Produits similaires : même information
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_similar_products(p_product_id uuid, p_limit int DEFAULT 8)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v json;
  v_category text;
  v_dropship boolean;
BEGIN
  SELECT category, dropshipping INTO v_category, v_dropship
  FROM public.products WHERE id = p_product_id;

  SELECT coalesce(json_agg(row_to_json(t)), '[]'::json) INTO v FROM (
    SELECT p.id, p.name, p.category, p.price_fcfa, p.promo_price_fcfa, p.city, p.zone,
           p.images, p.sold_out, p.dropshipping, p.owner_id,
           coalesce(pf.verified AND (pf.verified_until IS NULL OR pf.verified_until > now()), false) AS seller_verified,
           coalesce(ev.views, 0) AS views,
           coalesce(ev.contacts, 0) AS contacts,
           coalesce(fv.favorites, 0) AS favorites
    FROM public.products p
    LEFT JOIN public.profiles pf ON pf.id = p.owner_id
    LEFT JOIN (
      SELECT product_id,
        count(*) FILTER (WHERE event = 'view') AS views,
        count(*) FILTER (WHERE event = 'contact') AS contacts
      FROM public.product_events
      GROUP BY product_id
    ) ev ON ev.product_id = p.id
    LEFT JOIN (
      SELECT product_id, count(*) AS favorites FROM public.favorites GROUP BY product_id
    ) fv ON fv.product_id = p.id
    WHERE p.published = true
      AND p.id <> p_product_id
      AND p.dropshipping = coalesce(v_dropship, false)
      AND (v_category IS NULL OR p.category = v_category)
    ORDER BY coalesce(ev.contacts, 0) DESC, coalesce(ev.views, 0) DESC, p.created_at DESC
    LIMIT greatest(p_limit, 1)
  ) t;
  RETURN v;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_similar_products(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_similar_products(uuid, int) TO anon, authenticated;

-- ------------------------------------------------------------------
-- 3. Liste des vendeurs vérifiés (pour les pages qui lisent les
--    produits en direct, ex. la recherche /browse)
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_verified_sellers()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v json;
BEGIN
  SELECT coalesce(json_agg(json_build_object(
           'id', p.id,
           'shop_name', coalesce(p.shop_name, p.full_name),
           'city', p.city
         )), '[]'::json) INTO v
  FROM public.profiles p
  WHERE p.verified = true
    AND (p.verified_until IS NULL OR p.verified_until > now());

  RETURN v;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_verified_sellers() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_verified_sellers() TO anon, authenticated;
