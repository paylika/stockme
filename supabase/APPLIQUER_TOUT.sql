-- ============================================================
-- StockMe - A COLLER EN UNE SEULE FOIS (Supabase -> SQL Editor -> Run)
-- Regroupe tous les scripts encore en attente. Relancable sans risque.
-- Inclut payment_mark_paid (signature 5 arguments) : sans elle, un
-- paiement par carte n'est jamais credite et le badge n'est pas pose.
-- ============================================================

-- ============================================================
-- >>> 20260731000000_seller_plans.sql
-- ============================================================
-- ============================================================
-- StockMe — Offre du vendeur (Gratuit / Vérifié / PRO)
--
-- On mémorise l'offre en cours dans `profiles.plan` pour pouvoir :
--   • afficher « votre offre actuelle » et proposer la bonne montée ;
--   • mesurer le taux de conversion (combien de gratuits → PRO) ;
--   • n'appliquer les avantages (photos, quota, tarif de boost) qu'aux bons.
--
-- L'offre est décidée par le PAIEMENT ou par l'ADMIN, jamais par le client.
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'gratuit';

-- Contrainte souple : on accepte uniquement nos trois offres.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_plan_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_plan_check CHECK (plan IN ('gratuit', 'verifie', 'pro'));
  END IF;
END $$;

