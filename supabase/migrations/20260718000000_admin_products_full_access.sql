-- ============================================================
-- StockMe — Console admin : accès complet sur les produits
--
-- Les policies RLS de `products` n'autorisent la modification qu'au
-- propriétaire (owner_id = auth.uid()). Un administrateur ne pouvait donc
-- ni dépublier, ni marquer épuisé, ni supprimer le produit d'un vendeur.
-- Ces fonctions SECURITY DEFINER donnent ce pouvoir aux admins uniquement,
-- avec une liste blanche de champs modifiables (jamais owner_id).
-- ============================================================

-- ------------------------------------------------------------------
-- Modifier un produit (dépublier, épuisé, prix, stock, MOQ, dropshipping)
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_update_product(p_id uuid, p_patch jsonb)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_row public.products;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Accès réservé aux administrateurs';
  END IF;

  UPDATE public.products p SET
    published        = coalesce((p_patch->>'published')::boolean, p.published),
    sold_out         = coalesce((p_patch->>'sold_out')::boolean, p.sold_out),
    dropshipping     = coalesce((p_patch->>'dropshipping')::boolean, p.dropshipping),
    price_fcfa       = coalesce((p_patch->>'price_fcfa')::int, p.price_fcfa),
    promo_price_fcfa = CASE WHEN p_patch ? 'promo_price_fcfa'
                            THEN NULLIF(p_patch->>'promo_price_fcfa','')::int
                            ELSE p.promo_price_fcfa END,
    quantity         = coalesce((p_patch->>'quantity')::int, p.quantity),
    moq              = coalesce((p_patch->>'moq')::int, p.moq)
  WHERE p.id = p_id
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Produit introuvable';
  END IF;

  RETURN to_jsonb(v_row);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_update_product(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_product(uuid, jsonb) TO authenticated;

-- ------------------------------------------------------------------
-- Supprimer un produit (les annonces et commandes liées suivent en cascade)
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_delete_product(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Accès réservé aux administrateurs';
  END IF;

  DELETE FROM public.products WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produit introuvable';
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_delete_product(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_product(uuid) TO authenticated;

-- ------------------------------------------------------------------
-- Lister TOUS les produits d'un utilisateur (publiés ou non) + leurs stats
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_user_products(p_user_id uuid)
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
      p.id, p.name, p.category, p.city,
      p.price_fcfa, p.promo_price_fcfa, p.quantity, p.moq, p.images,
      p.published, p.sold_out, p.dropshipping, p.created_at,
      coalesce(e.views, 0)     AS views,
      coalesce(e.contacts, 0)  AS contacts,
      coalesce(f.favorites, 0) AS favorites
    FROM public.products p
    LEFT JOIN (
      SELECT product_id,
             count(*) FILTER (WHERE event = 'view')    AS views,
             count(*) FILTER (WHERE event = 'contact') AS contacts
      FROM public.product_events
      GROUP BY product_id
    ) e ON e.product_id = p.id
    LEFT JOIN (
      SELECT product_id, count(*) AS favorites
      FROM public.favorites
      GROUP BY product_id
    ) f ON f.product_id = p.id
    WHERE p.owner_id = p_user_id
    ORDER BY p.created_at DESC
  ) t;

  RETURN v;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_list_user_products(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_user_products(uuid) TO authenticated;
