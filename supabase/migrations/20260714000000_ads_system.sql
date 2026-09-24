
-- ============================================================
-- Système d'annonces (mise en avant) :
--   kind = 'product' → annonce liée à un produit d'un vendeur
--   kind = 'custom'  → annonce libre (image + texte + contact)
--   starts_at / ends_at → fenêtre de diffusion STRICTEMENT respectée
-- ============================================================
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

-- Seuls les admins peuvent gérer les annonces (lecture + écriture).
DROP POLICY IF EXISTS "Admins manage ads" ON public.ads;
CREATE POLICY "Admins manage ads" ON public.ads
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Lecture publique : uniquement les annonces ACTIVES et DANS leur fenêtre de diffusion.
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
