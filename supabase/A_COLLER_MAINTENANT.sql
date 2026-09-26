-- ############################################################################
-- STOCKME — TOUT LE SQL EN ATTENTE, À COLLER D'UN SEUL COUP
-- Supabase -> SQL Editor -> New query -> coller TOUT ce fichier -> Run
--
-- 5 parties independantes, sans danger, relancables :
--   1. AVIS PRODUITS (etoiles + commentaires + photos)      -> INDISPENSABLE
--   2. BADGE : activer les vendeurs qui ont deja paye
--   3. DIFFUSION D'ANNONCES INTELLIGENTE (rotation equitable)
--   4. Ne pas facturer une journee qui n'a pas pu etre servie
--   5. (option) aligner les mises en avant en cours sur 1 000 F/jour
-- ############################################################################


-- ############################################################################
-- PARTIE 1 / 5 — AVIS PRODUITS
-- ############################################################################
CREATE TABLE IF NOT EXISTS public.product_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text,
  images text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS product_reviews_product_user_idx
  ON public.product_reviews (product_id, user_id);
CREATE INDEX IF NOT EXISTS product_reviews_product_date_idx
  ON public.product_reviews (product_id, created_at DESC);
ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS product_reviews_read ON public.product_reviews;
CREATE POLICY product_reviews_read ON public.product_reviews
  FOR SELECT USING (true);
DROP POLICY IF EXISTS product_reviews_insert ON public.product_reviews;
CREATE POLICY product_reviews_insert ON public.product_reviews
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND NOT EXISTS (
      SELECT 1 FROM public.products p
       WHERE p.id = product_id AND p.owner_id = auth.uid()
    )
  );
