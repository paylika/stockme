-- ============================================================
-- StockMe — Reprise des paiements en attente
--
-- Problème : quand un vendeur abandonne un paiement (il ferme la page
-- Stripe, sa connexion coupe…), l'intention reste « en attente » et un
-- nouveau rechargement en crée une deuxième. On se retrouve avec des
-- paiements fantômes.
--
-- Solution :
--   • `wallet_overview` renvoie désormais les paiements en attente, pour
--     les AFFICHER dans le profil ;
--   • le vendeur peut REPRENDRE le paiement existant (le lien Stripe reste
--     valable 24 h) au lieu d'en créer un nouveau ;
--   • s'il veut changer le montant, on annule proprement l'ancien puis on
--     en crée un seul nouveau.
--
-- Note : un paiement annulé reste créditable si Stripe confirme finalement
-- l'encaissement — on ne perd jamais l'argent du vendeur.
-- ============================================================

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
      ) t), '[]'::json),
    'boosts', coalesce((
      SELECT json_agg(row_to_json(b)) FROM (
        SELECT c.id, c.product_id, p.name AS product_name, p.images,
               c.status, c.daily_budget_fcfa, c.days_served, c.total_spent_fcfa,
               c.created_at, c.last_run_at,
               (SELECT count(*) FROM public.ad_events e
                 WHERE e.ad_id = c.ad_id AND e.event_type = 'impression') AS impressions,
               (SELECT count(*) FROM public.ad_events e
                 WHERE e.ad_id = c.ad_id AND e.event_type = 'click') AS clicks,
               (SELECT count(*) FROM public.product_events e
                 WHERE e.product_id = c.product_id AND e.event = 'view'
                   AND e.created_at >= c.created_at) AS product_views,
               (SELECT count(*) FROM public.product_events e
                 WHERE e.product_id = c.product_id AND e.event = 'contact'
                   AND e.created_at >= c.created_at) AS product_contacts
        FROM public.boost_campaigns c
        LEFT JOIN public.products p ON p.id = c.product_id
        WHERE c.user_id = auth.uid()
        ORDER BY c.created_at DESC LIMIT 20
      ) b), '[]'::json),
    -- Paiements jamais confirmés, encore repris possibles
    'pending', coalesce((
      SELECT json_agg(row_to_json(p)) FROM (
        SELECT id, purpose, amount_fcfa, provider, method, checkout_url, created_at
        FROM public.payment_intents
        WHERE user_id = auth.uid()
          AND status = 'pending'
          AND created_at >= now() - interval '48 hours'
        ORDER BY created_at DESC LIMIT 5
      ) p), '[]'::json)
  ) INTO v;

  RETURN v;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.wallet_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wallet_overview() TO authenticated;

-- ------------------------------------------------------------------
-- Annuler les paiements en attente d'un objet donné (rechargement…)
-- Appelée automatiquement avant de créer un nouveau paiement : on évite
-- ainsi d'empiler les demandes. Les paiements réellement encaissés plus
-- tard restent crédités (le webhook les retrouve par leur référence).
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.payment_cancel_pending(p_purpose text, p_min_age_seconds int DEFAULT 300)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Connexion requise'; END IF;

  UPDATE public.payment_intents
     SET status = 'cancelled'
   WHERE user_id = auth.uid()
     AND status = 'pending'
     AND purpose = p_purpose
     -- On ne touche pas à un paiement lancé il y a moins de 5 minutes :
     -- le vendeur est peut-être en train de le valider sur son téléphone.
     AND created_at <= now() - (greatest(coalesce(p_min_age_seconds, 300), 60) || ' seconds')::interval;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN json_build_object('ok', true, 'cancelled', v_count);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.payment_cancel_pending(text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.payment_cancel_pending(text, int) TO authenticated;