-- ------------------------------------------------------------------
-- Vérification par l'admin → offre « verifie » + bonus 72 h
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_seller_verified(p_user_id uuid, p_months int DEFAULT 12)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_until timestamptz; v_bonus json;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Accès réservé aux administrateurs';
  END IF;

  v_until := CASE WHEN p_months IS NULL THEN NULL ELSE now() + (p_months || ' months')::interval END;

  UPDATE public.profiles
     SET verified = true,
         verified_at = now(),
         verified_until = v_until,
         -- On ne rétrograde jamais un compte PRO qui se fait vérifier à la main.
         plan = CASE WHEN plan = 'pro' THEN 'pro' ELSE 'verifie' END
   WHERE id = p_user_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Utilisateur introuvable'; END IF;

  v_bonus := public.grant_verification_bonus(p_user_id, 1500);
  RETURN json_build_object('ok', true, 'verified', true, 'verified_until', v_until, 'bonus', v_bonus);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_set_seller_verified(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_seller_verified(uuid, int) TO authenticated;

-- ------------------------------------------------------------------
-- Paiement d'un abonnement → active l'offre (et le badge) automatiquement
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.payment_mark_paid(
  p_provider text,
  p_provider_ref text,
  p_amount int DEFAULT NULL,
  p_payload jsonb DEFAULT NULL,
  p_subscription_ref text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_intent public.payment_intents;
  v_days int;
  v_product uuid;
  v_floor int;
  v_plan text;
  v_bonus json;
BEGIN
  SELECT * INTO v_intent FROM public.payment_intents
  WHERE provider = p_provider AND provider_ref = p_provider_ref
  FOR UPDATE;

  IF v_intent.id IS NULL THEN RETURN json_build_object('ok', false, 'reason', 'intent_not_found'); END IF;
  IF v_intent.status = 'paid' THEN RETURN json_build_object('ok', true, 'reason', 'already_paid'); END IF;

  v_floor := greatest(50, (v_intent.amount_fcfa * 0.9)::int);
  IF p_amount IS NOT NULL AND p_amount > 0 AND p_amount < v_floor THEN
    RETURN json_build_object('ok', false, 'reason', 'amount_mismatch',
                             'expected', v_intent.amount_fcfa, 'received', p_amount, 'floor', v_floor);
  END IF;

  UPDATE public.payment_intents
     SET status = 'paid',
         paid_at = now(),
         provider_payload = coalesce(p_payload, provider_payload),
         metadata = CASE WHEN p_subscription_ref IS NOT NULL
                         THEN metadata || jsonb_build_object('subscription_ref', p_subscription_ref)
                         ELSE metadata END
   WHERE id = v_intent.id;

  -- Rechargement du portefeuille
  IF v_intent.purpose = 'wallet_topup' THEN
    INSERT INTO public.wallets (user_id, balance_fcfa) VALUES (v_intent.user_id, v_intent.amount_fcfa)
    ON CONFLICT (user_id) DO UPDATE
      SET balance_fcfa = public.wallets.balance_fcfa + v_intent.amount_fcfa, updated_at = now();

    INSERT INTO public.wallet_transactions (user_id, amount_fcfa, kind, label)
    VALUES (v_intent.user_id, v_intent.amount_fcfa, 'topup',
            'Rechargement ' || v_intent.amount_fcfa || ' FCFA');
  END IF;

  -- Abonnement / badge
  IF v_intent.purpose = 'subscription' THEN
    v_days := coalesce((v_intent.metadata->>'days')::int, 365);
    v_plan := coalesce(nullif(v_intent.metadata->>'plan', ''), 'verifie');
    IF v_plan NOT IN ('verifie', 'pro') THEN v_plan := 'verifie'; END IF;

    UPDATE public.profiles
       SET verified = true,
           verified_at = coalesce(verified_at, now()),
           verified_until = greatest(coalesce(verified_until, now()), now()) + (v_days || ' days')::interval,
           plan = v_plan
     WHERE id = v_intent.user_id;

    INSERT INTO public.wallet_transactions (user_id, amount_fcfa, kind, label)
    VALUES (v_intent.user_id, -v_intent.amount_fcfa, 'subscription',
            CASE WHEN v_plan = 'pro' THEN 'Abonnement StockMe PRO' ELSE 'Abonnement fournisseur vérifié' END
            || ' (' || v_days || ' jours)');

    -- 72 h de mise en avant offertes à la première souscription
    IF v_plan = 'pro' THEN
      v_bonus := public.grant_verification_bonus(v_intent.user_id, 1500);
    ELSE
      v_bonus := public.grant_verification_bonus(v_intent.user_id, 1500);
    END IF;
  END IF;

  -- Achat de boost
  IF v_intent.purpose = 'boost' THEN
    v_days := coalesce((v_intent.metadata->>'days')::int, 7);
    v_product := nullif(v_intent.metadata->>'product_id', '')::uuid;
    IF v_product IS NULL THEN RETURN json_build_object('ok', false, 'reason', 'missing_product'); END IF;

    INSERT INTO public.boost_campaigns (user_id, product_id, daily_budget_fcfa)
    VALUES (v_intent.user_id, v_product, greatest(100, v_intent.amount_fcfa / greatest(v_days, 1)));
  END IF;

  RETURN json_build_object('ok', true, 'purpose', v_intent.purpose, 'amount', v_intent.amount_fcfa, 'plan', v_plan);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.payment_mark_paid(text, text, int, jsonb, text) FROM PUBLIC, anon, authenticated;


-- ============================================================
-- >>> 20260807000000_ai_search_foundation.sql
-- ============================================================
-- ============================================================
-- StockMe — IA, étape 1 : enrichissement des fiches + journal
--
-- À coller dans Supabase → SQL Editor.
-- Ce script ne change RIEN au comportement actuel du site : il ajoute
-- seulement les rangements dont l'IA a besoin.
--
--   1. Trois colonnes sur `products` pour les mots-clés et attributs que
--      DeepSeek génère à partir du nom, de la catégorie et de la description.
--      C'est le socle : sans vocabulaire, aucune recherche intelligente n'est
--      bonne (beaucoup de fiches n'ont qu'un nom court).
--   2. Le journal des appels IA : coût, latence, qualité — et le compteur
--      anti-abus (plafonds par utilisateur et par jour).
--
-- Idempotent : peut être relancé sans effet de bord.
-- ============================================================

-- ------------------------------------------------------------------
-- 1. Colonnes d'enrichissement
-- ------------------------------------------------------------------
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS ai_keywords text[];
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS ai_attrs jsonb;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS ai_enriched_at timestamptz;

-- Index pour retrouver vite un produit par ses mots-clés.
CREATE INDEX IF NOT EXISTS products_ai_keywords_idx ON public.products USING gin (ai_keywords);

-- ------------------------------------------------------------------
-- 2. Journal + quotas des appels IA
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ok boolean NOT NULL DEFAULT true,
  error text,
  latency_ms int NOT NULL DEFAULT 0,
  input_tokens int NOT NULL DEFAULT 0,
  output_tokens int NOT NULL DEFAULT 0,
  cached_tokens int NOT NULL DEFAULT 0,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_calls_kind_user_day_idx ON public.ai_calls (kind, user_id, created_at DESC);

ALTER TABLE public.ai_calls ENABLE ROW LEVEL SECURITY;

-- Aucune lecture publique : seul le serveur écrit (clé de service).
-- Les administrateurs peuvent consulter les chiffres.
DROP POLICY IF EXISTS ai_calls_admin_read ON public.ai_calls;
CREATE POLICY ai_calls_admin_read ON public.ai_calls
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- CONTRÔLES
-- ============================================================
-- A) Les colonnes existent-elles ?
-- select column_name from information_schema.columns
--  where table_name = 'products' and column_name like 'ai_%';
--
-- B) Combien de fiches enrichies ? (0 au départ, c'est normal)
-- select count(*) filter (where ai_enriched_at is not null) as enrichies,
--        count(*) as total
--   from public.products where published = true;
--
-- C) Coût des appels IA (après quelques utilisations)
-- select kind, count(*), sum(input_tokens) as tokens_entree, sum(output_tokens) as tokens_sortie,
--        round(avg(latency_ms)) as latence_moyenne_ms
--   from public.ai_calls group by kind order by 2 desc;


