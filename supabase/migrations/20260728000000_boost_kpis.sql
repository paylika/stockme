-- ============================================================
-- StockMe — KPI des mises en avant (façon régie publicitaire)
--
-- On ajoute aux campagnes le nombre de VUES et de CONTACTS générés sur
-- le produit depuis le début du boost : c'est la vraie performance qui
-- intéresse le vendeur (des personnes qui l'ont contacté), pas seulement
-- l'affichage de l'annonce.
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
      ) b), '[]'::json)
  ) INTO v;

  RETURN v;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.wallet_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wallet_overview() TO authenticated;
