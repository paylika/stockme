-- ============================================================
-- StockMe — Le badge « Fournisseur vérifié » s'affiche aussi sur les
--           emplacements payants (accueil) et dans la recherche par image
--
-- PROBLÈME CONSTATÉ : `get_sponsored_products` ne renvoyait ni `owner_id` ni
-- `seller_verified`. Les produits mis en avant — donc les cartes en TÊTE de
-- l'accueil — s'affichaient SANS le badge, même quand le vendeur est vérifié.
-- Résultat : un vendeur qui paie son badge ET une mise en avant ne voyait
-- jamais son badge là où il est le plus visible.
--
-- Ce script renvoie désormais :
--   • owner_id          → pour rattacher la carte à sa boutique ;
--   • seller_verified   → le badge, calculé comme dans le classement ;
--   • price_tiers       → pour afficher « dès X F » sur les paliers de prix.
--
-- Idempotent : peut être relancé sans effet de bord.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_sponsored_products(p_limit int DEFAULT 3)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v json;
BEGIN
  SELECT coalesce(json_agg(row_to_json(t)), '[]'::json) INTO v FROM (
    SELECT
      a.id AS ad_id,
      p.id, p.name, p.category, p.price_fcfa, p.promo_price_fcfa,
      p.quantity, p.moq, p.city, p.zone, p.images,
      p.sold_out, p.dropshipping, p.owner_id, p.price_tiers,
      -- Le badge : vérifié ET encore valable (jamais rétroactif).
      coalesce(pf.verified AND (pf.verified_until IS NULL OR pf.verified_until > now()), false) AS seller_verified
    FROM public.ads a
    JOIN public.products p ON p.id = a.product_id
    LEFT JOIN public.profiles pf ON pf.id = p.owner_id
    WHERE a.kind = 'product'
      AND a.active = true
      AND a.starts_at <= now()
      AND (a.ends_at IS NULL OR a.ends_at >= now())
      AND p.published = true
      AND p.sold_out = false
    ORDER BY a.weight DESC, random()
    LIMIT greatest(1, least(coalesce(p_limit, 3), 6))
  ) t;
  RETURN v;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_sponsored_products(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_sponsored_products(int) TO anon, authenticated;

-- ============================================================
-- CONTRÔLE : doit renvoyer les deux colonnes à true
-- ============================================================
-- select pg_get_functiondef(p.oid) like '%seller_verified%' as badge_dans_annonces,
--        pg_get_functiondef(p.oid) like '%p.owner_id%' as proprietaire_inclus,
--        pg_get_functiondef(p.oid) like '%price_tiers%' as paliers_inclus
--   from pg_proc p where p.proname = 'get_sponsored_products';
