-- ============================================================
-- StockMe — Avantage « Fournisseur vérifié » + limites du compte gratuit
--
--   Ce script REMPLACE et COMPLÈTE 20260721000000_seller_verified_in_lists.sql
--   (si vous ne l'avez pas encore collé, collez seulement celui-ci).
--
--   1. get_ranked_products  → le badge est renvoyé (seller_verified) ET les
--      vendeurs vérifiés remontent légèrement dans le classement.
--      Nouveau paramètre p_verified_only pour le filtre « Vendeurs vérifiés ».
--   2. get_similar_products → même information.
--   3. get_verified_sellers → liste utilisée par la recherche, les favoris…
--   4. products_guard_limits → compte gratuit : 2 photos par produit et
--      10 produits publiés maximum. Le vérifié n'a aucune limite.
--      ATTENTION : aucune limite n'est rétroactive, rien n'est jamais retiré
--      du catalogue existant (on ne bloque que les NOUVELLES publications).
-- ============================================================

-- ============================================================
-- 1. Classement de l'accueil
-- ============================================================
DROP FUNCTION IF EXISTS public.get_ranked_products(text, int, int, text, text[], text, text);

CREATE OR REPLACE FUNCTION public.get_ranked_products(
  p_sort text DEFAULT 'pertinence',
  p_limit int DEFAULT 24,
  p_offset int DEFAULT 0,
  p_city text DEFAULT NULL,
  p_cities text[] DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_q text DEFAULT NULL,
  p_verified_only boolean DEFAULT false
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v json;
  -- Bonus de classement accordé aux vendeurs vérifiés (réglable ici).
  c_verified_bonus constant numeric := 8;
BEGIN
  WITH base AS (
    SELECT p.id, p.name, p.category, p.price_fcfa, p.promo_price_fcfa, p.quantity, p.moq,
           p.city, p.zone, p.images, p.sold_out, p.dropshipping, p.owner_id, p.created_at,
           extract(epoch FROM (now() - p.created_at)) / 86400.0 AS age_days,
           coalesce(pf.verified AND (pf.verified_until IS NULL OR pf.verified_until > now()), false) AS seller_verified
    FROM public.products p
    LEFT JOIN public.profiles pf ON pf.id = p.owner_id
    WHERE p.published = true
      AND (p_city IS NULL OR p.city = p_city)
      AND (p_cities IS NULL OR p.city = ANY(p_cities))
      AND (p_category IS NULL OR p.category = p_category)
      AND (p_q IS NULL OR p.name ILIKE '%' || p_q || '%')
      AND (NOT coalesce(p_verified_only, false)
           OR coalesce(pf.verified AND (pf.verified_until IS NULL OR pf.verified_until > now()), false))
  ),
  ev AS (
    SELECT e.product_id,
      count(*) FILTER (WHERE e.event = 'contact' AND e.created_at >= now() - interval '30 days') AS contacts_30,
      count(*) FILTER (WHERE e.event = 'view' AND e.created_at >= now() - interval '30 days') AS views_30,
      count(*) FILTER (WHERE e.created_at >= now() - interval '7 days') AS events_7,
      count(*) FILTER (WHERE e.event = 'contact') AS contacts_total
    FROM public.product_events e
    WHERE e.product_id IN (SELECT id FROM base)
    GROUP BY e.product_id
  ),
  fv AS (
    SELECT f.product_id, count(*) AS favorites
    FROM public.favorites f
    WHERE f.product_id IN (SELECT id FROM base)
    GROUP BY f.product_id
  ),
  scored AS (
    SELECT b.*,
      coalesce(ev.contacts_30, 0) AS contacts_30,
      coalesce(ev.views_30, 0) AS views_30,
      coalesce(ev.events_7, 0) AS events_7,
      coalesce(ev.contacts_total, 0) AS contacts_total,
      coalesce(fv.favorites, 0) AS favorites,
      (
        3 * ln(1 + coalesce(ev.contacts_30, 0))
        + 1.5 * ln(1 + coalesce(ev.views_30, 0))
        + 2 * ln(1 + coalesce(fv.favorites, 0))
        + 18 * exp(-b.age_days / 12.0)
        + 1.5 * ln(1 + coalesce(ev.events_7, 0))
        + (CASE WHEN b.promo_price_fcfa IS NOT NULL AND b.promo_price_fcfa < b.price_fcfa THEN 10 ELSE 0 END)
        + (CASE WHEN b.seller_verified THEN c_verified_bonus ELSE 0 END)
        - (CASE WHEN b.sold_out THEN 20 ELSE 0 END)
      ) AS score
    FROM base b
    LEFT JOIN ev ON ev.product_id = b.id
    LEFT JOIN fv ON fv.product_id = b.id
  ),
  ranked AS (
    SELECT s.*,
      coalesce(promo_price_fcfa, price_fcfa) AS eff_price,
      (CASE WHEN promo_price_fcfa IS NOT NULL AND promo_price_fcfa < price_fcfa THEN 1 ELSE 0 END) AS is_promo,
      row_number() OVER (PARTITION BY owner_id ORDER BY
        (
          3 * ln(1 + contacts_30) + 1.5 * ln(1 + views_30) + 2 * ln(1 + favorites)
          + 18 * exp(-age_days / 12.0) + 1.5 * ln(1 + events_7)
          + (CASE WHEN promo_price_fcfa IS NOT NULL AND promo_price_fcfa < price_fcfa THEN 10 ELSE 0 END)
          + (CASE WHEN seller_verified THEN c_verified_bonus ELSE 0 END)
          - (CASE WHEN sold_out THEN 20 ELSE 0 END)
        ) DESC, created_at DESC
      ) AS seller_rank
    FROM scored s
  ),
  final AS (
    SELECT r.*, (r.score - 4 * (r.seller_rank - 1)) AS effective_score
    FROM ranked r
  )
  SELECT coalesce(json_agg(row_to_json(t)), '[]'::json) INTO v FROM (
    SELECT id, name, category, price_fcfa, promo_price_fcfa, quantity, moq, city, zone, images,
           sold_out, dropshipping, owner_id, seller_verified,
           round(score::numeric, 2) AS score,
           contacts_total, views_30, favorites
    FROM final
    ORDER BY
      CASE WHEN p_sort = 'nouveau' THEN created_at END DESC NULLS LAST,
      CASE WHEN p_sort = 'populaire' THEN contacts_total END DESC NULLS LAST,
      CASE WHEN p_sort = 'promo' THEN is_promo END DESC NULLS LAST,
      CASE WHEN p_sort = 'prix_asc' THEN eff_price END ASC NULLS LAST,
      CASE WHEN p_sort = 'prix_desc' THEN eff_price END DESC NULLS LAST,
      CASE WHEN p_sort = 'pertinence' THEN effective_score END DESC NULLS LAST,
      -- À tri égal (ex. nouveautés), le vendeur vérifié passe devant.
      CASE WHEN seller_verified THEN 0 ELSE 1 END,
      created_at DESC
    LIMIT greatest(p_limit, 1) OFFSET greatest(p_offset, 0)
  ) t;
  RETURN v;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_ranked_products(text, int, int, text, text[], text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_ranked_products(text, int, int, text, text[], text, text, boolean) TO anon, authenticated;

-- ============================================================
-- 2. Produits similaires
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
           p.images, p.sold_out, p.dropshipping, p.owner_id,
           coalesce(pf.verified AND (pf.verified_until IS NULL OR pf.verified_until > now()), false) AS seller_verified,
           coalesce(ev.views, 0) AS views,
           coalesce(ev.contacts, 0) AS contacts,
           coalesce(fv.favorites, 0) AS favorites
    FROM public.products p
    LEFT JOIN public.profiles pf ON pf.id = p.owner_id
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

-- ============================================================
-- 3. Vendeurs vérifiés (recherche, favoris, dropshipping…)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_verified_sellers()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v json;
BEGIN
  SELECT coalesce(json_agg(json_build_object(
           'id', p.id,
           'shop_name', coalesce(p.shop_name, p.full_name),
           'city', p.city
         )), '[]'::json) INTO v
  FROM public.profiles p
  WHERE p.verified = true
    AND (p.verified_until IS NULL OR p.verified_until > now());
  RETURN v;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_verified_sellers() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_verified_sellers() TO anon, authenticated;

-- ============================================================
-- 4. Limites du compte gratuit (jamais rétroactives)
--    Non vérifié : 2 photos par produit, 10 produits publiés.
--    Vérifié     : aucune limite. Admin : jamais bloqué.
-- ============================================================
CREATE OR REPLACE FUNCTION public.products_guard_limits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_verified boolean;
  v_count int;
  c_max_images constant int := 2;
  c_max_products constant int := 10;
BEGIN
  -- Les administrateurs ne sont jamais bloqués (modération).
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  SELECT coalesce(p.verified AND (p.verified_until IS NULL OR p.verified_until > now()), false)
    INTO v_verified
  FROM public.profiles p
  WHERE p.id = NEW.owner_id;

  IF coalesce(v_verified, false) THEN
    RETURN NEW; -- compte vérifié : aucune limite
  END IF;

  -- ---- Photos : 2 maximum ----
  IF TG_OP = 'INSERT' THEN
    IF NEW.images IS NOT NULL AND coalesce(array_length(NEW.images, 1), 0) > c_max_images THEN
      RAISE EXCEPTION 'Compte non vérifié : % photos maximum par produit. Faites vérifier votre boutique (2 000 FCFA) pour en mettre jusqu''à 5.', c_max_images;
    END IF;

    -- ---- Publications : 10 maximum ----
    IF NEW.published = true THEN
      SELECT count(*) INTO v_count FROM public.products WHERE owner_id = NEW.owner_id AND published = true;
      IF v_count >= c_max_products THEN
        RAISE EXCEPTION 'Compte non vérifié : % produits publiés maximum. Faites vérifier votre boutique (2 000 FCFA) pour publier sans limite.', c_max_products;
      END IF;
    END IF;
  ELSE
    -- Édition : on ne bloque que si le vendeur AJOUTE des photos au-delà de la limite.
    IF NEW.images IS NOT NULL
       AND coalesce(array_length(NEW.images, 1), 0) > c_max_images
       AND coalesce(array_length(NEW.images, 1), 0) > coalesce(array_length(OLD.images, 1), 0) THEN
      RAISE EXCEPTION 'Compte non vérifié : % photos maximum par produit. Faites vérifier votre boutique (2 000 FCFA) pour en mettre jusqu''à 5.', c_max_images;
    END IF;

    -- Passage de « dépublié » à « publié » : le quota s'applique aussi.
    IF NEW.published = true AND coalesce(OLD.published, false) = false THEN
      SELECT count(*) INTO v_count FROM public.products WHERE owner_id = NEW.owner_id AND published = true;
      IF v_count >= c_max_products THEN
        RAISE EXCEPTION 'Compte non vérifié : % produits publiés maximum. Faites vérifier votre boutique (2 000 FCFA) pour publier sans limite.', c_max_products;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.products_guard_limits() FROM PUBLIC;

DROP TRIGGER IF EXISTS products_guard_limits ON public.products;
CREATE TRIGGER products_guard_limits
  BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.products_guard_limits();
