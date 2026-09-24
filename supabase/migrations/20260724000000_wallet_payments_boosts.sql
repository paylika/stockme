-- ============================================================
-- StockMe — Portefeuille, paiements et boosts quotidiens
--
--   Modèle « Facebook Ads » adapté au mobile money :
--     1. Le vendeur RECHARGE son solde (Wave / Orange Money / carte).
--     2. Chaque jour, la plateforme DÉDUIT le budget du boost et met
--        le produit en avant (table ads déjà existante).
--     3. Solde épuisé → le boost s'arrête tout seul.
--
--   Un seul paiement par mois → du revenu quotidien, sans relance.
--
--   Tous les fournisseurs de paiement cohabitent (unitechpay, stripe,
--   paydunya…) : une table, un webhook par fournisseur.
-- ============================================================

-- ------------------------------------------------------------------
-- 1. Portefeuille (solde + journal des mouvements)
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wallets (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance_fcfa int NOT NULL DEFAULT 0 CHECK (balance_fcfa >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_fcfa int NOT NULL,               -- positif = crédit, négatif = débit
  kind text NOT NULL CHECK (kind IN ('topup', 'boost', 'subscription', 'refund', 'adjustment')),
  label text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wallet_tx_user_idx ON public.wallet_transactions(user_id, created_at DESC);

ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

-- Lecture par le propriétaire et par les admins (aucune écriture directe :
-- tout passe par les fonctions ci-dessous).
DROP POLICY IF EXISTS "Wallet read own" ON public.wallets;
CREATE POLICY "Wallet read own" ON public.wallets FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Wallet tx read own" ON public.wallet_transactions;
CREATE POLICY "Wallet tx read own" ON public.wallet_transactions FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- ------------------------------------------------------------------
-- 2. Paiements (tous fournisseurs confondus)
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('wallet_topup', 'boost', 'subscription')),
  amount_fcfa int NOT NULL CHECK (amount_fcfa > 0),
  provider text NOT NULL,                  -- unitechpay | stripe | paydunya | cinetpay…
  method text,                             -- wave | orange_money | card
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'failed', 'expired', 'cancelled')),
  provider_ref text,
  checkout_url text,
  provider_payload jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);
CREATE INDEX IF NOT EXISTS payment_intents_user_idx ON public.payment_intents(user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS payment_intents_ref_idx
  ON public.payment_intents(provider, provider_ref) WHERE provider_ref IS NOT NULL;

ALTER TABLE public.payment_intents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Payment read own" ON public.payment_intents;
CREATE POLICY "Payment read own" ON public.payment_intents FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- ------------------------------------------------------------------
-- 3. Campagnes de boost (consommation quotidienne du solde)
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.boost_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  daily_budget_fcfa int NOT NULL DEFAULT 500 CHECK (daily_budget_fcfa >= 100),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'ended')),
  ad_id uuid REFERENCES public.ads(id) ON DELETE SET NULL,
  days_served int NOT NULL DEFAULT 0,
  total_spent_fcfa int NOT NULL DEFAULT 0,
  last_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS boost_campaigns_user_idx ON public.boost_campaigns(user_id, status);
CREATE INDEX IF NOT EXISTS boost_campaigns_product_idx ON public.boost_campaigns(product_id);