DROP POLICY IF EXISTS product_reviews_update ON public.product_reviews;
CREATE POLICY product_reviews_update ON public.product_reviews
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS product_reviews_delete ON public.product_reviews;
CREATE POLICY product_reviews_delete ON public.product_reviews
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS rating_avg numeric(2,1);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS rating_count int NOT NULL DEFAULT 0;
CREATE OR REPLACE FUNCTION public.refresh_product_rating(p_product_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.products p
     SET rating_avg = s.avg_rating,
         rating_count = s.n
    FROM (
      SELECT round(avg(rating)::numeric, 1) AS avg_rating, count(*)::int AS n
        FROM public.product_reviews
       WHERE product_id = p_product_id
    ) s
   WHERE p.id = p_product_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.refresh_product_rating(uuid) FROM PUBLIC;
CREATE OR REPLACE FUNCTION public.product_reviews_after_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.refresh_product_rating(coalesce(NEW.product_id, OLD.product_id));
  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.product_reviews_after_change() FROM PUBLIC;
DROP TRIGGER IF EXISTS product_reviews_after_change ON public.product_reviews;
CREATE TRIGGER product_reviews_after_change
  AFTER INSERT OR UPDATE OR DELETE ON public.product_reviews
  FOR EACH ROW EXECUTE FUNCTION public.product_reviews_after_change();
UPDATE public.products p
   SET rating_avg = s.avg_rating, rating_count = s.n
  FROM (
    SELECT product_id, round(avg(rating)::numeric, 1) AS avg_rating, count(*)::int AS n
      FROM public.product_reviews GROUP BY product_id
  ) s
 WHERE p.id = s.product_id;
CREATE OR REPLACE FUNCTION public.get_product_reviews(
  p_product_id uuid,
  p_limit int DEFAULT 20,
  p_offset int DEFAULT 0
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v json;
BEGIN
  SELECT json_build_object(
    'average', coalesce(round(avg(rating)::numeric, 1), 0),
    'count', count(*),
    'distribution', json_build_object(
      '5', count(*) FILTER (WHERE rating = 5),
      '4', count(*) FILTER (WHERE rating = 4),
      '3', count(*) FILTER (WHERE rating = 3),
      '2', count(*) FILTER (WHERE rating = 2),
      '1', count(*) FILTER (WHERE rating = 1)
    ),
    'reviews', coalesce((
      SELECT json_agg(row_to_json(t)) FROM (
        SELECT r.id, r.rating, r.comment, r.images, r.created_at, r.user_id,
               coalesce(nullif(pf.shop_name, ''), nullif(pf.full_name, ''), 'Acheteur StockMe') AS author,
               pf.avatar_url AS author_avatar,
               (r.user_id = auth.uid()) AS mine
          FROM public.product_reviews r
          LEFT JOIN public.profiles pf ON pf.id = r.user_id
         WHERE r.product_id = p_product_id
         ORDER BY r.created_at DESC
         LIMIT greatest(p_limit, 1) OFFSET greatest(p_offset, 0)
      ) t
    ), '[]'::json)
  ) INTO v
  FROM public.product_reviews
  WHERE product_id = p_product_id;
  RETURN coalesce(v, json_build_object('average', 0, 'count', 0,
    'distribution', json_build_object('5',0,'4',0,'3',0,'2',0,'1',0), 'reviews', '[]'::json));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_product_reviews(uuid, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_product_reviews(uuid, int, int) TO anon, authenticated;

-- ############################################################################
-- PARTIE 2 / 5 — BADGE FOURNISSEUR VERIFIE : ACTIVER CEUX QUI ONT PAYE
--
-- ATTENTION : le garde-fou profiles_guard_verified ANNULE toute modification
-- du badge faite hors session admin (dans l'editeur SQL, auth.uid() est NULL).
-- D'ou la desactivation du trigger le temps de l'operation. Sans elle : aucun
-- effet, et aucune erreur affichee (c'est le piege).
-- ############################################################################

-- 2.a) QUI a paye sans recevoir le badge ? (controle, ne modifie rien)
SELECT pi.paid_at, pi.amount_fcfa, pi.method, pi.user_id,
       COALESCE(NULLIF(pf.shop_name, ''), pf.full_name, '-') AS boutique,
       pf.verified
FROM public.payment_intents pi
LEFT JOIN public.profiles pf ON pf.id = pi.user_id
WHERE pi.purpose = 'subscription' AND pi.status = 'paid'
  AND COALESCE(pf.verified, false) = false
ORDER BY pi.paid_at DESC;

-- 2.b) Activation du badge 12 mois pour tous ces vendeurs
BEGIN;
ALTER TABLE public.profiles DISABLE TRIGGER profiles_guard_verified;
WITH payeurs AS (
  SELECT DISTINCT pi.user_id
  FROM public.payment_intents pi
  JOIN public.profiles pf ON pf.id = pi.user_id
  WHERE pi.purpose = 'subscription' AND pi.status = 'paid'
    AND COALESCE(pf.verified, false) = false
)
UPDATE public.profiles p
   SET verified       = true,
       verified_at    = COALESCE(p.verified_at, now()),
       verified_until = GREATEST(COALESCE(p.verified_until, now()), now()) + interval '12 months'
  FROM payeurs
 WHERE p.id = payeurs.user_id;
ALTER TABLE public.profiles ENABLE TRIGGER profiles_guard_verified;
COMMIT;

-- 2.c) Une seule boutique (nom recu sur WhatsApp) : remplacez le nom et lancez
BEGIN;
ALTER TABLE public.profiles DISABLE TRIGGER profiles_guard_verified;
UPDATE public.profiles
   SET verified = true,
       verified_at = COALESCE(verified_at, now()),
       verified_until = GREATEST(COALESCE(verified_until, now()), now()) + interval '12 months'
 WHERE lower(btrim(COALESCE(shop_name, ''))) = lower(btrim('NOM DE LA BOUTIQUE'));
ALTER TABLE public.profiles ENABLE TRIGGER profiles_guard_verified;
COMMIT;


-- ############################################################################
-- PARTIE 3 / 5 — DIFFUSION D'ANNONCES INTELLIGENTE
-- ############################################################################
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
AS $$
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
$$;
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
AS $$
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
$$;
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


-- ############################################################################
-- PARTIE 4 / 5 — ON NE FACTURE PAS UNE JOURNEE QUI N'A PAS PU ETRE SERVIE
-- (produit depublie ou en rupture de stock)
-- ############################################################################
-- ============================================================
-- StockMe — On ne facture JAMAIS une journée qui n'a pas pu être servie
--
-- PROBLÈME RÉSOLU
--   La tâche quotidienne (`boost_run_daily`) débitait 1 000 F par jour à une
--   campagne active, sans vérifier que le produit pouvait réellement s'afficher.
--   Un produit dépublié ou EN RUPTURE DE STOCK disparaît pourtant des
--   emplacements mis en avant (`get_sponsored_products` filtre sold_out) :
--   le vendeur payait donc des journées pendant lesquelles son annonce était
--   invisible — exactement le genre de chose qui fait perdre la confiance.
--
-- CE QUE FAIT CE SCRIPT
--   • produit publié ET disponible  → journée servie et facturée (comme avant) ;
--   • produit dépublié ou en rupture → journée NON facturée, campagne laissée
--     ACTIVE : rien n'est perdu, la diffusion repart dès la remise en stock.
--
-- Le reste du comportement est inchangé (solde insuffisant → pause, etc.).
-- Idempotent : peut être relancé sans effet de bord.
-- ============================================================

CREATE OR REPLACE FUNCTION public.boost_run_daily()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c record;
  v_balance int;
  v_ad uuid;
  v_served int := 0;
  v_paused int := 0;
  v_skipped int := 0;
BEGIN
  FOR c IN
    SELECT * FROM public.boost_campaigns WHERE status = 'active' FOR UPDATE
  LOOP
    -- 0. Le produit peut-il être montré ? Sinon on ne débite RIEN.
    IF NOT EXISTS (
      SELECT 1 FROM public.products p
       WHERE p.id = c.product_id
         AND p.published = true
         AND p.sold_out = false
    ) THEN
      UPDATE public.boost_campaigns SET last_run_at = now() WHERE id = c.id;
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    SELECT balance_fcfa INTO v_balance FROM public.wallets WHERE user_id = c.user_id;
    v_balance := coalesce(v_balance, 0);

    -- Solde insuffisant → on met la campagne en pause (elle reprendra après recharge)
    IF v_balance < c.daily_budget_fcfa THEN
      UPDATE public.boost_campaigns
         SET status = 'paused', last_run_at = now()
       WHERE id = c.id;
      v_paused := v_paused + 1;
      CONTINUE;
    END IF;

    -- Débit du budget du jour
    UPDATE public.wallets
       SET balance_fcfa = balance_fcfa - c.daily_budget_fcfa, updated_at = now()
     WHERE user_id = c.user_id;

    INSERT INTO public.wallet_transactions (user_id, amount_fcfa, kind, label)
    VALUES (c.user_id, -c.daily_budget_fcfa, 'boost',
            'Boost quotidien — ' || c.daily_budget_fcfa || ' FCFA');

    -- La mise en avant couvre la journée : on prolonge l'annonce existante
    IF c.ad_id IS NULL THEN
      INSERT INTO public.ads (kind, product_id, starts_at, ends_at, active, weight)
      VALUES ('product', c.product_id, now(), now() + interval '1 day', true,
              public.boost_weight(c.daily_budget_fcfa))
      RETURNING id INTO v_ad;

      UPDATE public.boost_campaigns SET ad_id = v_ad WHERE id = c.id;
    ELSE
      UPDATE public.ads
         SET active = true,
             ends_at = greatest(coalesce(ends_at, now()), now()) + interval '1 day',
             weight = public.boost_weight(c.daily_budget_fcfa)
       WHERE id = c.ad_id;
    END IF;

    UPDATE public.boost_campaigns
       SET days_served = days_served + 1,
           total_spent_fcfa = total_spent_fcfa + c.daily_budget_fcfa,
           last_run_at = now()
     WHERE id = c.id;

    v_served := v_served + 1;
  END LOOP;

  RETURN json_build_object('ok', true, 'served', v_served, 'paused', v_paused,
                           'skipped', v_skipped, 'ran_at', now());
END;
$$;
REVOKE EXECUTE ON FUNCTION public.boost_run_daily() FROM PUBLIC, anon, authenticated;

-- ============================================================
-- CONTRÔLE : doit renvoyer true
-- ============================================================
SELECT pg_get_functiondef(p.oid) LIKE '%v_skipped%' AS journee_non_servie_non_facturee
FROM pg_proc p WHERE p.proname = 'boost_run_daily';


-- ############################################################################
-- PARTIE 5 / 5 — (OPTION) Mises en avant DEJA EN COURS : passer a 1 000 F/jour
-- A ne lancer QUE si vous acceptez que leur debit quotidien augmente tout de
-- suite. Les nouvelles mises en avant sont deja a 1 000 F/jour.
-- ############################################################################

-- UPDATE public.boost_campaigns SET daily_budget_fcfa = 1000 WHERE status = 'active';