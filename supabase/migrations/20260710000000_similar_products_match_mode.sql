
-- ============================================================
-- Produits similaires : on reste DANS LE MÊME MODE
--   (un produit en dropshipping → recommandations dropshipping uniquement,
--    un produit en gros → recommandations en gros uniquement)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_similar_products(p_product_id uuid, p_limit int DEFAULT 8)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v json;
  v_category text;
  v_dropship boolean;
BEGIN
  SELECT category, dropshipping INTO v_category, v_dropship
  FROM public.products WHERE id = p_product_id;

  SELECT coalesce(json_agg(row_to_json(t)), '[]'::json) INTO v FROM (
    SELECT p.id, p.name, p.category, p.price_fcfa, p.promo_price_fcfa, p.city, p.zone,
           p.images, p.sold_out, p.dropshipping,
           coalesce(ev.views, 0) AS views,
           coalesce(ev.contacts, 0) AS contacts,
           coalesce(fv.favorites, 0) AS favorites
    FROM public.products p
    LEFT JOIN (
      SELECT product_id,
        count(*) FILTER (WHERE event = 'view') AS views,
        count(*) FILTER (WHERE event = 'contact') AS contacts
      FROM public.product_events
      GROUP BY product_id
    ) ev ON ev.product_id = p.id
    LEFT JOIN (
      SELECT product_id, count(*) AS favorites FROM public.favorites GROUP BY product_id
    ) fv ON fv.product_id = p.id
    WHERE p.published = true
      AND p.id <> p_product_id
      AND p.dropshipping = coalesce(v_dropship, false)
      AND (v_category IS NULL OR p.category = v_category)
    ORDER BY coalesce(ev.contacts, 0) DESC, coalesce(ev.views, 0) DESC, p.created_at DESC
    LIMIT greatest(p_limit, 1)
  ) t;
  RETURN v;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_similar_products(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_similar_products(uuid, int) TO anon, authenticated;
