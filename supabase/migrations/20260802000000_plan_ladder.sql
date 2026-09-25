-- ============================================================
-- StockMe — Échelle des offres (logique définitive)
--
--   PRO ⊃ Vérifié. Le badge est toujours acquis ; ce qui change, c'est
--   ce qui RESTE si le vendeur arrête :
--     • badge annuel (5 000 F)  → acquis 12 mois quoi qu'il arrive ;
--     • PRO seul (2 500 F/mois) → acquis tant que l'abonnement est actif ;
--     • PRO à l'année (25 000 F) → acquis 12 mois, 2 mois offerts ;
--     • vérification manuelle par l'admin → à vie.
--
-- Ce script rattrape les comptes déjà vérifiés manuellement : leur colonne
-- `plan` valait encore « gratuit », ce qui leur proposait à tort d'acheter
-- un badge qu'ils possèdent déjà.
-- ============================================================

UPDATE public.profiles
   SET plan = 'verifie'
 WHERE verified = true
   AND coalesce(plan, 'gratuit') = 'gratuit';

-- Un compte PRO ne redevient jamais « verifie » tout seul.
UPDATE public.profiles
   SET plan = 'pro'
 WHERE plan = 'verifie'
   AND verified = true
   AND verified_until IS NOT NULL
   AND verified_until > now() + interval '400 days';

-- ------------------------------------------------------------------
-- Abonnements : on accepte les durées 30 j (PRO mensuel) et 365 j
-- (PRO annuel ou badge annuel) — rien d'autre ne change.
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.subscription_renew(
  p_provider text,
  p_subscription_ref text,
  p_amount int DEFAULT NULL,
  p_payload jsonb DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_origin public.payment_intents;
  v_new_id uuid;
  v_amount int;
BEGIN
  IF p_subscription_ref IS NULL OR p_subscription_ref = '' THEN
    RETURN json_build_object('ok', false, 'reason', 'missing_subscription_ref');
  END IF;

  SELECT * INTO v_origin
  FROM public.payment_intents
  WHERE metadata->>'subscription_ref' = p_subscription_ref
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_origin.id IS NULL THEN
    RETURN json_build_object('ok', false, 'reason', 'subscription_not_found');
  END IF;

  v_amount := coalesce(p_amount, v_origin.amount_fcfa);

  -- Chaque échéance mensuelle prolonge le badge ET l'offre PRO de 30 jours.
  UPDATE public.profiles
     SET verified = true,
         verified_at = coalesce(verified_at, now()),
         verified_until = greatest(coalesce(verified_until, now()), now()) + interval '30 days',
         plan = 'pro'
   WHERE id = v_origin.user_id;

  INSERT INTO public.payment_intents (
    user_id, purpose, amount_fcfa, provider, method, status,
    provider_ref, provider_payload, metadata, paid_at
  )
  VALUES (
    v_origin.user_id, 'subscription', v_amount, p_provider, v_origin.method, 'paid',
    p_provider || '_sub_' || p_subscription_ref || '_' || to_char(now(), 'YYYYMM'),
    p_payload,
    jsonb_build_object('subscription_ref', p_subscription_ref, 'renewal', true, 'plan', 'pro'),
    now()
  )
  RETURNING id INTO v_new_id;

  INSERT INTO public.wallet_transactions (user_id, amount_fcfa, kind, label)
  VALUES (v_origin.user_id, -v_amount, 'subscription', 'Abonnement StockMe PRO — renouvellement mensuel');

  RETURN json_build_object('ok', true, 'intent_id', v_new_id, 'verified_user', v_origin.user_id, 'amount', v_amount);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.subscription_renew(text, text, int, jsonb) FROM PUBLIC, anon, authenticated;