-- ============================================================
-- >>> 20260808000000_ai_search.sql
-- ============================================================
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


-- ============================================================
-- >>> 20260810000000_price_tiers.sql
-- ============================================================
-- ============================================================
-- StockMe — Paliers de prix par quantité (vente en gros)
--
-- À coller dans Supabase → SQL Editor.
--
-- Les acheteurs veulent savoir « combien si j'en prends plus ». On stocke donc
-- sur chaque produit une liste de paliers :
--
--   [ { "from": 10,  "to": 99,   "price": 1000 },
--     { "from": 100, "to": 499,  "price": 800  },
--     { "from": 500, "to": null, "price": 650  } ]
--
-- `to = null` signifie « et plus ». C'est exactement le modèle d'Alibaba.
-- Un produit sans palier (price_tiers NULL) garde son prix unique habituel :
-- rien ne change pour les fiches existantes.
--
-- Idempotent : peut être relancé sans effet de bord.
-- ============================================================

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS price_tiers jsonb;

-- Garde-fou minimal : ce doit être un tableau (la cohérence fine — quantités
-- croissantes, prix décroissants — est vérifiée par l'application).
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_price_tiers_is_array;
ALTER TABLE public.products
  ADD CONSTRAINT products_price_tiers_is_array
  CHECK (price_tiers IS NULL OR jsonb_typeof(price_tiers) = 'array');

-- ============================================================
-- CONTRÔLES
-- ============================================================
-- A) La colonne existe ?
-- select column_name, data_type from information_schema.columns
--  where table_name = 'products' and column_name = 'price_tiers';
--
-- B) Voir les paliers déjà saisis
-- select name, moq, price_fcfa, promo_price_fcfa, price_tiers
--   from public.products
--  where price_tiers is not null
--  limit 20;


-- ============================================================
-- >>> 20260811000000_publication_limits.sql
-- ============================================================
-- ============================================================
-- StockMe — Nouvelles règles de publication (simples et identiques pour tous)
--
--   1. 20 produits publiés OFFERTS (au lieu de 10) ;
--   2. 10 photos par produit pour TOUT LE MONDE, compte gratuit compris ;
--   3. au-delà de 20 produits : 500 F par publication, prélevés du SOLDE ;
--   4. la mise en avant reste à 500 F/jour pour tout le monde.
--
-- POURQUOI dans la base : le navigateur ne doit jamais décider si une
-- publication est gratuite ou payante. Le débit est fait ICI, dans la même
-- transaction que la publication : si la publication échoue, le débit est
-- annulé automatiquement (aucun vendeur ne paie pour rien).
--
-- Le vendeur au solde insuffisant reçoit un message clair au lieu d'une erreur
-- technique : il recharge et republie.
--
-- Idempotent : peut être relancé sans effet de bord.
-- ============================================================

-- ------------------------------------------------------------------
-- 0. Le journal du portefeuille accepte le motif « publication »
-- ------------------------------------------------------------------
ALTER TABLE public.wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_kind_check;
ALTER TABLE public.wallet_transactions
  ADD CONSTRAINT wallet_transactions_kind_check
  CHECK (kind IN ('topup', 'boost', 'subscription', 'refund', 'adjustment', 'publication'));

-- ------------------------------------------------------------------
-- 1. Quotas et prix de publication
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.products_guard_limits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c_max_images   constant int := 10;   -- photos par produit, pour tout le monde
  c_free_products constant int := 20;  -- publications offertes
  c_extra_price  constant int := 500;  -- prix d'une publication supplémentaire
  v_count int;
  v_balance int;
