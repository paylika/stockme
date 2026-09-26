-- ############################################################################
-- STOCKME — TOUT LE SQL EN ATTENTE, À COLLER D'UN SEUL COUP
-- Supabase -> SQL Editor -> New query -> coller TOUT ce fichier -> Run
--
-- 6 parties independantes, sans danger, relancables :
--   1. AVIS PRODUITS (etoiles + commentaires + photos)      -> INDISPENSABLE
--   2. BADGE : activer les vendeurs qui ont deja paye
--   3. DIFFUSION D'ANNONCES INTELLIGENTE (rotation equitable)
--   4. Ne pas facturer une journee qui n'a pas pu etre servie
--   5. DEMANDES D'ACHAT (« Je recherche ») : les acheteurs postent, les
--      fournisseurs repondent, l'acheteur choisit qui il contacte
--   6. (option) aligner les mises en avant en cours sur 1 000 F/jour
-- ############################################################################


-- ############################################################################
-- PARTIE 1 / 6 — AVIS PRODUITS
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
-- PARTIE 2 / 6 — BADGE FOURNISSEUR VERIFIE : ACTIVER CEUX QUI ONT PAYE
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
-- PARTIE 3 / 6 — DIFFUSION D'ANNONCES INTELLIGENTE
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
-- PARTIE 4 / 6 — ON NE FACTURE PAS UNE JOURNEE QUI N'A PAS PU ETRE SERVIE
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
-- PARTIE 5 / 6 — DEMANDES D'ACHAT (« Je recherche »)
-- ############################################################################
-- ============================================================
-- StockMe — DEMANDES D'ACHAT (« Je recherche »)
--
-- LE MANQUE QUE ÇA COMBLE
--   StockMe ne connaissait que l'OFFRE : un vendeur publie, un acheteur trouve.
--   Mais un acheteur qui cherche un produit ABSENT du site n'avait aucun moyen
--   de le dire — il partait, et on ne le revoyait jamais. Ici il poste sa
--   demande (quoi, combien, budget, ville), les fournisseurs qui l'ont
--   postulent, et l'acheteur choisit qui il contacte.
--
-- RÈGLES DE SÉCURITÉ (décidées avec le fondateur)
--   • L'acheteur ne laisse JAMAIS son numéro : les fournisseurs postulent, il
--     choisit. Son numéro n'apparaît dans aucune réponse.
--   • Tout numéro écrit dans le texte est masqué automatiquement.
--   • 3 demandes actives maximum par compte, 1 par jour.
--   • Pour répondre, il faut être un vrai vendeur (au moins 1 produit en ligne).
--   • Publication immédiate + bouton « Signaler » + masquage par l'admin.
--
-- Idempotent : peut être relancé sans effet de bord.
-- ============================================================


-- ============================================================
-- 1. Tables
-- ============================================================
CREATE TABLE IF NOT EXISTS public.buying_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  category text,
  quantity int,
  unit text NOT NULL DEFAULT 'pièces',
  budget_fcfa int,
  city text,
  country text,
  image_url text,
  ai_keywords text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'hidden')),
  responses_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 days'
);

CREATE INDEX IF NOT EXISTS buying_requests_open_idx
  ON public.buying_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS buying_requests_category_idx ON public.buying_requests(category);
CREATE INDEX IF NOT EXISTS buying_requests_city_idx ON public.buying_requests(city);