ALTER TABLE public.boost_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Boost read own" ON public.boost_campaigns;
CREATE POLICY "Boost read own" ON public.boost_campaigns FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- ------------------------------------------------------------------
-- 4. Créer une intention de paiement (appelée par le vendeur)
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.payment_create_intent(
  p_purpose text,
  p_amount int,
  p_provider text,
  p_method text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Connexion requise';
  END IF;
  IF p_amount IS NULL OR p_amount < 100 THEN
    RAISE EXCEPTION 'Montant minimum : 100 FCFA';
  END IF;

  INSERT INTO public.payment_intents (user_id, purpose, amount_fcfa, provider, method, metadata)
  VALUES (auth.uid(), p_purpose, p_amount, p_provider, p_method, coalesce(p_metadata, '{}'::jsonb))
  RETURNING id INTO v_id;

  RETURN json_build_object('intent_id', v_id, 'amount_fcfa', p_amount, 'purpose', p_purpose);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.payment_create_intent(text, int, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.payment_create_intent(text, int, text, text, jsonb) TO authenticated;

-- Enregistre l'URL de paiement renvoyée par le fournisseur
CREATE OR REPLACE FUNCTION public.payment_attach_checkout(
  p_intent_id uuid,
  p_provider_ref text,
  p_checkout_url text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.payment_intents
     SET provider_ref = p_provider_ref,
         checkout_url = p_checkout_url
   WHERE id = p_intent_id
     AND user_id = auth.uid()
     AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Paiement introuvable';
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.payment_attach_checkout(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.payment_attach_checkout(uuid, text, text) TO authenticated;

-- ------------------------------------------------------------------
-- 5. Marquer un paiement comme réglé + appliquer l'effet
--    (appelée UNIQUEMENT par le serveur, clé de service — jamais le client)
--    Idempotent : un webhook rejoué ne crédite pas deux fois.
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.payment_mark_paid(
  p_provider text,
  p_provider_ref text,
  p_amount int DEFAULT NULL,
  p_payload jsonb DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_intent public.payment_intents;
  v_products int;
  v_days int;
  v_product uuid;
BEGIN
  SELECT * INTO v_intent
  FROM public.payment_intents
  WHERE provider = p_provider AND provider_ref = p_provider_ref
  FOR UPDATE;

  IF v_intent.id IS NULL THEN
    RETURN json_build_object('ok', false, 'reason', 'intent_not_found');
  END IF;

  IF v_intent.status = 'paid' THEN
    RETURN json_build_object('ok', true, 'reason', 'already_paid');
  END IF;

  IF p_amount IS NOT NULL AND p_amount < v_intent.amount_fcfa THEN
    RETURN json_build_object('ok', false, 'reason', 'amount_mismatch',
                             'expected', v_intent.amount_fcfa, 'received', p_amount);
  END IF;

  UPDATE public.payment_intents
     SET status = 'paid', paid_at = now(), provider_payload = coalesce(p_payload, provider_payload)
   WHERE id = v_intent.id;

  -- ---- Effet 1 : rechargement du portefeuille ----
  IF v_intent.purpose = 'wallet_topup' THEN
    INSERT INTO public.wallets (user_id, balance_fcfa)
    VALUES (v_intent.user_id, v_intent.amount_fcfa)
    ON CONFLICT (user_id) DO UPDATE
      SET balance_fcfa = public.wallets.balance_fcfa + v_intent.amount_fcfa,
          updated_at = now();

    INSERT INTO public.wallet_transactions (user_id, amount_fcfa, kind, label)
    VALUES (v_intent.user_id, v_intent.amount_fcfa, 'topup',
            'Rechargement ' || v_intent.amount_fcfa || ' FCFA');
  END IF;

  -- ---- Effet 2 : abonnement / badge (extension de la vérification) ----
  IF v_intent.purpose = 'subscription' THEN
    v_days := coalesce((v_intent.metadata->>'days')::int, 30);
    UPDATE public.profiles
       SET verified = true,
           verified_at = coalesce(verified_at, now()),
           verified_until = greatest(coalesce(verified_until, now()), now()) + (v_days || ' days')::interval
     WHERE id = v_intent.user_id;

    INSERT INTO public.wallet_transactions (user_id, amount_fcfa, kind, label)
    VALUES (v_intent.user_id, -v_intent.amount_fcfa, 'subscription',
            'Abonnement fournisseur vérifié (' || v_days || ' jours)');
  END IF;

  -- ---- Effet 3 : achat de boost (crée la campagne, financée par le solde) ----
  IF v_intent.purpose = 'boost' THEN
    v_products := coalesce((v_intent.metadata->>'products')::int, 1);
    v_days := coalesce((v_intent.metadata->>'days')::int, 7);
    v_product := nullif(v_intent.metadata->>'product_id', '')::uuid;

    IF v_product IS NULL THEN
      RETURN json_build_object('ok', false, 'reason', 'missing_product');
    END IF;

    INSERT INTO public.boost_campaigns (user_id, product_id, daily_budget_fcfa)
    VALUES (v_intent.user_id, v_product, greatest(100, v_intent.amount_fcfa / greatest(v_days, 1)));
  END IF;

  RETURN json_build_object('ok', true, 'purpose', v_intent.purpose, 'amount', v_intent.amount_fcfa);
END;
$$;
-- Réservé au serveur (clé de service) : jamais exposé au navigateur.
REVOKE EXECUTE ON FUNCTION public.payment_mark_paid(text, text, int, jsonb) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------
-- 6. Portefeuille du vendeur (solde + derniers mouvements + campagnes)
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.wallet_overview()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v json;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Connexion requise'; END IF;

  SELECT json_build_object(
    'balance_fcfa', coalesce((SELECT balance_fcfa FROM public.wallets WHERE user_id = auth.uid()), 0),
    'transactions', coalesce((
      SELECT json_agg(row_to_json(t)) FROM (
        SELECT amount_fcfa, kind, label, created_at
        FROM public.wallet_transactions
        WHERE user_id = auth.uid()
        ORDER BY created_at DESC LIMIT 20
      ) t
    ), '[]'::json),
    'boosts', coalesce((
      SELECT json_agg(row_to_json(b)) FROM (
        SELECT c.id, c.product_id, p.name AS product_name, p.images,
               c.status, c.daily_budget_fcfa, c.days_served, c.total_spent_fcfa,
               c.created_at,
               (SELECT count(*) FROM public.ad_events e WHERE e.ad_id = c.ad_id AND e.event_type = 'impression') AS impressions,
               (SELECT count(*) FROM public.ad_events e WHERE e.ad_id = c.ad_id AND e.event_type = 'click') AS clicks
        FROM public.boost_campaigns c
        LEFT JOIN public.products p ON p.id = c.product_id
        WHERE c.user_id = auth.uid()
        ORDER BY c.created_at DESC LIMIT 20
      ) b
    ), '[]'::json)
  ) INTO v;

  RETURN v;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.wallet_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wallet_overview() TO authenticated;

-- ------------------------------------------------------------------
-- 7. Boost quotidien : déduit le budget et prolonge la mise en avant
--    À appeler 1 fois par jour (tâche planifiée).
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.boost_weight(p_daily_budget int)
RETURNS int
LANGUAGE sql IMMUTABLE
AS $$
  SELECT greatest(0, least(20, (coalesce(p_daily_budget, 0) / 500) - 1))
$$;

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
BEGIN
  FOR c IN
    SELECT * FROM public.boost_campaigns WHERE status = 'active' FOR UPDATE
  LOOP
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

  RETURN json_build_object('ok', true, 'served', v_served, 'paused', v_paused, 'ran_at', now());
END;
$$;
REVOKE EXECUTE ON FUNCTION public.boost_run_daily() FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------
-- 8. Vue admin : recettes et campagnes
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_payments_overview()
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

  SELECT json_build_object(
    'revenue_total',   coalesce((SELECT sum(amount_fcfa) FROM public.payment_intents WHERE status = 'paid'), 0),
    'revenue_30d',     coalesce((SELECT sum(amount_fcfa) FROM public.payment_intents WHERE status = 'paid' AND paid_at >= now() - interval '30 days'), 0),
    'revenue_today',   coalesce((SELECT sum(amount_fcfa) FROM public.payment_intents WHERE status = 'paid' AND paid_at >= date_trunc('day', now())), 0),
    'paid_count',      coalesce((SELECT count(*) FROM public.payment_intents WHERE status = 'paid'), 0),
    'pending_count',   coalesce((SELECT count(*) FROM public.payment_intents WHERE status = 'pending'), 0),
    'wallet_liability', coalesce((SELECT sum(balance_fcfa) FROM public.wallets), 0),
    'active_boosts',   coalesce((SELECT count(*) FROM public.boost_campaigns WHERE status = 'active'), 0),
    'daily_boost_revenue', coalesce((SELECT sum(daily_budget_fcfa) FROM public.boost_campaigns WHERE status = 'active'), 0),
    'by_provider', coalesce((
      SELECT json_agg(row_to_json(t)) FROM (
        SELECT provider, count(*) AS paid_count, sum(amount_fcfa) AS amount
        FROM public.payment_intents WHERE status = 'paid'
        GROUP BY provider ORDER BY sum(amount_fcfa) DESC
      ) t
    ), '[]'::json),
    'recent', coalesce((
      SELECT json_agg(row_to_json(r)) FROM (
        SELECT i.id, i.purpose, i.amount_fcfa, i.provider, i.method, i.status, i.created_at, i.paid_at,
               coalesce(pf.shop_name, pf.full_name) AS seller
        FROM public.payment_intents i
        LEFT JOIN public.profiles pf ON pf.id = i.user_id
        ORDER BY i.created_at DESC LIMIT 50
      ) r
    ), '[]'::json)
  ) INTO v;

  RETURN v;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_payments_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_payments_overview() TO authenticated;
