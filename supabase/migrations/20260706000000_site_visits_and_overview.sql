
-- ============================================================
-- 1) Suivi des visites du site (pages publiques)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.site_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  path text,
  country text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS site_visits_created_idx ON public.site_visits(created_at);
ALTER TABLE public.site_visits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.log_site_visit(p_path text DEFAULT NULL, p_country text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.site_visits (path, country) VALUES (left(p_path, 200), p_country);
END; $$;
REVOKE EXECUTE ON FUNCTION public.log_site_visit(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_site_visit(text, text) TO anon, authenticated;

-- ============================================================
-- 2) Vue d'ensemble admin : période libre (dates) + unité de graphe
--    p_unit : 'hour' | 'day' | 'month'
-- ============================================================
DROP FUNCTION IF EXISTS public.get_admin_overview(text);

CREATE OR REPLACE FUNCTION public.get_admin_overview(
  p_start timestamptz,
  p_end timestamptz,
  p_unit text DEFAULT 'day'
)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v json;
  v_step interval;
  v_fmt text;
  v_unit text := CASE WHEN p_unit IN ('hour','day','month') THEN p_unit ELSE 'day' END;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;

  v_step := CASE v_unit WHEN 'hour' THEN interval '1 hour' WHEN 'month' THEN interval '1 month' ELSE interval '1 day' END;
  v_fmt  := CASE v_unit WHEN 'hour' THEN 'HH24:00' WHEN 'month' THEN 'YYYY-MM' ELSE 'YYYY-MM-DD' END;

  SELECT json_build_object(
    'totals', json_build_object(
      'users', (SELECT count(*) FROM auth.users),
      'products', (SELECT count(*) FROM public.products),
      'published_products', (SELECT count(*) FROM public.products WHERE published),
      'active_sellers', (SELECT count(DISTINCT owner_id) FROM public.products WHERE published),
      'sellers', (SELECT count(DISTINCT owner_id) FROM public.products),
      'views', (SELECT count(*) FROM public.product_events WHERE event = 'view'),
      'contacts', (SELECT count(*) FROM public.product_events WHERE event = 'contact'),
      'visits', (SELECT count(*) FROM public.site_visits),
      'favorites', (SELECT count(*) FROM public.favorites),
      'stock_value', (SELECT coalesce(sum(coalesce(promo_price_fcfa, price_fcfa) * quantity), 0) FROM public.products WHERE published),
      'promos', (SELECT count(*) FROM public.products WHERE published AND promo_price_fcfa IS NOT NULL AND promo_price_fcfa < price_fcfa),
      'avg_products_per_seller', round((SELECT count(*) FROM public.products)::numeric / NULLIF((SELECT count(DISTINCT owner_id) FROM public.products), 0), 1)
    ),
    'period_stats', json_build_object(
      'new_users', (SELECT count(*) FROM auth.users WHERE created_at >= p_start AND created_at < p_end),
      'new_products', (SELECT count(*) FROM public.products WHERE created_at >= p_start AND created_at < p_end),
      'views', (SELECT count(*) FROM public.product_events WHERE event = 'view' AND created_at >= p_start AND created_at < p_end),
      'contacts', (SELECT count(*) FROM public.product_events WHERE event = 'contact' AND created_at >= p_start AND created_at < p_end),
      'visits', (SELECT count(*) FROM public.site_visits WHERE created_at >= p_start AND created_at < p_end),
      'signup_rate', (CASE WHEN (SELECT count(*) FROM public.site_visits WHERE created_at >= p_start AND created_at < p_end) > 0
        THEN round(100.0 * (SELECT count(*) FROM auth.users WHERE created_at >= p_start AND created_at < p_end)
          / (SELECT count(*) FROM public.site_visits WHERE created_at >= p_start AND created_at < p_end), 2) ELSE 0 END),
      'conversion_rate', (CASE WHEN (SELECT count(*) FROM public.product_events WHERE event = 'view' AND created_at >= p_start AND created_at < p_end) > 0
        THEN round(100.0 * (SELECT count(*) FROM public.product_events WHERE event = 'contact' AND created_at >= p_start AND created_at < p_end)
          / (SELECT count(*) FROM public.product_events WHERE event = 'view' AND created_at >= p_start AND created_at < p_end), 1) ELSE 0 END)
    ),
    'trend', (SELECT coalesce(json_agg(row_to_json(t)), '[]'::json) FROM (
      SELECT to_char(d.b, v_fmt) AS day,
        (SELECT count(*) FROM auth.users u WHERE u.created_at >= d.b AND u.created_at < d.b + v_step) AS signups,
        (SELECT count(*) FROM public.product_events e WHERE e.event = 'view' AND e.created_at >= d.b AND e.created_at < d.b + v_step) AS views,
        (SELECT count(*) FROM public.product_events e WHERE e.event = 'contact' AND e.created_at >= d.b AND e.created_at < d.b + v_step) AS contacts,
        (SELECT count(*) FROM public.site_visits s WHERE s.created_at >= d.b AND s.created_at < d.b + v_step) AS visits
      FROM generate_series(date_trunc(v_unit, p_start), date_trunc(v_unit, p_end), v_step) AS d(b)
      ORDER BY d.b
    ) t),
    'contacts_by_country', (SELECT coalesce(json_agg(row_to_json(t)), '[]'::json) FROM (
      SELECT coalesce(country, 'Autre') AS country, count(*) AS value
      FROM public.product_events WHERE event = 'contact' AND created_at >= p_start AND created_at < p_end
      GROUP BY country ORDER BY count(*) DESC LIMIT 10) t),
    'top_categories', (SELECT coalesce(json_agg(row_to_json(t)), '[]'::json) FROM (
      SELECT category AS name, count(*) AS value FROM public.products GROUP BY category ORDER BY count(*) DESC) t)
  ) INTO v;
  RETURN v;
END; $$;
REVOKE EXECUTE ON FUNCTION public.get_admin_overview(timestamptz, timestamptz, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_overview(timestamptz, timestamptz, text) TO authenticated;
