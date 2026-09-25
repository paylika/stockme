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
