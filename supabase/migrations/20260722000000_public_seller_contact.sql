-- ============================================================
-- StockMe — Contact du vendeur sur sa boutique publique
--
-- Constat : les acheteurs contactaient le numéro de StockMe en pensant
-- joindre le vendeur, parce que le numéro du vendeur n'apparaissait pas
-- sur sa boutique. Cette fonction expose donc le contact du vendeur
-- (téléphone + WhatsApp) pour l'afficher en évidence.
--
-- Rappel : le numéro WhatsApp du vendeur est DÉJÀ public (colonne
-- products.whatsapp, lisible par tous) — il ne s'agit donc pas d'une
-- nouvelle divulgation, seulement d'un affichage clair au bon endroit.
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
      p.id, p.shop_name, p.full_name, p.avatar_url, p.city, p.bio, p.created_at,
      p.phone, p.whatsapp,
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
