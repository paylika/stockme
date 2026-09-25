-- ============================================================
-- StockMe — Classement : la mise en avant payée remonte vraiment
--
-- À coller dans Supabase → SQL Editor si ce n'est pas déjà fait.
-- La version précédente de get_ranked_products (badge vérifié seulement)
-- est encore en production : les produits boostés n'ont donc AUCUN
-- avantage de classement. On remet la fonction complète :
--   • renvoie is_boosted (le client peut afficher « Mis en avant »)
--   • +15 points de score pour un produit actuellement mis en avant
--   • à score égal, le produit mis en avant passe devant
--   • à score égal, le vendeur vérifié passe devant
--
-- Idempotent : peut être collé plusieurs fois sans effet de bord.
-- Contrôle après exécution (doit renvoyer true) :
--   select pg_get_functiondef(p.oid) ilike '%is_boosted%' as classement_boost_actif
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.proname = 'get_ranked_products';
-- ============================================================

-- Ancienne surcharge à 7 arguments (avant le filtre « vendeurs vérifiés ») :
-- on la supprime si elle traîne encore, sinon l'appel serait ambigu.
DROP FUNCTION IF EXISTS public.get_ranked_products(text, int, int, text, text[], text, text);

-- CREATE OR REPLACE (pas de DROP + CREATE) : aucune erreur de dépendance
-- possible, le script peut être relancé autant de fois que nécessaire.
CREATE OR REPLACE FUNCTION public.get_ranked_products(
  p_sort text DEFAULT 'pertinence',
  p_limit int DEFAULT 24,
  p_offset int DEFAULT 0,
  p_city text DEFAULT NULL,
  p_cities text[] DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_q text DEFAULT NULL,
  p_verified_only boolean DEFAULT false
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v json;
  c_verified_bonus constant numeric := 8;   -- avantage « fournisseur vérifié »
  c_boost_bonus constant numeric := 15;     -- produit actuellement mis en avant (payé)
BEGIN
  WITH base AS (
    SELECT p.id, p.name, p.category, p.price_fcfa, p.promo_price_fcfa, p.quantity, p.moq,
           p.city, p.zone, p.images, p.sold_out, p.dropshipping, p.owner_id, p.created_at,
           extract(epoch FROM (now() - p.created_at)) / 86400.0 AS age_days,
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
      AND (p_q IS NULL OR p.name ILIKE '%' || p_q || '%')
      AND (NOT coalesce(p_verified_only, false)
           OR coalesce(pf.verified AND (pf.verified_until IS NULL OR pf.verified_until > now()), false))
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
        + (CASE WHEN b.seller_verified THEN c_verified_bonus ELSE 0 END)
        + (CASE WHEN b.is_boosted THEN c_boost_bonus ELSE 0 END)
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
          + (CASE WHEN seller_verified THEN c_verified_bonus ELSE 0 END)
          + (CASE WHEN is_boosted THEN c_boost_bonus ELSE 0 END)
          - (CASE WHEN sold_out THEN 20 ELSE 0 END)
        ) DESC, created_at DESC
      ) AS seller_rank
    FROM scored s
  ),
  final AS (
    SELECT r.*, (r.score - 4 * (r.seller_rank - 1)) AS effective_score
    FROM ranked r
  )
  SELECT coalesce(json_agg(row_to_json(t)), '[]'::json) INTO v FROM (
    SELECT id, name, category, price_fcfa, promo_price_fcfa, quantity, moq, city, zone, images,
           sold_out, dropshipping, owner_id, seller_verified, is_boosted,
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
      -- À tri égal, la mise en avant payée passe devant.
      CASE WHEN is_boosted THEN 0 ELSE 1 END,
      CASE WHEN seller_verified THEN 0 ELSE 1 END,
      created_at DESC
    LIMIT greatest(p_limit, 1) OFFSET greatest(p_offset, 0)
  ) t;
  RETURN v;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_ranked_products(text, int, int, text, text[], text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_ranked_products(text, int, int, text, text[], text, text, boolean) TO anon, authenticated;