BEGIN
  -- Les administrateurs ne sont jamais bloqués (modération).
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  -- ---- Photos : 10 maximum, pour tout le monde ----
  IF coalesce(array_length(NEW.images, 1), 0) > c_max_images THEN
    RAISE EXCEPTION 'Maximum % photos par produit.', c_max_images;
  END IF;

  -- ---- Publications : 20 offertes, puis 500 F prélevés du solde ----
  -- On ne facture que les VRAIES publications : insertion d'un produit publié,
  -- ou passage de « masqué » à « en ligne ».
  IF TG_OP = 'INSERT' OR (NEW.published = true AND coalesce(OLD.published, false) = false) THEN

    SELECT count(*) INTO v_count
      FROM public.products
     WHERE owner_id = NEW.owner_id
       AND published = true
       AND id <> NEW.id;

    IF coalesce(v_count, 0) >= c_free_products THEN
      SELECT coalesce(balance_fcfa, 0) INTO v_balance
        FROM public.wallets WHERE user_id = NEW.owner_id;
      v_balance := coalesce(v_balance, 0);

      IF v_balance < c_extra_price THEN
        RAISE EXCEPTION
          'Vous avez atteint vos % produits publiés offerts. Chaque publication supplémentaire coûte % FCFA : rechargez votre solde (disponible : % FCFA).',
          c_free_products, c_extra_price, v_balance;
      END IF;

      -- Débit du prix de la publication (annulé si la publication échoue).
      UPDATE public.wallets
         SET balance_fcfa = balance_fcfa - c_extra_price, updated_at = now()
       WHERE user_id = NEW.owner_id;

      INSERT INTO public.wallet_transactions (user_id, amount_fcfa, kind, label)
      VALUES (NEW.owner_id, -c_extra_price, 'publication',
              'Publication supplémentaire — ' || c_extra_price || ' FCFA');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.products_guard_limits() FROM PUBLIC;

-- ============================================================
-- CONTRÔLES
-- ============================================================
-- A) Les nouvelles limites sont-elles en place ?
-- select pg_get_functiondef(p.oid) like '%c_free_products constant int := 20%' as limite_20_ok,
--        pg_get_functiondef(p.oid) like '%c_extra_price  constant int := 500%' as prix_500_ok
--   from pg_proc p where p.proname = 'products_guard_limits';
--
-- B) Des vendeurs ont-ils DÉJÀ plus de 20 produits publiés ?
--    (utile à savoir avant d'annoncer la règle : eux ne paieront que pour de
--     nouvelles publications, les produits déjà en ligne ne sont jamais facturés)
-- select owner_id, count(*) as produits_en_ligne
--   from public.products where published = true
--  group by owner_id having count(*) > 20 order by 2 desc;


-- ============================================================
-- >>> 20260805000000_publish_requires_photo.sql
-- ============================================================
-- ============================================================
-- StockMe — Une fiche sans photo ne peut plus être publiée
--
-- POURQUOI : 7 produits étaient visibles dans le catalogue avec une carte
-- vide (aucune photo enregistrée). Les fichiers n'existaient même pas dans le
-- stockage : l'envoi des photos avait échoué et le produit était publié quand
-- même. Une carte vide fait fuir l'acheteur et abîme la confiance.
--
-- CE QUE FAIT CE SCRIPT :
--   1. Interdit `published = true` sans au moins 1 photo (garde-fou côté base,
--      impossible à contourner par le navigateur). Les administrateurs restent
--      libres, comme pour les autres limites.
--   2. Repasse en « masqué » les fiches déjà publiées sans photo. Elles
--      réapparaîtront dès que le vendeur ajoute une photo et remet en ligne.
--
-- Idempotent : peut être collé plusieurs fois sans effet de bord.
-- ============================================================

