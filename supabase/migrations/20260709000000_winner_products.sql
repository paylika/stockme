
-- ============================================================
-- "Potentiel produit Winner" : les produits les plus sollicités
--   (classés par contacts puis vues, avec favoris)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_winner_products(p_limit int DEFAULT 8)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v json;
BEGIN
  SELECT coalesce(json_agg(row_to_json(t)), '[]'::json) INTO v FROM (
    SELECT p.id, p.name, p.category, p.price_fcfa, p.promo_price_fcfa, p.quantity, p.moq,
           p.city, p.zone, p.images, p.sold_out, p.dropshipping,
           coalesce(ev.contacts, 0) AS contacts,
           coalesce(ev.views, 0) AS views,
           coalesce(fv.favorites, 0) AS favorites
    FROM public.products p
    JOIN (
      SELECT product_id,
        count(*) FILTER (WHERE event = 'contact') AS contacts,
        count(*) FILTER (WHERE event = 'view') AS views
      FROM public.product_events
      GROUP BY product_id
    ) ev ON ev.product_id = p.id
    LEFT JOIN (
      SELECT product_id, count(*) AS favorites FROM public.favorites GROUP BY product_id
    ) fv ON fv.product_id = p.id
    WHERE p.published = true AND p.dropshipping = false
    ORDER BY coalesce(ev.contacts, 0) DESC, coalesce(ev.views, 0) DESC, coalesce(fv.favorites, 0) DESC, p.created_at DESC
    LIMIT greatest(p_limit, 1)
  ) t;
  RETURN v;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_winner_products(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_winner_products(int) TO anon, authenticated;
