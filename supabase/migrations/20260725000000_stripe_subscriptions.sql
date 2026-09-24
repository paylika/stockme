-- ============================================================
-- StockMe — Abonnements par carte (renouvellement automatique)
--
-- Avec Stripe, la carte peut être enregistrée : le vendeur est débité
-- chaque mois sans rien faire. Chaque échéance encaissée doit :
--   1. prolonger la vérification de 30 jours,
--   2. apparaître dans les recettes (nouvelle ligne « payée »).
--
-- La référence de l'abonnement est mémorisée dans les métadonnées de
-- l'intention d'origine (metadata->>'subscription_ref'), ce qui permet de
-- retrouver le vendeur à chaque échéance.
-- ============================================================

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

  -- Intention d'origine = celle qui a créé l'abonnement.
  SELECT * INTO v_origin
  FROM public.payment_intents
  WHERE metadata->>'subscription_ref' = p_subscription_ref
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_origin.id IS NULL THEN
    RETURN json_build_object('ok', false, 'reason', 'subscription_not_found');
  END IF;

  v_amount := coalesce(p_amount, v_origin.amount_fcfa);

  -- 1. Prolongation du badge (30 jours)
  UPDATE public.profiles
     SET verified = true,
         verified_at = coalesce(verified_at, now()),
         verified_until = greatest(coalesce(verified_until, now()), now()) + interval '30 days'
   WHERE id = v_origin.user_id;

  -- 2. Trace comptable : chaque échéance est une recette réelle
  INSERT INTO public.payment_intents (
    user_id, purpose, amount_fcfa, provider, method, status,
    provider_ref, provider_payload, metadata, paid_at
  )
  VALUES (
    v_origin.user_id, 'subscription', v_amount, p_provider, v_origin.method, 'paid',
    p_provider || '_sub_' || p_subscription_ref || '_' || to_char(now(), 'YYYYMM'),
    p_payload,
    jsonb_build_object('subscription_ref', p_subscription_ref, 'renewal', true),
    now()
  )
  RETURNING id INTO v_new_id;

  INSERT INTO public.wallet_transactions (user_id, amount_fcfa, kind, label)
  VALUES (v_origin.user_id, -v_amount, 'subscription', 'Abonnement fournisseur vérifié — renouvellement mensuel');

  RETURN json_build_object('ok', true, 'intent_id', v_new_id, 'verified_user', v_origin.user_id, 'amount', v_amount);
END;
$$;
-- Réservé au serveur (webhooks) : jamais exposé au navigateur.
REVOKE EXECUTE ON FUNCTION public.subscription_renew(text, text, int, jsonb) FROM PUBLIC, anon, authenticated;
