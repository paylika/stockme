
-- ============================================================
-- Vue d'ensemble admin : KPIs riches + série temporelle
--   (inscriptions journalières + vues/contacts) selon la période.
--   p_period : 'week' (7 j) | 'month' (30 j) | 'year' (12 mois)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_admin_overview(p_period text DEFAULT 'month')
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v json;
  v_now timestamptz := now();
  v_start timestamptz;
  v_step interval;
  v_unit text;
  v_fmt text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;

  IF p_period = 'year' THEN
    v_start := v_now - interval '365 days'; v_step := interval '1 month'; v_unit := 'month'; v_fmt := 'YYYY-MM';
  ELSIF p_period = 'month' THEN
    v_start := v_now - interval '30 days'; v_step := interval '1 day'; v_unit := 'day'; v_fmt := 'YYYY-MM-DD';
  ELSE
    v_start := v_now - interval '7 days'; v_step := interval '1 day'; v_unit := 'day'; v_fmt := 'YYYY-MM-DD';
  END IF;

  SELECT json_build_object(
    'period', coalesce(nullif(p_period, ''), 'month'),
    'totals', json_build_object(
      'users', (SELECT count(*) FROM auth.users),
      'products', (SELECT count(*) FROM public.products),
      'published_products', (SELECT count(*) FROM public.products WHERE published),
      'active_sellers', (SELECT count(DISTINCT owner_id) FROM public.products WHERE published),
      'sellers', (SELECT count(DISTINCT owner_id) FROM public.products),
      'views', (SELECT count(*) FROM public.product_events WHERE event = 'view'),
      'contacts', (SELECT count(*) FROM public.product_events WHERE event = 'contact'),
      'favorites', (SELECT count(*) FROM public.favorites),
      'stock_value', (SELECT coalesce(sum(coalesce(promo_price_fcfa, price_fcfa) * quantity), 0) FROM public.products WHERE published),
      'promos', (SELECT count(*) FROM public.products WHERE published AND promo_price_fcfa IS NOT NULL AND promo_price_fcfa < price_fcfa),
      'avg_products_per_seller', round((SELECT count(*) FROM public.products)::numeric
        / NULLIF((SELECT count(DISTINCT owner_id) FROM public.products), 0), 1)
    ),
    'period_stats', json_build_object(
      'new_users', (SELECT count(*) FROM auth.users WHERE created_at >= v_start),
      'new_products', (SELECT count(*) FROM public.products WHERE created_at >= v_start),
      'views', (SELECT count(*) FROM public.product_events WHERE event = 'view' AND created_at >= v_start),
      'contacts', (SELECT count(*) FROM public.product_events WHERE event = 'contact' AND created_at >= v_start),
      'conversion_rate', (CASE WHEN (SELECT count(*) FROM public.product_events WHERE event = 'view' AND created_at >= v_start) > 0
        THEN round(100.0 * (SELECT count(*) FROM public.product_events WHERE event = 'contact' AND created_at >= v_start)
          / (SELECT count(*) FROM public.product_events WHERE event = 'view' AND created_at >= v_start), 1)
        ELSE 0 END)
    ),
    'trend', (SELECT coalesce(json_agg(row_to_json(t)), '[]'::json) FROM (
      SELECT
        to_char(d.day, v_fmt) AS day,
        (SELECT count(*) FROM auth.users u WHERE u.created_at >= d.day AND u.created_at < d.day + v_step) AS signups,
        (SELECT count(*) FROM public.product_events e WHERE e.event = 'view' AND e.created_at >= d.day AND e.created_at < d.day + v_step) AS views,
        (SELECT count(*) FROM public.product_events e WHERE e.event = 'contact' AND e.created_at >= d.day AND e.created_at < d.day + v_step) AS contacts
      FROM generate_series(date_trunc(v_unit, v_start), date_trunc(v_unit, v_now), v_step) AS d(day)
      ORDER BY d.day
    ) t),
    'contacts_by_country', (SELECT coalesce(json_agg(row_to_json(t)), '[]'::json) FROM (
      SELECT coalesce(country, 'Autre') AS country, count(*) AS value
      FROM public.product_events WHERE event = 'contact'
      GROUP BY country ORDER BY count(*) DESC LIMIT 10) t),
    'top_categories', (SELECT coalesce(json_agg(row_to_json(t)), '[]'::json) FROM (
      SELECT category AS name, count(*) AS value
      FROM public.products GROUP BY category ORDER BY count(*) DESC) t)
  ) INTO v;
  RETURN v;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_admin_overview(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_overview(text) TO authenticated;
