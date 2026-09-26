-- ============================================================
-- StockMe — DIFFUSION D'ANNONCES INTELLIGENTE
--
-- PROBLÈME RÉSOLU
--   Les emplacements payés (2 en tête de l'accueil + le carrousel) étaient
--   servis par `weight DESC, random()`. Conséquences :
--     • les MÊMES annonces restaient en tête toute la journée ;
--     • un vendeur qui met 10 produits en avant pouvait occuper TOUS les
--       emplacements à lui seul ;
--     • trois emplacements pouvaient afficher trois fois la même catégorie ;
--     • un annonceur sans trafic ne recevait jamais rien (il paie et ne voit
--       aucune vue — la plainte la plus fréquente).
--
-- CE QUE FAIT CE SCRIPT
--   1. ROTATION ÉQUITABLE : l'annonce la MOINS VUE AUJOURD'HUI passe devant.
--      Tout le monde tourne donc au prorata du trafic, au lieu que le même
--      produit reste collé en tête.
--   2. 1 EMPLACEMENT MAXIMUM PAR VENDEUR (quel que soit le nombre de produits
--      mis en avant).
--   3. 2 EMPLACEMENTS MAXIMUM PAR CATÉGORIE (diversité pour l'acheteur).
--   4. Priorité payée (`weight`), badge vérifié et performance (clics 7 jours)
--      servent d'arbitrage à égalité de vues du jour.
--   5. Le carrousel d'accueil tourne aussi (au lieu des mêmes annonces).
--
-- Idempotent : peut être relancé sans effet de bord.
-- ============================================================


-- ============================================================
-- 1. Emplacements payés de la grille (accueil, /browse)
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
        -- Le badge « Fournisseur vérifié » (vérifié ET encore valable).
        coalesce(pf.verified AND (pf.verified_until IS NULL OR pf.verified_until > now()), false) AS seller_verified,

        -- Combien de fois CETTE annonce a déjà été vue aujourd'hui :
        -- c'est le critère n°1 de la rotation (le moins vu passe devant).
        (SELECT count(*) FROM public.ad_events e
          WHERE e.ad_id = a.id
            AND e.event_type = 'impression'
            AND e.created_at >= date_trunc('day', now())) AS vues_jour,

        -- Ce qui attire vraiment des clics (arbitrage à égalité de vues).
        (SELECT count(*) FROM public.ad_events e
          WHERE e.ad_id = a.id
            AND e.event_type = 'click'
            AND e.created_at >= now() - interval '7 days') AS clics_7j,

        -- Un seul emplacement par vendeur, même avec 10 produits en avant.
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
    WHERE c.rang_vendeur = 1
      AND c.rang_categorie <= 2
    ORDER BY
      c.vues_jour ASC,                                   -- 1. équité du jour
      c.weight DESC,                                     -- 2. priorité payée
      (CASE WHEN c.seller_verified THEN 0 ELSE 1 END),   -- 3. boutiques vérifiées
      c.clics_7j DESC,                                   -- 4. ce qui fonctionne
      random()                                           -- 5. hasard (anti-figeage)
    LIMIT greatest(1, least(coalesce(p_limit, 3), 6))
  ) t;
  RETURN v;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.get_sponsored_products(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_sponsored_products(int) TO anon, authenticated;


-- ============================================================
-- 2. Carrousel de l'accueil : rotation au lieu des mêmes annonces
--    (et 8 annonces maximum pour ne pas alourdir la bannière)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_active_ads()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE v json;
BEGIN
  SELECT coalesce(json_agg(row_to_json(t)), '[]'::json) INTO v FROM (
    SELECT
      a.id, a.kind, a.title, a.description, a.image_url, a.cta_label, a.href, a.weight,
      a.starts_at, a.ends_at, a.product_id,
      p.name AS product_name, p.images AS product_images, p.city AS product_city,
      p.zone AS product_zone, p.category AS product_category, p.moq, p.quantity,
      p.price_fcfa, p.promo_price_fcfa, p.dropshipping, p.sold_out,
      (SELECT count(*) FROM public.ad_events e
        WHERE e.ad_id = a.id
          AND e.event_type = 'impression'
          AND e.created_at >= date_trunc('day', now())) AS vues_jour
    FROM public.ads a
    LEFT JOIN public.products p ON p.id = a.product_id
    WHERE a.active = true
      AND a.starts_at <= now()
      AND (a.ends_at IS NULL OR a.ends_at >= now())
      AND (a.kind <> 'product' OR (p.id IS NOT NULL AND p.published = true AND p.sold_out = false))
    ORDER BY
      vues_jour ASC,          -- rotation : l'annonce la moins vue aujourd'hui d'abord
      a.weight DESC,
      random()
    LIMIT 8
  ) t;
  RETURN v;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.get_active_ads() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_ads() TO anon, authenticated;


-- ============================================================
-- 3. CONTRÔLE (doit renvoyer true partout)
-- ============================================================
SELECT
  pg_get_functiondef(p.oid) LIKE '%vues_jour%'        AS rotation_par_vues,
  pg_get_functiondef(p.oid) LIKE '%rang_vendeur%'     AS un_emplacement_par_vendeur,
  pg_get_functiondef(p.oid) LIKE '%rang_categorie%'   AS diversite_categories,
  pg_get_functiondef(p.oid) LIKE '%seller_verified%'  AS badge_inclus,
  pg_get_functiondef(p.oid) LIKE '%price_tiers%'      AS paliers_inclus
FROM pg_proc p
WHERE p.proname = 'get_sponsored_products';


-- ============================================================
-- 4. VOIR LA ROTATION EN DIRECT (à relancer quand vous voulez)
--    → qui tourne, combien de vues aujourd'hui, combien de clics.
-- ============================================================
SELECT
  COALESCE(NULLIF(pf.shop_name, ''), pf.full_name, '—') AS boutique,
  p.name AS produit,
  p.category AS categorie,
  a.weight AS priorite,
  (SELECT count(*) FROM public.ad_events e
    WHERE e.ad_id = a.id AND e.event_type = 'impression'
      AND e.created_at >= date_trunc('day', now())) AS vues_aujourdhui,
  (SELECT count(*) FROM public.ad_events e
    WHERE e.ad_id = a.id AND e.event_type = 'impression') AS vues_total,
  (SELECT count(*) FROM public.ad_events e
    WHERE e.ad_id = a.id AND e.event_type = 'click') AS clics_total,
  a.ends_at AS diffuse_jusqua
FROM public.ads a
JOIN public.products p ON p.id = a.product_id
LEFT JOIN public.profiles pf ON pf.id = p.owner_id
WHERE a.kind = 'product' AND a.active = true
ORDER BY vues_aujourdhui DESC, boutique;
