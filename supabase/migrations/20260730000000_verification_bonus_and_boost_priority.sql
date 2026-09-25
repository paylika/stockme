-- ============================================================
-- StockMe — Bonus de vérification (72 h de boost offertes)
--              + priorité des produits boostés dans le classement
--
-- 1. Quand une boutique est VÉRIFIÉE (activation par l'admin ou paiement
--    Stripe), on crédite automatiquement 1 500 FCFA de solde — soit 72 h de
--    mise en avant à 500 F/jour. Le vendeur découvre la valeur du boost
--    immédiatement, et c'est un argument de vente de la vérification.
--    → Idempotent : un seul bonus par vendeur, jamais deux.
--
-- 2. Les produits EN COURS DE BOOST remontent dans le classement (accueil
--    et recherche) : c'est ce que le vendeur achète. Bonus modéré pour ne
--    pas écraser les bons produits non sponsorisés.
-- ============================================================

-- ------------------------------------------------------------------
-- 1. Bonus de bienvenue à la vérification
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.grant_verification_bonus(p_user_id uuid, p_amount_fcfa int DEFAULT 1500)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_already boolean;
BEGIN
  IF p_user_id IS NULL THEN RETURN json_build_object('ok', false, 'reason', 'missing_user'); END IF;

  -- Déjà offert ? (un seul bonus par vendeur)
  SELECT EXISTS (
    SELECT 1 FROM public.wallet_transactions
    WHERE user_id = p_user_id AND kind = 'adjustment' AND label LIKE 'Bonus vérification%'
  ) INTO v_already;

  IF v_already THEN
    RETURN json_build_object('ok', true, 'reason', 'already_granted');
  END IF;

  INSERT INTO public.wallets (user_id, balance_fcfa)
  VALUES (p_user_id, greatest(p_amount_fcfa, 0))
  ON CONFLICT (user_id) DO UPDATE
    SET balance_fcfa = public.wallets.balance_fcfa + greatest(p_amount_fcfa, 0),
        updated_at = now();

  INSERT INTO public.wallet_transactions (user_id, amount_fcfa, kind, label)
  VALUES (p_user_id, greatest(p_amount_fcfa, 0), 'adjustment',
          'Bonus vérification — ' || greatest(p_amount_fcfa, 0) || ' FCFA de mise en avant offerts');

  RETURN json_build_object('ok', true, 'granted', greatest(p_amount_fcfa, 0));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.grant_verification_bonus(uuid, int) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------
-- 2. Activation de la vérification par l'admin + bonus automatique
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_seller_verified(p_user_id uuid, p_months int DEFAULT 12)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_until timestamptz; v_bonus json;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Accès réservé aux administrateurs';
  END IF;

  v_until := CASE WHEN p_months IS NULL THEN NULL ELSE now() + (p_months || ' months')::interval END;

  UPDATE public.profiles
     SET verified = true, verified_at = now(), verified_until = v_until
   WHERE id = p_user_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Utilisateur introuvable'; END IF;

  v_bonus := public.grant_verification_bonus(p_user_id, 1500);

  RETURN json_build_object('ok', true, 'verified', true, 'verified_until', v_until, 'bonus', v_bonus);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_set_seller_verified(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_seller_verified(uuid, int) TO authenticated;

-- ------------------------------------------------------------------
-- 3. Classement : priorité aux produits boostés
-- ------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_ranked_products(text, int, int, text, text[], text, text, boolean);

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
  c_verified_bonus constant numeric := 8;   -- avantage « fournisseur vérifié »
  c_boost_bonus constant numeric := 15;     -- produit actuellement mis en avant (payé)
BEGIN
  WITH base AS (
    SELECT p.id, p.name, p.category, p.price_fcfa, p.promo_price_fcfa, p.quantity, p.moq,
           p.city, p.zone, p.images, p.sold_out, p.dropshipping, p.owner_id, p.created_at,
           extract(epoch FROM (now() - p.created_at)) / 86400.0 AS age_days,
           coalesce(pf.verified AND (pf.verified_until IS NULL OR pf.verified_until > now()), false) AS seller_verified,
           EXISTS (
             SELECT 1 FROM public.ads a
             WHERE a.product_id = p.id AND a.kind = 'product' AND a.active = true
               AND a.starts_at <= now() AND (a.ends_at IS NULL OR a.ends_at >= now())
           ) AS is_boosted
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
        + (CASE WHEN b.is_boosted THEN c_boost_bonus ELSE 0 END)
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
          + (CASE WHEN is_boosted THEN c_boost_bonus ELSE 0 END)
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
           sold_out, dropshipping, owner_id, seller_verified, is_boosted,
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
      -- À tri égal, la mise en avant payée passe devant.
      CASE WHEN is_boosted THEN 0 ELSE 1 END,
      CASE WHEN seller_verified THEN 0 ELSE 1 END,
      created_at DESC
    LIMIT greatest(p_limit, 1) OFFSET greatest(p_offset, 0)
  ) t;
  RETURN v;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_ranked_products(text, int, int, text, text[], text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_ranked_products(text, int, int, text, text[], text, text, boolean) TO anon, authenticated;
