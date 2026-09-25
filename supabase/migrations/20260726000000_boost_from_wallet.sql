-- ============================================================
-- StockMe — Démarrer / piloter un boost depuis le portefeuille
--
-- Modèle retenu (simple et cohérent) :
--   • le PORTEFEUILLE est le carburant (rechargé par carte ou mobile money) ;
--   • un BOOST consomme le solde, chaque jour, automatiquement.
--
-- Le vendeur n'a donc qu'un seul geste à faire au départ : recharger.
-- Ensuite « Booster » un produit ne demande aucun paiement supplémentaire.
-- ============================================================

CREATE OR REPLACE FUNCTION public.boost_start(p_product_id uuid, p_daily_budget int DEFAULT 500)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_balance int;
  v_campaign public.boost_campaigns;
  v_ad uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Connexion requise'; END IF;
  IF p_daily_budget IS NULL OR p_daily_budget < 100 THEN
    RAISE EXCEPTION 'Budget quotidien minimum : 100 FCFA';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = p_product_id AND owner_id = v_uid) THEN
    RAISE EXCEPTION 'Produit introuvable';
  END IF;

  -- Une seule campagne active par produit
  SELECT * INTO v_campaign FROM public.boost_campaigns
  WHERE product_id = p_product_id AND status = 'active' LIMIT 1;

  SELECT coalesce(balance_fcfa, 0) INTO v_balance FROM public.wallets WHERE user_id = v_uid;
  v_balance := coalesce(v_balance, 0);

  IF v_balance < p_daily_budget THEN
    RETURN json_build_object('ok', false, 'reason', 'insufficient_balance',
                             'balance', v_balance, 'needed', p_daily_budget);
  END IF;

  -- Campagne existante en pause : on la réactive
  IF v_campaign.id IS NOT NULL THEN
    UPDATE public.boost_campaigns SET daily_budget_fcfa = p_daily_budget WHERE id = v_campaign.id;
  ELSE
    INSERT INTO public.boost_campaigns (user_id, product_id, daily_budget_fcfa)
    VALUES (v_uid, p_product_id, p_daily_budget)
    RETURNING * INTO v_campaign;
  END IF;

  -- Première journée servie IMMÉDIATEMENT (le vendeur voit l'effet tout de suite)
  UPDATE public.wallets
     SET balance_fcfa = balance_fcfa - p_daily_budget, updated_at = now()
   WHERE user_id = v_uid;

  INSERT INTO public.wallet_transactions (user_id, amount_fcfa, kind, label)
  VALUES (v_uid, -p_daily_budget, 'boost', 'Boost quotidien — ' || p_daily_budget || ' FCFA');

  IF v_campaign.ad_id IS NULL THEN
    INSERT INTO public.ads (kind, product_id, starts_at, ends_at, active, weight)
    VALUES ('product', p_product_id, now(), now() + interval '1 day', true,
            public.boost_weight(p_daily_budget))
    RETURNING id INTO v_ad;
    UPDATE public.boost_campaigns SET ad_id = v_ad WHERE id = v_campaign.id;
  ELSE
    UPDATE public.ads
       SET active = true,
           ends_at = greatest(coalesce(ends_at, now()), now()) + interval '1 day',
           weight = public.boost_weight(p_daily_budget)
     WHERE id = v_campaign.ad_id;
  END IF;

  UPDATE public.boost_campaigns
     SET status = 'active',
         days_served = days_served + 1,
         total_spent_fcfa = total_spent_fcfa + p_daily_budget,
         last_run_at = now()
   WHERE id = v_campaign.id;

  RETURN json_build_object(
    'ok', true,
    'campaign_id', v_campaign.id,
    'balance', v_balance - p_daily_budget,
    'daily_budget', p_daily_budget
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.boost_start(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.boost_start(uuid, int) TO authenticated;

-- ------------------------------------------------------------------
-- Mettre en pause / arrêter un boost (l'annonce cesse immédiatement)
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

  -- L'annonce suit l'état de la campagne
  IF v_c.ad_id IS NOT NULL AND p_status <> 'active' THEN
    UPDATE public.ads SET active = false, ends_at = least(coalesce(ends_at, now()), now()) WHERE id = v_c.ad_id;
  END IF;

  RETURN json_build_object('ok', true, 'status', p_status);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.boost_set_status(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.boost_set_status(uuid, text) TO authenticated;
