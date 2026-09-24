-- ============================================================
-- StockMe — Espace vendeur public (boutique)
--
-- Les policies RLS de `profiles` limitent la lecture aux utilisateurs
-- CONNECTÉS : un visiteur anonyme (moteur de recherche, acheteur non
-- inscrit) ne voyait donc ni le nom de la boutique ni la photo de profil
-- du vendeur sur la fiche produit.
--
-- Cette fonction expose uniquement des champs PUBLICS et sûrs :
--   boutique, nom, photo, ville, bio, date d'inscription, nb de produits.
-- (Jamais le téléphone, le WhatsApp ni l'e-mail.)
-- ============================================================

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
      p.id,
      p.shop_name,
      p.full_name,
      p.avatar_url,
      p.city,
      p.bio,
      p.created_at,
      (SELECT count(*) FROM public.products pr
        WHERE pr.owner_id = p.id AND pr.published = true) AS products_count
    FROM public.profiles p
    WHERE p.id = p_seller_id
  ) t;

  RETURN v; -- NULL si le profil n'existe pas
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_public_seller(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_seller(uuid) TO anon, authenticated;