-- Un fournisseur répond UNE fois par demande.
CREATE TABLE IF NOT EXISTS public.request_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.buying_requests(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message text,
  price_fcfa int,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS request_responses_unique_idx
  ON public.request_responses (request_id, seller_id);

-- Signalements (faux, spam, concurrence déloyale…)
CREATE TABLE IF NOT EXISTS public.request_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.buying_requests(id) ON DELETE CASCADE,
  reporter_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS request_reports_unique_idx
  ON public.request_reports (request_id, reporter_id);

-- ============================================================
-- 2. Sécurité : lecture seule, et jamais en direct
--    Aucune policy d'écriture : tout passe par les fonctions ci-dessous.
-- ============================================================
ALTER TABLE public.buying_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS buying_requests_read ON public.buying_requests;
CREATE POLICY buying_requests_read ON public.buying_requests
  FOR SELECT USING (
    status <> 'hidden'
    OR user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
  );

-- ============================================================
-- 3. Publier une demande
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_buying_request(
  p_title text,
  p_description text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_quantity int DEFAULT NULL,
  p_unit text DEFAULT 'pièces',
  p_budget_fcfa int DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_country text DEFAULT NULL,
  p_image_url text DEFAULT NULL,
  p_ai_keywords text[] DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_title text;
  v_desc text;
  v_masked boolean := false;
  v_open int;
  v_today int;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Connexion requise'; END IF;

  v_title := btrim(coalesce(p_title, ''));
  v_desc := btrim(coalesce(p_description, ''));

  IF length(v_title) < 8 THEN
    RETURN json_build_object('ok', false, 'reason', 'title_too_short');
  END IF;
  IF length(v_title) > 120 THEN v_title := left(v_title, 120); END IF;
  IF length(v_desc) > 1200 THEN v_desc := left(v_desc, 1200); END IF;

  -- Un numéro de téléphone écrit dans le texte est MASQUÉ (les coordonnées
  -- passent par la plateforme : c'est ce qui protège l'acheteur du démarchage).
  IF v_title ~ '[0-9][0-9 .+-]{7,}[0-9]' OR v_desc ~ '[0-9][0-9 .+-]{7,}[0-9]' THEN
    v_masked := true;
    v_title := regexp_replace(v_title, '[0-9][0-9 .+-]{7,}[0-9]', '[numéro masqué]', 'g');
    v_desc := regexp_replace(v_desc, '[0-9][0-9 .+-]{7,}[0-9]', '[numéro masqué]', 'g');
  END IF;

  -- Garde-fous : 3 demandes actives, 1 publication par jour.
  SELECT count(*) INTO v_open FROM public.buying_requests
   WHERE user_id = v_uid AND status = 'open' AND expires_at > now();
  IF coalesce(v_open, 0) >= 3 THEN
    RETURN json_build_object('ok', false, 'reason', 'too_many');
  END IF;

  SELECT count(*) INTO v_today FROM public.buying_requests
   WHERE user_id = v_uid AND created_at >= date_trunc('day', now());
  IF coalesce(v_today, 0) >= 1 THEN
    RETURN json_build_object('ok', false, 'reason', 'one_per_day');
  END IF;

  INSERT INTO public.buying_requests (
    user_id, title, description, category, quantity, unit, budget_fcfa,
    city, country, image_url, ai_keywords
  )
  VALUES (
    v_uid, v_title, nullif(v_desc, ''), nullif(btrim(coalesce(p_category, '')), ''),
    nullif(greatest(coalesce(p_quantity, 0), 0), 0),
    coalesce(nullif(btrim(coalesce(p_unit, '')), ''), 'pièces'),
    nullif(greatest(coalesce(p_budget_fcfa, 0), 0), 0),
    nullif(btrim(coalesce(p_city, '')), ''), nullif(btrim(coalesce(p_country, '')), ''),
    nullif(btrim(coalesce(p_image_url, '')), ''), coalesce(p_ai_keywords, '{}')
  )
  RETURNING id INTO v_id;

  RETURN json_build_object('ok', true, 'id', v_id, 'masked', v_masked);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.create_buying_request(text, text, text, int, text, int, text, text, text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_buying_request(text, text, text, int, text, int, text, text, text, text[]) TO authenticated;

-- ============================================================
-- 4. Lister les demandes (public) — ou seulement les miennes
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_buying_requests(
  p_category text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_q text DEFAULT NULL,
  p_limit int DEFAULT 30,
  p_offset int DEFAULT 0,
  p_mine_only boolean DEFAULT false
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v json;
BEGIN
  SELECT coalesce(json_agg(row_to_json(t)), '[]'::json) INTO v FROM (
    SELECT
      r.id, r.title, r.description, r.category, r.quantity, r.unit, r.budget_fcfa,
      r.city, r.country, r.image_url, r.ai_keywords, r.status, r.responses_count,
      r.created_at,
      greatest(0, ceil(extract(epoch FROM (r.expires_at - now())) / 86400))::int AS jours_restants,
      (r.user_id = auth.uid()) AS mine,
      coalesce(nullif(pf.shop_name, ''), 'Acheteur StockMe') AS buyer_name,
      coalesce(pf.verified AND (pf.verified_until IS NULL OR pf.verified_until > now()), false) AS buyer_verified,
      EXISTS (
        SELECT 1 FROM public.request_responses rr
         WHERE rr.request_id = r.id AND rr.seller_id = auth.uid()
      ) AS already_responded
    FROM public.buying_requests r
    LEFT JOIN public.profiles pf ON pf.id = r.user_id
    WHERE (NOT coalesce(p_mine_only, false)
             AND r.status = 'open' AND r.expires_at > now()
           OR coalesce(p_mine_only, false) AND r.user_id = auth.uid())
      AND (p_category IS NULL OR r.category = p_category)
      AND (p_city IS NULL OR r.city = p_city)
      AND (p_q IS NULL OR r.title ILIKE '%' || p_q || '%'
           OR coalesce(r.description, '') ILIKE '%' || p_q || '%')
    ORDER BY r.created_at DESC
    LIMIT greatest(1, least(coalesce(p_limit, 30), 60))
    OFFSET greatest(coalesce(p_offset, 0), 0)
  ) t;
  RETURN v;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_buying_requests(text, text, text, int, int, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_buying_requests(text, text, text, int, int, boolean) TO anon, authenticated;

-- ============================================================
-- 5. Détail d'une demande : + réponses (visibles par l'acheteur seulement)
--    + produits qui existent DÉJÀ sur le site (la vente immédiate)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_buying_request_detail(p_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.buying_requests;
  v_mine boolean;
  v_admin boolean := public.has_role(auth.uid(), 'admin');
BEGIN
  SELECT * INTO r FROM public.buying_requests WHERE id = p_id;
  IF r.id IS NULL THEN RETURN json_build_object('ok', false, 'reason', 'not_found'); END IF;

  v_mine := (r.user_id = auth.uid());
  IF r.status = 'hidden' AND NOT (v_mine OR v_admin) THEN
    RETURN json_build_object('ok', false, 'reason', 'not_found');
  END IF;

  RETURN json_build_object(
    'ok', true,
    'request', json_build_object(
      'id', r.id, 'title', r.title, 'description', r.description, 'category', r.category,
      'quantity', r.quantity, 'unit', r.unit, 'budget_fcfa', r.budget_fcfa,
      'city', r.city, 'country', r.country, 'image_url', r.image_url,
      'ai_keywords', r.ai_keywords, 'status', r.status, 'responses_count', r.responses_count,
      'created_at', r.created_at,
      'jours_restants', greatest(0, ceil(extract(epoch FROM (r.expires_at - now())) / 86400))::int,
      'mine', v_mine,
      'buyer_name', (SELECT coalesce(nullif(pf.shop_name, ''), 'Acheteur StockMe') FROM public.profiles pf WHERE pf.id = r.user_id),
      'already_responded', EXISTS (
        SELECT 1 FROM public.request_responses rr WHERE rr.request_id = r.id AND rr.seller_id = auth.uid()
      )
    ),
    -- Coordonnées des fournisseurs : UNIQUEMENT pour l'acheteur (et l'admin).
    'responses', CASE WHEN v_mine OR v_admin THEN coalesce((
      SELECT json_agg(row_to_json(x)) FROM (
        SELECT rr.id, rr.seller_id, rr.message, rr.price_fcfa, rr.created_at,
               coalesce(nullif(pf.shop_name, ''), nullif(pf.full_name, ''), 'Fournisseur') AS seller_name,
               pf.whatsapp AS seller_whatsapp, pf.phone AS seller_phone, pf.city AS seller_city,
               coalesce(pf.verified AND (pf.verified_until IS NULL OR pf.verified_until > now()), false) AS seller_verified,
               (SELECT count(*) FROM public.products p
                 WHERE p.owner_id = rr.seller_id AND p.published = true) AS seller_products,
               coalesce((SELECT json_agg(json_build_object('id', p.id, 'name', p.name, 'image', p.images[1])
                          ORDER BY p.created_at DESC)
                           FROM (SELECT * FROM public.products p2
                                  WHERE p2.owner_id = rr.seller_id AND p2.published = true
                                  ORDER BY p2.created_at DESC LIMIT 3) p), '[]'::json) AS seller_top_products
        FROM public.request_responses rr
        LEFT JOIN public.profiles pf ON pf.id = rr.seller_id
        WHERE rr.request_id = r.id
        ORDER BY rr.created_at ASC
      ) x
    ), '[]'::json) ELSE '[]'::json END,
    -- Ce qui existe DÉJÀ sur le site : mieux que d'attendre une réponse.
    'suggestions', coalesce((
      SELECT json_agg(row_to_json(s)) FROM (
        SELECT p.id, p.name, p.price_fcfa, p.promo_price_fcfa, p.images, p.city, p.moq, p.owner_id
        FROM public.products p
        WHERE p.published = true AND p.sold_out = false
          AND (
            (r.category IS NOT NULL AND p.category = r.category)
            OR EXISTS (SELECT 1 FROM unnest(r.ai_keywords) k WHERE p.name ILIKE '%' || k || '%')
            OR p.name ILIKE '%' || split_part(r.title, ' ', 1) || '%'
          )
        ORDER BY p.created_at DESC
        LIMIT 6
      ) s
    ), '[]'::json)
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_buying_request_detail(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_buying_request_detail(uuid) TO anon, authenticated;

-- ============================================================
-- 6. Répondre à une demande (« Je l'ai »)
-- ============================================================
CREATE OR REPLACE FUNCTION public.respond_to_buying_request(
  p_request_id uuid,
  p_message text DEFAULT NULL,
  p_price_fcfa int DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_req public.buying_requests;
  v_products int;
  v_count int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Connexion requise'; END IF;

  SELECT * INTO v_req FROM public.buying_requests WHERE id = p_request_id;
  IF v_req.id IS NULL THEN RETURN json_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF v_req.user_id = v_uid THEN RETURN json_build_object('ok', false, 'reason', 'own_request'); END IF;
  IF v_req.status <> 'open' OR v_req.expires_at <= now() THEN
    RETURN json_build_object('ok', false, 'reason', 'closed');
  END IF;

  -- Il faut être un vrai vendeur : au moins un produit en ligne.
  SELECT count(*) INTO v_products
    FROM public.products WHERE owner_id = v_uid AND published = true;
  IF coalesce(v_products, 0) = 0 THEN
    RETURN json_build_object('ok', false, 'reason', 'no_products');
  END IF;

  IF EXISTS (SELECT 1 FROM public.request_responses WHERE request_id = p_request_id AND seller_id = v_uid) THEN
    RETURN json_build_object('ok', false, 'reason', 'already');
  END IF;

  INSERT INTO public.request_responses (request_id, seller_id, message, price_fcfa)
  VALUES (
    p_request_id, v_uid,
    nullif(btrim(coalesce(p_message, '')), ''),
    nullif(greatest(coalesce(p_price_fcfa, 0), 0), 0)
  );

  UPDATE public.buying_requests
     SET responses_count = responses_count + 1, updated_at = now()
   WHERE id = p_request_id
   RETURNING responses_count INTO v_count;

  RETURN json_build_object('ok', true, 'count', coalesce(v_count, 1));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.respond_to_buying_request(uuid, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_to_buying_request(uuid, text, int) TO authenticated;

-- ============================================================
-- 7. Clôturer (« j'ai trouvé »), signaler, modérer
-- ============================================================
CREATE OR REPLACE FUNCTION public.close_buying_request(p_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Connexion requise'; END IF;
  UPDATE public.buying_requests
     SET status = 'closed', updated_at = now()
   WHERE id = p_id AND (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
  RETURN json_build_object('ok', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.close_buying_request(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.close_buying_request(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.report_buying_request(p_id uuid, p_reason text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Connexion requise'; END IF;
  INSERT INTO public.request_reports (request_id, reporter_id, reason)
  VALUES (p_id, auth.uid(), left(coalesce(p_reason, ''), 300))
  ON CONFLICT (request_id, reporter_id) DO NOTHING;
  RETURN json_build_object('ok', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.report_buying_request(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_buying_request(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_buying_request_status(p_id uuid, p_status text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Accès réservé aux administrateurs';
  END IF;
  IF p_status NOT IN ('open', 'closed', 'hidden') THEN
    RAISE EXCEPTION 'Statut inconnu';
  END IF;
  UPDATE public.buying_requests SET status = p_status, updated_at = now() WHERE id = p_id;
  RETURN json_build_object('ok', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_set_buying_request_status(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_buying_request_status(uuid, text) TO authenticated;

-- Liste admin : signalements + demandes masquées
CREATE OR REPLACE FUNCTION public.admin_buying_requests()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v json;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Accès réservé aux administrateurs';
  END IF;
  SELECT coalesce(json_agg(row_to_json(t)), '[]'::json) INTO v FROM (
    SELECT r.id, r.title, r.description, r.category, r.quantity, r.unit, r.budget_fcfa,
           r.city, r.status, r.responses_count, r.created_at,
           coalesce(nullif(pf.shop_name, ''), nullif(pf.full_name, ''), '—') AS demandeur,
           pf.whatsapp AS demandeur_whatsapp, pf.phone AS demandeur_phone,
           (SELECT count(*) FROM public.request_reports rp WHERE rp.request_id = r.id) AS signalements
    FROM public.buying_requests r
    LEFT JOIN public.profiles pf ON pf.id = r.user_id
    ORDER BY (SELECT count(*) FROM public.request_reports rp WHERE rp.request_id = r.id) DESC,
             r.created_at DESC
    LIMIT 100
  ) t;
  RETURN v;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_buying_requests() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_buying_requests() TO authenticated;

-- ============================================================
-- 8. Notification : combien de demandes correspondent à MES catégories ?
--    (c'est le compteur affiché dans le menu)
-- ============================================================
CREATE OR REPLACE FUNCTION public.count_matching_requests()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_cats text[];
  v_city text;
  v_n int;
BEGIN
  IF v_uid IS NULL THEN RETURN 0; END IF;

  SELECT array_agg(DISTINCT p.category), (array_agg(p.city ORDER BY p.created_at DESC))[1]
    INTO v_cats, v_city
    FROM public.products p
   WHERE p.owner_id = v_uid AND p.published = true;

  IF v_cats IS NULL AND v_city IS NULL THEN RETURN 0; END IF;

  SELECT count(*) INTO v_n
    FROM public.buying_requests r
   WHERE r.status = 'open'
     AND r.expires_at > now()
     AND r.user_id <> v_uid
     AND NOT EXISTS (
       SELECT 1 FROM public.request_responses rr
        WHERE rr.request_id = r.id AND rr.seller_id = v_uid
     )
     AND (
       (v_cats IS NOT NULL AND r.category = ANY(v_cats))
       OR (v_city IS NOT NULL AND r.city = v_city)
     );

  RETURN coalesce(v_n, 0);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.count_matching_requests() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_matching_requests() TO authenticated;


-- ============================================================
-- CONTRÔLES (doivent renvoyer true)
-- ============================================================
SELECT
  to_regclass('public.buying_requests') IS NOT NULL AS table_demandes,
  to_regclass('public.request_responses') IS NOT NULL AS table_reponses,
  to_regclass('public.request_reports') IS NOT NULL AS table_signalements,
  (SELECT count(*) FROM pg_proc WHERE proname IN (
     'create_buying_request', 'get_buying_requests', 'get_buying_request_detail',
     'respond_to_buying_request', 'close_buying_request', 'report_buying_request',
     'admin_set_buying_request_status', 'admin_buying_requests', 'count_matching_requests'
   )) = 9 AS les_9_fonctions;

-- Voir les demandes publiées
-- select title, category, quantity, unit, budget_fcfa, city, responses_count, status
--   from public.buying_requests order by created_at desc;


-- ############################################################################
-- PARTIE 6 / 6 — (OPTION) Mises en avant DEJA EN COURS : passer a 1 000 F/jour
-- A ne lancer QUE si vous acceptez que leur debit quotidien augmente tout de
-- suite. Les nouvelles mises en avant sont deja a 1 000 F/jour.
-- ############################################################################

-- UPDATE public.boost_campaigns SET daily_budget_fcfa = 1000 WHERE status = 'active';