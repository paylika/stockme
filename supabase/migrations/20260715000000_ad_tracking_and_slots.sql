-- ============================================================
-- StockMe — Performance des annonces + slots sponsorisés
--   1. Suivi des IMPRESSIONS et CLICS par annonce (ad_events)
--   2. Stats agrégées pour l'admin (get_ad_stats)
--   3. Produits sponsorisés pour les slots #2/#3 de la grille (get_sponsored_products)
--   4. get_active_ads enrichi (champs produit complets pour la carte)
--
-- ⚠️ Ce fichier est AUTONOME : il (re)crée aussi la table `ads` si besoin,
--    donc il peut être collé seul dans le SQL Editor de Supabase.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Table des annonces (rappel idempotent du fichier 20260714000000)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('product', 'custom')),
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  title text,
  description text,
  image_url text,
  cta_label text,
  href text,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  weight int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ads_window_idx ON public.ads(active, starts_at, ends_at);

ALTER TABLE public.ads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage ads" ON public.ads;
CREATE POLICY "Admins manage ads" ON public.ads
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ------------------------------------------------------------
-- 2. Lecture publique des annonces actives (version enrichie)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_active_ads()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v json;
BEGIN
  SELECT coalesce(json_agg(row_to_json(t)), '[]'::json) INTO v FROM (
    SELECT
      a.id, a.kind, a.title, a.description, a.image_url, a.cta_label, a.href, a.weight,
      a.starts_at, a.ends_at, a.product_id,
      p.name AS product_name, p.images AS product_images, p.city AS product_city,
      p.zone AS product_zone, p.category AS product_category, p.moq, p.quantity,
      p.price_fcfa, p.promo_price_fcfa, p.dropshipping, p.sold_out
    FROM public.ads a
    LEFT JOIN public.products p ON p.id = a.product_id
    WHERE a.active = true
      AND a.starts_at <= now()
      AND (a.ends_at IS NULL OR a.ends_at >= now())
      AND (a.kind <> 'product' OR (p.id IS NOT NULL AND p.published = true))
    ORDER BY a.weight DESC, a.created_at DESC
  ) t;
  RETURN v;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_active_ads() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_ads() TO anon, authenticated;

-- ------------------------------------------------------------
-- 3. Événements publicitaires (impressions / clics)
--    Aucune policy RLS : lecture et écriture passent UNIQUEMENT
--    par les fonctions SECURITY DEFINER ci-dessous.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ad_events (
  id bigserial PRIMARY KEY,
  ad_id uuid NOT NULL REFERENCES public.ads(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('impression', 'click')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ad_events_ad_idx ON public.ad_events(ad_id, event_type);
CREATE INDEX IF NOT EXISTS ad_events_created_idx ON public.ad_events(created_at DESC);

ALTER TABLE public.ad_events ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 4. Enregistrer un événement (appelable par le site public)
--    On ignore tout événement sur une annonce hors fenêtre de diffusion.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_ad_event(p_ad_id uuid, p_event text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_event NOT IN ('impression', 'click') THEN
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

-- ------------------------------------------------------------
-- 5. Statistiques par annonce (admin uniquement)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_ad_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v json;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Accès réservé aux administrateurs';
  END IF;

  SELECT coalesce(json_agg(row_to_json(t)), '[]'::json) INTO v FROM (
    SELECT
      a.id AS ad_id,
      count(*) FILTER (WHERE e.event_type = 'impression')                                   AS impressions,
      count(*) FILTER (WHERE e.event_type = 'click')                                        AS clicks,
      count(*) FILTER (WHERE e.event_type = 'impression' AND e.created_at >= now() - interval '7 days') AS impressions_7d,
      count(*) FILTER (WHERE e.event_type = 'click'      AND e.created_at >= now() - interval '7 days') AS clicks_7d,
      max(e.created_at)                                                                     AS last_event_at
    FROM public.ads a
    LEFT JOIN public.ad_events e ON e.ad_id = a.id
    GROUP BY a.id
  ) t;

  RETURN v;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_ad_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_ad_stats() TO authenticated;

-- ------------------------------------------------------------
-- 6. Produits sponsorisés pour les slots de la grille d'accueil
--    (annonces de type 'product', dans leur fenêtre, triées par
--    priorité puis aléatoire pour que tout le monde tourne)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_sponsored_products(p_limit int DEFAULT 3)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v json;
BEGIN
  SELECT coalesce(json_agg(row_to_json(t)), '[]'::json) INTO v FROM (
    SELECT
      a.id AS ad_id,
      p.id, p.name, p.category, p.price_fcfa, p.promo_price_fcfa,
      p.quantity, p.moq, p.city, p.zone, p.images,
      p.sold_out, p.dropshipping
    FROM public.ads a
    JOIN public.products p ON p.id = a.product_id
    WHERE a.kind = 'product'
      AND a.active = true
      AND a.starts_at <= now()
      AND (a.ends_at IS NULL OR a.ends_at >= now())
      AND p.published = true
      AND p.sold_out = false
    ORDER BY a.weight DESC, random()
    LIMIT greatest(1, least(coalesce(p_limit, 3), 6))
  ) t;
  RETURN v;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_sponsored_products(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_sponsored_products(int) TO anon, authenticated;
