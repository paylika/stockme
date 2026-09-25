ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'gratuit';
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_plan_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_plan_check CHECK (plan IN ('gratuit', 'verifie', 'pro'));
  END IF;
END $$;
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
     SET verified = true,
         verified_at = now(),
         verified_until = v_until,
         plan = CASE WHEN plan = 'pro' THEN 'pro' ELSE 'verifie' END
   WHERE id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Utilisateur introuvable'; END IF;
  v_bonus := public.grant_verification_bonus(p_user_id, 1500);
  RETURN json_build_object('ok', true, 'verified', true, 'verified_until', v_until, 'bonus', v_bonus);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_set_seller_verified(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_seller_verified(uuid, int) TO authenticated;
CREATE OR REPLACE FUNCTION public.payment_mark_paid(
  p_provider text,
  p_provider_ref text,
  p_amount int DEFAULT NULL,
  p_payload jsonb DEFAULT NULL,
  p_subscription_ref text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_intent public.payment_intents;
  v_days int;
  v_product uuid;
  v_floor int;
  v_plan text;
  v_bonus json;
BEGIN
  SELECT * INTO v_intent FROM public.payment_intents
  WHERE provider = p_provider AND provider_ref = p_provider_ref
  FOR UPDATE;
  IF v_intent.id IS NULL THEN RETURN json_build_object('ok', false, 'reason', 'intent_not_found'); END IF;
  IF v_intent.status = 'paid' THEN RETURN json_build_object('ok', true, 'reason', 'already_paid'); END IF;
  v_floor := greatest(50, (v_intent.amount_fcfa * 0.9)::int);
  IF p_amount IS NOT NULL AND p_amount > 0 AND p_amount < v_floor THEN
    RETURN json_build_object('ok', false, 'reason', 'amount_mismatch',
                             'expected', v_intent.amount_fcfa, 'received', p_amount, 'floor', v_floor);
  END IF;
  UPDATE public.payment_intents
     SET status = 'paid',
         paid_at = now(),
         provider_payload = coalesce(p_payload, provider_payload),
         metadata = CASE WHEN p_subscription_ref IS NOT NULL
                         THEN metadata || jsonb_build_object('subscription_ref', p_subscription_ref)
                         ELSE metadata END
   WHERE id = v_intent.id;
  IF v_intent.purpose = 'wallet_topup' THEN
    INSERT INTO public.wallets (user_id, balance_fcfa) VALUES (v_intent.user_id, v_intent.amount_fcfa)
    ON CONFLICT (user_id) DO UPDATE
      SET balance_fcfa = public.wallets.balance_fcfa + v_intent.amount_fcfa, updated_at = now();
    INSERT INTO public.wallet_transactions (user_id, amount_fcfa, kind, label)
    VALUES (v_intent.user_id, v_intent.amount_fcfa, 'topup',
            'Rechargement ' || v_intent.amount_fcfa || ' FCFA');
  END IF;
  IF v_intent.purpose = 'subscription' THEN
    v_days := coalesce((v_intent.metadata->>'days')::int, 365);
    v_plan := coalesce(nullif(v_intent.metadata->>'plan', ''), 'verifie');
    IF v_plan NOT IN ('verifie', 'pro') THEN v_plan := 'verifie'; END IF;
    UPDATE public.profiles
       SET verified = true,
           verified_at = coalesce(verified_at, now()),
           verified_until = greatest(coalesce(verified_until, now()), now()) + (v_days || ' days')::interval,
           plan = v_plan
     WHERE id = v_intent.user_id;
    INSERT INTO public.wallet_transactions (user_id, amount_fcfa, kind, label)
    VALUES (v_intent.user_id, -v_intent.amount_fcfa, 'subscription',
            CASE WHEN v_plan = 'pro' THEN 'Abonnement StockMe PRO' ELSE 'Abonnement fournisseur vérifié' END
            || ' (' || v_days || ' jours)');
    IF v_plan = 'pro' THEN
      v_bonus := public.grant_verification_bonus(v_intent.user_id, 1500);
    ELSE
      v_bonus := public.grant_verification_bonus(v_intent.user_id, 1500);
    END IF;
  END IF;
  IF v_intent.purpose = 'boost' THEN
    v_days := coalesce((v_intent.metadata->>'days')::int, 7);
    v_product := nullif(v_intent.metadata->>'product_id', '')::uuid;
    IF v_product IS NULL THEN RETURN json_build_object('ok', false, 'reason', 'missing_product'); END IF;
    INSERT INTO public.boost_campaigns (user_id, product_id, daily_budget_fcfa)
    VALUES (v_intent.user_id, v_product, greatest(100, v_intent.amount_fcfa / greatest(v_days, 1)));
  END IF;
  RETURN json_build_object('ok', true, 'purpose', v_intent.purpose, 'amount', v_intent.amount_fcfa, 'plan', v_plan);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.payment_mark_paid(text, text, int, jsonb, text) FROM PUBLIC, anon, authenticated;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS ai_keywords text[];
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS ai_attrs jsonb;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS ai_enriched_at timestamptz;
CREATE INDEX IF NOT EXISTS products_ai_keywords_idx ON public.products USING gin (ai_keywords);
CREATE TABLE IF NOT EXISTS public.ai_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ok boolean NOT NULL DEFAULT true,
  error text,
  latency_ms int NOT NULL DEFAULT 0,
  input_tokens int NOT NULL DEFAULT 0,
  output_tokens int NOT NULL DEFAULT 0,
  cached_tokens int NOT NULL DEFAULT 0,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_calls_kind_user_day_idx ON public.ai_calls (kind, user_id, created_at DESC);
ALTER TABLE public.ai_calls ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_calls_admin_read ON public.ai_calls;
CREATE POLICY ai_calls_admin_read ON public.ai_calls
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE OR REPLACE FUNCTION public.search_products_ai(
  p_keywords text[] DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_cities text[] DEFAULT NULL,
  p_price_min int DEFAULT NULL,
  p_price_max int DEFAULT NULL,
  p_sort text DEFAULT 'pertinence',
  p_limit int DEFAULT 24,
  p_offset int DEFAULT 0
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v json;
  c_verified_bonus constant numeric := 8;    -- avantage « fournisseur vérifié »
  c_boost_bonus constant numeric := 15;      -- produit actuellement mis en avant
  c_name_weight constant numeric := 12;      -- mot-clé trouvé dans le NOM du produit
  c_keyword_weight constant numeric := 4;    -- mot-clé trouvé ailleurs (description, mots-clés IA)
  v_has_keywords boolean := coalesce(array_length(p_keywords, 1), 0) > 0;
BEGIN
  WITH base AS (
    SELECT p.id, p.name, p.category, p.price_fcfa, p.promo_price_fcfa, p.quantity, p.moq,
           p.city, p.zone, p.images, p.sold_out, p.dropshipping, p.owner_id, p.created_at,
           extract(epoch FROM (now() - p.created_at)) / 86400.0 AS age_days,
           lower(p.name) AS haystack_name,
           lower(
             p.name || ' ' || coalesce(p.category, '') || ' ' || coalesce(p.description, '') || ' ' ||
             coalesce(array_to_string(p.ai_keywords, ' '), '')
           ) AS haystack,
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
       AND (p_price_max IS NULL OR coalesce(p.promo_price_fcfa, p.price_fcfa) <= p_price_max)
       AND (p_price_min IS NULL OR coalesce(p.promo_price_fcfa, p.price_fcfa) >= p_price_min)
  ),
  hits AS (
    SELECT b.id,
           count(*) FILTER (WHERE b.haystack_name LIKE '%' || k || '%') AS name_hits,
           count(*) FILTER (WHERE b.haystack LIKE '%' || k || '%') AS all_hits
      FROM base b
      CROSS JOIN unnest(coalesce(p_keywords, ARRAY[]::text[])) AS k
     WHERE length(k) >= 2
     GROUP BY b.id
  ),
  filtered AS (
    SELECT b.*, coalesce(h.name_hits, 0) AS name_hits, coalesce(h.all_hits, 0) AS all_hits
      FROM base b
      LEFT JOIN hits h ON h.id = b.id
     WHERE NOT v_has_keywords OR coalesce(h.all_hits, 0) > 0
  ),
  ev AS (
    SELECT e.product_id,
      count(*) FILTER (WHERE e.event = 'contact' AND e.created_at >= now() - interval '30 days') AS contacts_30,
      count(*) FILTER (WHERE e.event = 'view' AND e.created_at >= now() - interval '30 days') AS views_30,
      count(*) FILTER (WHERE e.created_at >= now() - interval '7 days') AS events_7,
      count(*) FILTER (WHERE e.event = 'contact') AS contacts_total
    FROM public.product_events e
    WHERE e.product_id IN (SELECT id FROM filtered)
    GROUP BY e.product_id
  ),
  fv AS (
    SELECT f.product_id, count(*) AS favorites
    FROM public.favorites f
    WHERE f.product_id IN (SELECT id FROM filtered)
    GROUP BY f.product_id
  ),
  scored AS (
    SELECT f.*,
      coalesce(ev.contacts_30, 0) AS contacts_30,
      coalesce(ev.views_30, 0) AS views_30,
      coalesce(ev.events_7, 0) AS events_7,
      coalesce(ev.contacts_total, 0) AS contacts_total,
      coalesce(fv.favorites, 0) AS favorites,
      coalesce(promo_price_fcfa, price_fcfa) AS eff_price,
      (CASE WHEN promo_price_fcfa IS NOT NULL AND promo_price_fcfa < price_fcfa THEN 1 ELSE 0 END) AS is_promo,
      (
        c_name_weight * f.name_hits
        + c_keyword_weight * f.all_hits
        + 3 * ln(1 + coalesce(ev.contacts_30, 0))
        + 1.5 * ln(1 + coalesce(ev.views_30, 0))
        + 2 * ln(1 + coalesce(fv.favorites, 0))
        + 18 * exp(-f.age_days / 12.0)
        + 1.5 * ln(1 + coalesce(ev.events_7, 0))
        + (CASE WHEN f.promo_price_fcfa IS NOT NULL AND f.promo_price_fcfa < f.price_fcfa THEN 10 ELSE 0 END)
        + (CASE WHEN f.seller_verified THEN c_verified_bonus ELSE 0 END)
        + (CASE WHEN f.is_boosted THEN c_boost_bonus ELSE 0 END)
        - (CASE WHEN f.sold_out THEN 20 ELSE 0 END)
      ) AS score
    FROM filtered f
    LEFT JOIN ev ON ev.product_id = f.id
    LEFT JOIN fv ON fv.product_id = f.id
  )
  SELECT coalesce(json_agg(row_to_json(t)), '[]'::json) INTO v FROM (
    SELECT id, name, category, price_fcfa, promo_price_fcfa, quantity, moq, city, zone, images,
           sold_out, dropshipping, owner_id, seller_verified, is_boosted,
           name_hits, all_hits, round(score::numeric, 2) AS score,
           contacts_total, views_30, favorites
      FROM scored
     ORDER BY
       CASE WHEN p_sort = 'prix_asc' THEN eff_price END ASC NULLS LAST,
       CASE WHEN p_sort = 'prix_desc' THEN eff_price END DESC NULLS LAST,
       CASE WHEN p_sort = 'nouveau' THEN created_at END DESC NULLS LAST,
       CASE WHEN p_sort = 'populaire' THEN contacts_total END DESC NULLS LAST,
       score DESC,
       CASE WHEN is_boosted THEN 0 ELSE 1 END,
       CASE WHEN seller_verified THEN 0 ELSE 1 END,
       created_at DESC
     LIMIT greatest(p_limit, 1) OFFSET greatest(p_offset, 0)
  ) t;
  RETURN v;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.search_products_ai(text[], text, text, text[], int, int, text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_products_ai(text[], text, text, text[], int, int, text, int, int) TO anon, authenticated;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS price_tiers jsonb;
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_price_tiers_is_array;
ALTER TABLE public.products
  ADD CONSTRAINT products_price_tiers_is_array
  CHECK (price_tiers IS NULL OR jsonb_typeof(price_tiers) = 'array');
ALTER TABLE public.wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_kind_check;
ALTER TABLE public.wallet_transactions
  ADD CONSTRAINT wallet_transactions_kind_check
  CHECK (kind IN ('topup', 'boost', 'subscription', 'refund', 'adjustment', 'publication'));
CREATE OR REPLACE FUNCTION public.products_guard_limits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c_max_images   constant int := 10;   -- photos par produit, pour tout le monde
  c_free_products constant int := 20;  -- publications offertes
  c_extra_price  constant int := 500;  -- prix d'une publication supplémentaire
  v_count int;
  v_balance int;
BEGIN
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  IF coalesce(array_length(NEW.images, 1), 0) > c_max_images THEN
    RAISE EXCEPTION 'Maximum % photos par produit.', c_max_images;
  END IF;
  IF TG_OP = 'INSERT' OR (NEW.published = true AND coalesce(OLD.published, false) = false) THEN
    SELECT count(*) INTO v_count
      FROM public.products
     WHERE owner_id = NEW.owner_id
       AND published = true
       AND id <> NEW.id;
    IF coalesce(v_count, 0) >= c_free_products THEN
      SELECT coalesce(balance_fcfa, 0) INTO v_balance
        FROM public.wallets WHERE user_id = NEW.owner_id;
      v_balance := coalesce(v_balance, 0);
      IF v_balance < c_extra_price THEN
        RAISE EXCEPTION
          'Vous avez atteint vos % produits publiés offerts. Chaque publication supplémentaire coûte % FCFA : rechargez votre solde (disponible : % FCFA).',
          c_free_products, c_extra_price, v_balance;
      END IF;
      UPDATE public.wallets
         SET balance_fcfa = balance_fcfa - c_extra_price, updated_at = now()
       WHERE user_id = NEW.owner_id;
      INSERT INTO public.wallet_transactions (user_id, amount_fcfa, kind, label)
      VALUES (NEW.owner_id, -c_extra_price, 'publication',
              'Publication supplémentaire — ' || c_extra_price || ' FCFA');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.products_guard_limits() FROM PUBLIC;
CREATE OR REPLACE FUNCTION public.products_require_photo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  IF coalesce(NEW.published, false)
     AND coalesce(array_length(NEW.images, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Ajoutez au moins 1 photo avant de mettre ce produit en ligne.';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.products_require_photo() FROM PUBLIC;
DROP TRIGGER IF EXISTS products_require_photo ON public.products;
CREATE TRIGGER products_require_photo
  BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.products_require_photo();
UPDATE public.products
   SET published = false
 WHERE published = true
   AND coalesce(array_length(images, 1), 0) = 0;
CREATE OR REPLACE FUNCTION public.boost_set_status(p_campaign_id uuid, p_status text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_c public.boost_campaigns;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Connexion requise'; END IF;
  IF p_status NOT IN ('active', 'paused', 'ended') THEN RAISE EXCEPTION 'Statut invalide'; END IF;
  SELECT * INTO v_c FROM public.boost_campaigns
  WHERE id = p_campaign_id AND user_id = auth.uid() FOR UPDATE;
  IF v_c.id IS NULL THEN RAISE EXCEPTION 'Campagne introuvable'; END IF;
  IF p_status = 'active' THEN
    IF coalesce((SELECT balance_fcfa FROM public.wallets WHERE user_id = auth.uid()), 0) < v_c.daily_budget_fcfa THEN
      RETURN json_build_object('ok', false, 'reason', 'insufficient_balance', 'needed', v_c.daily_budget_fcfa);
    END IF;
  END IF;
  UPDATE public.boost_campaigns SET status = p_status WHERE id = p_campaign_id;
  IF v_c.ad_id IS NOT NULL AND p_status <> 'active' THEN
    UPDATE public.ads SET active = false, ends_at = least(coalesce(ends_at, now()), now()) WHERE id = v_c.ad_id;
  END IF;
  IF v_c.ad_id IS NOT NULL AND p_status = 'active' THEN
    UPDATE public.ads
       SET active = true,
           starts_at = least(coalesce(starts_at, now()), now()),
           ends_at = greatest(coalesce(ends_at, now()), now()) + interval '1 day',
           weight = public.boost_weight(v_c.daily_budget_fcfa)
     WHERE id = v_c.ad_id;
  END IF;
  RETURN json_build_object('ok', true, 'status', p_status);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.boost_set_status(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.boost_set_status(uuid, text) TO authenticated;
UPDATE public.ads a
   SET active = true,
       starts_at = least(coalesce(a.starts_at, now()), now()),
       ends_at = greatest(coalesce(a.ends_at, now()), now()) + interval '1 day',
       weight = public.boost_weight(
         (SELECT c.daily_budget_fcfa FROM public.boost_campaigns c WHERE c.ad_id = a.id LIMIT 1)
       )
 WHERE a.kind = 'product'
   AND EXISTS (
     SELECT 1
       FROM public.boost_campaigns c
       JOIN public.wallets w ON w.user_id = c.user_id
      WHERE c.ad_id = a.id
        AND c.status = 'active'
        AND coalesce(w.balance_fcfa, 0) >= c.daily_budget_fcfa
   );
CREATE OR REPLACE FUNCTION public.log_ad_event(p_ad_id uuid, p_event text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_owner uuid;
BEGIN
  IF p_event NOT IN ('impression', 'click') THEN
    RETURN;
  END IF;
  SELECT p.owner_id INTO v_owner
    FROM public.ads a
    JOIN public.products p ON p.id = a.product_id
   WHERE a.id = p_ad_id;
  IF auth.uid() IS NOT NULL AND auth.uid() = v_owner THEN
    RETURN;
  END IF;
  IF auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin') THEN
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
CREATE OR REPLACE FUNCTION public.boost_self_heal()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_fixed int := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Connexion requise'; END IF;
  UPDATE public.ads a
     SET active = true,
         starts_at = least(coalesce(a.starts_at, now()), now()),
         ends_at = greatest(coalesce(a.ends_at, now()), date_trunc('day', now()) + interval '1 day'),
         weight = public.boost_weight(c.daily_budget_fcfa)
    FROM public.boost_campaigns c
    JOIN public.wallets w ON w.user_id = c.user_id
   WHERE c.ad_id = a.id
     AND c.user_id = v_uid
     AND c.status = 'active'
     AND coalesce(w.balance_fcfa, 0) >= c.daily_budget_fcfa
     AND (a.active = false OR a.ends_at IS NULL OR a.ends_at < now());
  GET DIAGNOSTICS v_fixed = ROW_COUNT;
  RETURN json_build_object('ok', true, 'repaired', v_fixed);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.boost_self_heal() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.boost_self_heal() TO authenticated;
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
      p.sold_out, p.dropshipping, p.owner_id, p.price_tiers,
      coalesce(pf.verified AND (pf.verified_until IS NULL OR pf.verified_until > now()), false) AS seller_verified
    FROM public.ads a
    JOIN public.products p ON p.id = a.product_id
    LEFT JOIN public.profiles pf ON pf.id = p.owner_id
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