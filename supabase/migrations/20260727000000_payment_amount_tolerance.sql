-- ============================================================
-- StockMe — Tolérance sur le montant des paiements par carte
--
-- Pourquoi : quand le compte Stripe encaisse en euros, on convertit
-- 1 000 FCFA → 1,52 €, puis Stripe renvoie 152 (centimes) qu'on reconvertit
-- en 997 FCFA. Le contrôle strict « reçu < attendu » refusait alors le crédit
-- d'un paiement pourtant bien encaissé.
--
-- Nouvelle règle : on accepte un écart de 10 % (arrondis de conversion),
-- mais on refuse toujours un montant manifestement trop faible
-- (ex. 100 F reçus pour une commande de 5 000 F).
-- ============================================================

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
BEGIN
  SELECT * INTO v_intent FROM public.payment_intents
  WHERE provider = p_provider AND provider_ref = p_provider_ref
  FOR UPDATE;

  IF v_intent.id IS NULL THEN RETURN json_build_object('ok', false, 'reason', 'intent_not_found'); END IF;
  IF v_intent.status = 'paid' THEN RETURN json_build_object('ok', true, 'reason', 'already_paid'); END IF;

  -- Tolérance de conversion : 10 % d'écart accepté, plancher 50 FCFA.
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

  IF v_intent.purpose = 'wallet_topup' THEN
    INSERT INTO public.wallets (user_id, balance_fcfa) VALUES (v_intent.user_id, v_intent.amount_fcfa)
    ON CONFLICT (user_id) DO UPDATE
      SET balance_fcfa = public.wallets.balance_fcfa + v_intent.amount_fcfa, updated_at = now();

    INSERT INTO public.wallet_transactions (user_id, amount_fcfa, kind, label)
    VALUES (v_intent.user_id, v_intent.amount_fcfa, 'topup',
            'Rechargement ' || v_intent.amount_fcfa || ' FCFA');
  END IF;

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

  IF v_intent.purpose = 'boost' THEN
    v_days := coalesce((v_intent.metadata->>'days')::int, 7);
    v_product := nullif(v_intent.metadata->>'product_id', '')::uuid;
    IF v_product IS NULL THEN RETURN json_build_object('ok', false, 'reason', 'missing_product'); END IF;

    INSERT INTO public.boost_campaigns (user_id, product_id, daily_budget_fcfa)
    VALUES (v_intent.user_id, v_product, greatest(100, v_intent.amount_fcfa / greatest(v_days, 1)));
  END IF;

  RETURN json_build_object('ok', true, 'purpose', v_intent.purpose, 'amount', v_intent.amount_fcfa);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.payment_mark_paid(text, text, int, jsonb, text) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------
-- Liste des paiements restés « en attente » (pour la réconciliation)
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pending_payment_intents(p_minutes int DEFAULT 2, p_limit int DEFAULT 50)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v json;
BEGIN
  SELECT coalesce(json_agg(row_to_json(t)), '[]'::json) INTO v FROM (
    SELECT id, user_id, purpose, amount_fcfa, provider, method, provider_ref, created_at, metadata
    FROM public.payment_intents
    WHERE status = 'pending'
      AND provider_ref IS NOT NULL
      AND created_at >= now() - interval '7 days'
      AND created_at <= now() - (coalesce(p_minutes, 2) || ' minutes')::interval
    ORDER BY created_at ASC
    LIMIT greatest(1, least(coalesce(p_limit, 50), 200))
  ) t;
  RETURN v;
END;
$$;
-- Réservé au serveur (tâche de réconciliation).
REVOKE EXECUTE ON FUNCTION public.pending_payment_intents(int, int) FROM PUBLIC, anon, authenticated;
