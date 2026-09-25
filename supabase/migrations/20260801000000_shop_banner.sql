-- ============================================================
-- StockMe — Bannière de boutique
--
--   • banner_url      : image de couverture de la boutique
--   • banner_position : point focal vertical (0-100 %) choisi en
--                       faisant GLISSER l'image dans le cadre
--
-- Avantage réservé aux boutiques VÉRIFIÉES : par défaut, tous les
-- comptes affichent la bannière StockMe. C'est un avantage visible,
-- donc un motif de vérification… sans jamais dégrader le visiteur.
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS banner_url text,
  ADD COLUMN IF NOT EXISTS banner_position int NOT NULL DEFAULT 50;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_banner_position_check') THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_banner_position_check CHECK (banner_position BETWEEN 0 AND 100);
  END IF;
END $$;

-- Le profil public expose la bannière (et le point focal)
CREATE OR REPLACE FUNCTION public.get_public_seller(p_seller_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v json;
BEGIN
  SELECT row_to_json(t) INTO v FROM (
    SELECT
      p.id, p.shop_name, p.full_name, p.avatar_url, p.city, p.bio, p.created_at,
      p.phone, p.whatsapp, p.banner_url, p.banner_position, p.plan,
      (SELECT count(*) FROM public.products pr
        WHERE pr.owner_id = p.id AND pr.published = true) AS products_count,
      (p.verified AND (p.verified_until IS NULL OR p.verified_until > now())) AS is_verified,
      p.verified_until
    FROM public.profiles p
    WHERE p.id = p_seller_id
  ) t;

  RETURN v;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_public_seller(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_seller(uuid) TO anon, authenticated;
