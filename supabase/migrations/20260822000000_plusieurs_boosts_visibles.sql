-- ============================================================
-- StockMe — PLUSIEURS MISES EN AVANT EN MÊME TEMPS
--
-- LE PROBLÈME : un vendeur pouvait payer la mise en avant de 3 produits, les
-- 3 campagnes tournaient bien (débit quotidien, +15 de classement, passage dans
-- le carrousel)… mais la GRILLE de l'accueil ne montrait qu'UN SEUL produit par
-- vendeur : la règle « un seul emplacement par vendeur » (ajoutée pour éviter
-- qu'une boutique prenne tous les emplacements) donnait l'impression que le
-- deuxième boost ne servait à rien.
--
-- LE CHANGEMENT : deux emplacements maximum par vendeur au lieu d'un. Celui qui
-- paie pour 5 produits en voit donc 2 dans les emplacements payés — et ses 5
-- produits remontent tous dans le catalogue et tournent tous dans le carrousel.
--
-- Pour passer à 3 emplacements par vendeur plus tard : remplacez le 2 de
-- `rang_vendeur <= 2` ci-dessous par 3.
--
-- Idempotent : peut être relancé sans effet de bord.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_sponsored_products(p_limit int DEFAULT 3)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE v json;
BEGIN
  SELECT coalesce(json_agg(row_to_json(t)), '[]'::json) INTO v FROM (
    WITH candidats AS (
      SELECT
        a.id AS ad_id,
        a.weight,
        p.id, p.name, p.category, p.price_fcfa, p.promo_price_fcfa,
        p.quantity, p.moq, p.city, p.zone, p.images, p.price_tiers,
        p.sold_out, p.dropshipping, p.owner_id,
        coalesce(pf.verified AND (pf.verified_until IS NULL OR pf.verified_until > now()), false) AS seller_verified,

        -- Combien de fois CETTE annonce a déjà été vue aujourd'hui :
        -- c'est le critère n°1 de la rotation (le moins vu passe devant).
        (SELECT count(*) FROM public.ad_events e
          WHERE e.ad_id = a.id
            AND e.event_type = 'impression'
            AND e.created_at >= date_trunc('day', now())) AS vues_jour,

        (SELECT count(*) FROM public.ad_events e
          WHERE e.ad_id = a.id
            AND e.event_type = 'click'
            AND e.created_at >= now() - interval '7 days') AS clics_7j,

        -- DEUX emplacements maximum par vendeur (au lieu d'un).
        row_number() OVER (PARTITION BY p.owner_id ORDER BY a.weight DESC, random()) AS rang_vendeur,
        -- Deux emplacements maximum pour une même catégorie.
        row_number() OVER (PARTITION BY p.category ORDER BY a.weight DESC, random()) AS rang_categorie
      FROM public.ads a
      JOIN public.products p ON p.id = a.product_id
      LEFT JOIN public.profiles pf ON pf.id = p.owner_id
      WHERE a.kind = 'product'
        AND a.active = true
        AND a.starts_at <= now()
        AND (a.ends_at IS NULL OR a.ends_at >= now())
        AND p.published = true
        AND p.sold_out = false
    )
    SELECT
      c.ad_id, c.id, c.name, c.category, c.price_fcfa, c.promo_price_fcfa,
      c.quantity, c.moq, c.city, c.zone, c.images, c.price_tiers,
      c.sold_out, c.dropshipping, c.owner_id, c.seller_verified
    FROM candidats c
    WHERE c.rang_vendeur <= 2
      AND c.rang_categorie <= 2
    ORDER BY
      c.vues_jour ASC,
      c.weight DESC,
      (CASE WHEN c.seller_verified THEN 0 ELSE 1 END),
      c.clics_7j DESC,
      random()
    LIMIT greatest(1, least(coalesce(p_limit, 3), 6))
  ) t;
  RETURN v;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.get_sponsored_products(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_sponsored_products(int) TO anon, authenticated;

-- ============================================================
-- CONTRÔLES
-- ============================================================
-- select pg_get_functiondef(p.oid) like '%rang_vendeur <= 2%' as deux_emplacements_ok
--   from pg_proc p where p.proname = 'get_sponsored_products';
--
-- -- Qui tourne en ce moment, et combien d'annonces par vendeur ?
-- select coalesce(nullif(pf.shop_name, ''), pf.full_name, '—') as boutique,
--        count(*) as annonces_en_diffusion,
--        sum(c.daily_budget_fcfa) as engage_par_jour
--   from public.boost_campaigns c
--   join public.profiles pf on pf.id = c.user_id
--  where c.status = 'active'
--  group by 1
--  order by 2 desc;
