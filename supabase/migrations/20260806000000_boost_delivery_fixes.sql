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