-- ------------------------------------------------------------------
-- 1. Garde-fou : pas de publication sans photo
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.products_require_photo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Les administrateurs ne sont jamais bloqués (modération).
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  IF coalesce(NEW.published, false)
     AND coalesce(array_length(NEW.images, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Ajoutez au moins 1 photo avant de mettre ce produit en ligne.';
  END IF;

  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.products_require_photo() FROM PUBLIC;

DROP TRIGGER IF EXISTS products_require_photo ON public.products;
CREATE TRIGGER products_require_photo
  BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.products_require_photo();

-- ------------------------------------------------------------------
-- 2. On masque les fiches déjà publiées sans photo
--    (elles restent dans le tableau de bord du vendeur, avec le rappel
--     « Photo manquante — ajoutez-en une »)
-- ------------------------------------------------------------------
UPDATE public.products
   SET published = false
 WHERE published = true
   AND coalesce(array_length(images, 1), 0) = 0;

-- ------------------------------------------------------------------
-- 3. Contrôle : doit renvoyer 0
-- ------------------------------------------------------------------
-- select count(*) as fiches_publiees_sans_photo
--   from public.products
--  where published = true and coalesce(array_length(images, 1), 0) = 0;


-- ============================================================
-- >>> 20260806000000_boost_delivery_fixes.sql
-- ============================================================
-- ============================================================
-- StockMe — La mise en avant payée est réellement servie
--
-- POURQUOI CE SCRIPT
-- Un vendeur a payé un boost et voyait « 3 fiche vue » mais « 0 vue annonce ».
-- Diagnostic : `get_active_ads()` et `get_sponsored_products()` renvoyaient 0,
-- c'est-à-dire qu'AUCUNE annonce n'était servie. Deux causes possibles, les
-- deux traitées ici :
--
--   1. Quand un vendeur clique « Reprendre » sur un boost en pause, la fonction
--      ne remettait PAS l'annonce en service : l'annonce restait inactive et
--      expirée → le vendeur croyait être remis en avant, mais rien n'était
--      diffusé (et son solde n'était même plus débité).
--   2. Si la tâche quotidienne n'est pas déclenchée, l'annonce expire au bout
--      de 24 h alors que la campagne reste « active » : la mise en avant
--      s'arrête en silence.
--
-- Ce script : (1) répare « Reprendre », (2) remet en service les annonces des
-- campagnes actives ET financées, (3) empêche le vendeur de gonfler ses propres
-- chiffres. Idempotent : relançable sans effet de bord.
-- ============================================================

-- ------------------------------------------------------------------
-- 1. « Reprendre » remet vraiment l'annonce en ligne
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.boost_set_status(p_campaign_id uuid, p_status text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_c public.boost_campaigns;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Connexion requise'; END IF;
  IF p_status NOT IN ('active', 'paused', 'ended') THEN RAISE EXCEPTION 'Statut invalide'; END IF;

  SELECT * INTO v_c FROM public.boost_campaigns
  WHERE id = p_campaign_id AND user_id = auth.uid() FOR UPDATE;

  IF v_c.id IS NULL THEN RAISE EXCEPTION 'Campagne introuvable'; END IF;

  -- Reprise : il faut du solde
  IF p_status = 'active' THEN
    IF coalesce((SELECT balance_fcfa FROM public.wallets WHERE user_id = auth.uid()), 0) < v_c.daily_budget_fcfa THEN
      RETURN json_build_object('ok', false, 'reason', 'insufficient_balance', 'needed', v_c.daily_budget_fcfa);
    END IF;
  END IF;

  UPDATE public.boost_campaigns SET status = p_status WHERE id = p_campaign_id;

  IF v_c.ad_id IS NOT NULL AND p_status <> 'active' THEN
    -- Pause / arrêt : l'annonce cesse immédiatement.
    UPDATE public.ads SET active = false, ends_at = least(coalesce(ends_at, now()), now()) WHERE id = v_c.ad_id;
  END IF;

  IF v_c.ad_id IS NOT NULL AND p_status = 'active' THEN
    -- CORRECTIF : on REMET l'annonce en service (avant, elle restait inactive
    -- et expirée : le vendeur payait pour rien).
    UPDATE public.ads
       SET active = true,
           starts_at = least(coalesce(starts_at, now()), now()),
           ends_at = greatest(coalesce(ends_at, now()), now()) + interval '1 day',
           weight = public.boost_weight(v_c.daily_budget_fcfa)
     WHERE id = v_c.ad_id;
  END IF;

  RETURN json_build_object('ok', true, 'status', p_status);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.boost_set_status(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.boost_set_status(uuid, text) TO authenticated;

-- ------------------------------------------------------------------
-- 2. On remet en service les annonces des campagnes actives et financées
--    (répare les boosts déjà payés dont l'annonce était morte)
-- ------------------------------------------------------------------
UPDATE public.ads a
   SET active = true,
       starts_at = least(coalesce(a.starts_at, now()), now()),
       ends_at = greatest(coalesce(a.ends_at, now()), now()) + interval '1 day',
       weight = public.boost_weight(
         (SELECT c.daily_budget_fcfa FROM public.boost_campaigns c WHERE c.ad_id = a.id LIMIT 1)
       )
 WHERE a.kind = 'product'
   AND EXISTS (
     SELECT 1
       FROM public.boost_campaigns c
       JOIN public.wallets w ON w.user_id = c.user_id
      WHERE c.ad_id = a.id
        AND c.status = 'active'
        AND coalesce(w.balance_fcfa, 0) >= c.daily_budget_fcfa
   );

-- ------------------------------------------------------------------
-- 3. Le vendeur ne compte pas dans ses propres chiffres
--    (ni lui, ni les administrateurs)
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_ad_event(p_ad_id uuid, p_event text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_owner uuid;
BEGIN
  IF p_event NOT IN ('impression', 'click') THEN
    RETURN;
  END IF;

  -- Propriétaire du produit mis en avant (NULL pour une annonce sans produit).
  SELECT p.owner_id INTO v_owner
    FROM public.ads a
    JOIN public.products p ON p.id = a.product_id
   WHERE a.id = p_ad_id;

  -- Le propriétaire du produit (et les admins) ne gonflent pas les statistiques.
  IF auth.uid() IS NOT NULL AND auth.uid() = v_owner THEN
    RETURN;
  END IF;
  IF auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin') THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.ads a
    WHERE a.id = p_ad_id
      AND a.active = true
      AND a.starts_at <= now()
      AND (a.ends_at IS NULL OR a.ends_at >= now())
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.ad_events (ad_id, event_type) VALUES (p_ad_id, p_event);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.log_ad_event(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_ad_event(uuid, text) TO anon, authenticated;

-- ------------------------------------------------------------------
-- 4. Réparation automatique, côté vendeur
--
--    Appelée quand le vendeur ouvre son portefeuille. Si une campagne est
--    ACTIVE et FINANCÉE mais que son annonce n'est plus servie (annonce
--    expirée, journée manquée par la tâche quotidienne), on la remet en
--    service jusqu'à la fin de la journée. Aucun débit : la journée est déjà
--    payée. Le vendeur ne paie donc plus pour une mise en avant morte.
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.boost_self_heal()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_fixed int := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Connexion requise'; END IF;

  UPDATE public.ads a
     SET active = true,
         starts_at = least(coalesce(a.starts_at, now()), now()),
         ends_at = greatest(coalesce(a.ends_at, now()), date_trunc('day', now()) + interval '1 day'),
         weight = public.boost_weight(c.daily_budget_fcfa)
    FROM public.boost_campaigns c
    JOIN public.wallets w ON w.user_id = c.user_id
   WHERE c.ad_id = a.id
     AND c.user_id = v_uid
     AND c.status = 'active'
     AND coalesce(w.balance_fcfa, 0) >= c.daily_budget_fcfa
     AND (a.active = false OR a.ends_at IS NULL OR a.ends_at < now());

  GET DIAGNOSTICS v_fixed = ROW_COUNT;
  RETURN json_build_object('ok', true, 'repaired', v_fixed);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.boost_self_heal() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.boost_self_heal() TO authenticated;

-- ============================================================
-- CONTRÔLES À LANCER APRÈS (copier les résultats)
-- ============================================================
-- A) Y a-t-il une annonce servie en ce moment ? (doit renvoyer ≥ 1 si un boost tourne)
-- select a.id, a.kind, a.active, a.starts_at, a.ends_at, p.name
--   from public.ads a left join public.products p on p.id = a.product_id
--  where a.kind = 'product' and a.active = true
--    and a.starts_at <= now() and (a.ends_at is null or a.ends_at >= now());
--
-- B) État des campagnes et solde du vendeur
-- select c.id, c.status, c.daily_budget_fcfa, c.days_served, c.total_spent_fcfa,
--        a.active as annonce_active, a.ends_at as annonce_fin,
--        (select balance_fcfa from public.wallets w where w.user_id = c.user_id) as solde
--   from public.boost_campaigns c
--   left join public.ads a on a.id = c.ad_id
--  order by c.created_at desc
--  limit 20;
--
-- C) La tâche quotidienne est-elle planifiée ? (si la liste est vide → à créer)
-- select jobid, schedule, command, active from cron.job;


-- ============================================================
-- >>> 20260812000000_badge_on_sponsored.sql
-- ============================================================
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
