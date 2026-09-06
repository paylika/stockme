
-- ============================================================
-- Analytics réelles pour StockMe
--   product_events : chaque "vue" de fiche produit et chaque "contact"
--   (clic WhatsApp / téléphone) est horodaté + pays de l'acheteur.
--   Permet de vraies statistiques (vues, contacts, favoris, tendance,
--   répartition par pays, intensité) sans exposer les lignes brutes.
-- ============================================================

-- Table d'événements
CREATE TABLE IF NOT EXISTS public.product_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event text NOT NULL CHECK (event IN ('view', 'contact')),
  country text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS product_events_seller_idx ON public.product_events(seller_id, created_at);
CREATE INDEX IF NOT EXISTS product_events_seller_event_idx ON public.product_events(seller_id, event, created_at);
CREATE INDEX IF NOT EXISTS product_events_product_idx ON public.product_events(product_id);

ALTER TABLE public.product_events ENABLE ROW LEVEL SECURITY;
-- Aucune policy : tout accès passe par les fonctions SECURITY DEFINER ci-dessous.

-- ------------------------------------------------------------------
-- log_product_event : enregistre une vue/contact (sécurisé, définit le seller)
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_product_event(
  p_product_id uuid,
  p_event text,
  p_country text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seller uuid;
BEGIN
  IF p_event NOT IN ('view', 'contact') THEN
    RAISE EXCEPTION 'invalid event';
  END IF;

  SELECT owner_id INTO v_seller FROM public.products WHERE id = p_product_id;
  IF v_seller IS NULL THEN
    RAISE EXCEPTION 'product not found';
  END IF;

  INSERT INTO public.product_events (product_id, seller_id, event, country)
  VALUES (p_product_id, v_seller, p_event, p_country);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_product_event(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_product_event(uuid, text, text) TO anon, authenticated;

-- ------------------------------------------------------------------
-- get_seller_stats : agrégats publics d'un vendeur (pour la fiche produit)
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_seller_stats(p_seller_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v json;
BEGIN
  SELECT json_build_object(
    'total_products',
      (SELECT count(*) FROM public.products WHERE owner_id = p_seller_id AND published = true),
    'total_views',
      (SELECT count(*) FROM public.product_events WHERE seller_id = p_seller_id AND event = 'view'),
    'total_contacts',
      (SELECT count(*) FROM public.product_events WHERE seller_id = p_seller_id AND event = 'contact'),
    'total_favorites',
      (SELECT count(*) FROM public.favorites f JOIN public.products p ON p.id = f.product_id WHERE p.owner_id = p_seller_id),
    'stock_value',
      (SELECT coalesce(sum(coalesce(p.promo_price_fcfa, p.price_fcfa) * p.quantity), 0)
         FROM public.products p WHERE p.owner_id = p_seller_id AND p.published = true),
    'countries',
      (SELECT coalesce(json_agg(row_to_json(t)), '[]'::json) FROM (
         SELECT country, count(*) AS value
         FROM public.product_events
         WHERE seller_id = p_seller_id AND event = 'contact' AND country IS NOT NULL
         GROUP BY country ORDER BY count(*) DESC
       ) t),
    'trend',
      (SELECT coalesce(json_agg(row_to_json(t)), '[]'::json) FROM (
         SELECT to_char(d.day, 'YYYY-MM-DD') AS day, count(*) AS value
         FROM generate_series(date_trunc('day', now()) - interval '29 days', date_trunc('day', now()), interval '1 day') AS d(day)
         LEFT JOIN public.product_events e
           ON e.seller_id = p_seller_id AND e.event = 'view'
          AND e.created_at >= d.day AND e.created_at < d.day + interval '1 day'
         GROUP BY d.day ORDER BY d.day
       ) t)
  ) INTO v;
  RETURN v;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_seller_stats(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_seller_stats(uuid) TO anon, authenticated;

-- ------------------------------------------------------------------
-- get_all_seller_stats : agrégats de tous les vendeurs (admin uniquement)
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_all_seller_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v json;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT coalesce(json_agg(row_to_json(t)), '[]'::json) INTO v FROM (
    SELECT
      p.owner_id AS seller_id,
      count(DISTINCT p.id) FILTER (WHERE p.published) AS products,
      count(DISTINCT e.id) FILTER (WHERE e.event = 'view') AS views,
      count(DISTINCT e.id) FILTER (WHERE e.event = 'contact') AS contacts,
      (SELECT count(*) FROM public.favorites f2 JOIN public.products pp ON pp.id = f2.product_id WHERE pp.owner_id = p.owner_id) AS favorites,
      coalesce(sum(coalesce(p.promo_price_fcfa, p.price_fcfa) * p.quantity) FILTER (WHERE p.published), 0) AS stock_value
    FROM public.products p
    LEFT JOIN public.product_events e ON e.product_id = p.id
    GROUP BY p.owner_id
  ) t;

  RETURN v;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_all_seller_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_all_seller_stats() TO authenticated;
