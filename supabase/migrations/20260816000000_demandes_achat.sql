-- ============================================================
-- StockMe — DEMANDES D'ACHAT (« Je recherche »)
--
-- L'acheteur poste ce qu'il cherche (produit absent du site), les fournisseurs
-- qui l'ont postulent (« J'ai ce produit »), et l'acheteur choisit qui il
-- contacte. Le numéro de l'acheteur n'est JAMAIS exposé.
--
-- Garde-fous : 3 demandes actives max, 1 par jour, numéros masqués dans le
-- texte, réponse réservée aux vendeurs ayant ≥ 1 produit en ligne.
-- Idempotent : relançable sans effet de bord.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Tables
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.buying_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  category text,
  quantity int,
  unit text NOT NULL DEFAULT 'pièces',
  budget_fcfa int,
  city text,
  country text,
  image_url text,
  ai_keywords text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'hidden')),
  responses_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 days'
);

CREATE INDEX IF NOT EXISTS buying_requests_open_idx
  ON public.buying_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS buying_requests_category_idx ON public.buying_requests(category);
CREATE INDEX IF NOT EXISTS buying_requests_city_idx ON public.buying_requests(city);

CREATE TABLE IF NOT EXISTS public.request_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.buying_requests(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message text,
  price_fcfa int,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS request_responses_unique_idx
  ON public.request_responses (request_id, seller_id);

CREATE TABLE IF NOT EXISTS public.request_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.buying_requests(id) ON DELETE CASCADE,
  reporter_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS request_reports_unique_idx
  ON public.request_reports (request_id, reporter_id);

-- ------------------------------------------------------------
-- 2. Sécurité : lecture publique, écriture UNIQUEMENT par les fonctions
-- ------------------------------------------------------------
ALTER TABLE public.buying_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS buying_requests_read ON public.buying_requests;
CREATE POLICY buying_requests_read ON public.buying_requests
  FOR SELECT USING (
    status <> 'hidden'
    OR user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
  );

-- ------------------------------------------------------------
-- 3. Publier une demande
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_buying_request(
  p_title text,
  p_description text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_quantity int DEFAULT NULL,
  p_unit text DEFAULT 'pièces',
  p_budget_fcfa int DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_country text DEFAULT NULL,
  p_image_url text DEFAULT NULL,
  p_ai_keywords text[] DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_title text;
  v_desc text;
  v_masked boolean := false;
  v_open int;
  v_today int;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Connexion requise'; END IF;

  v_title := btrim(coalesce(p_title, ''));
  v_desc := btrim(coalesce(p_description, ''));

  IF length(v_title) < 8 THEN
    RETURN json_build_object('ok', false, 'reason', 'title_too_short');
  END IF;
  IF length(v_title) > 120 THEN v_title := left(v_title, 120); END IF;
  IF length(v_desc) > 1200 THEN v_desc := left(v_desc, 1200); END IF;

  -- Un numéro écrit dans le texte est MASQUÉ (les coordonnées passent par la
  -- plateforme : c'est ce qui protège l'acheteur du démarchage).
  IF v_title ~ '[0-9][0-9 .+-]{7,}[0-9]' OR v_desc ~ '[0-9][0-9 .+-]{7,}[0-9]' THEN
    v_masked := true;
    v_title := regexp_replace(v_title, '[0-9][0-9 .+-]{7,}[0-9]', '[numéro masqué]', 'g');
    v_desc := regexp_replace(v_desc, '[0-9][0-9 .+-]{7,}[0-9]', '[numéro masqué]', 'g');
  END IF;

  SELECT count(*) INTO v_open FROM public.buying_requests
   WHERE user_id = v_uid AND status = 'open' AND expires_at > now();
  IF coalesce(v_open, 0) >= 3 THEN
    RETURN json_build_object('ok', false, 'reason', 'too_many');
  END IF;

  SELECT count(*) INTO v_today FROM public.buying_requests
   WHERE user_id = v_uid AND created_at >= date_trunc('day', now());
  IF coalesce(v_today, 0) >= 1 THEN
    RETURN json_build_object('ok', false, 'reason', 'one_per_day');
  END IF;

  INSERT INTO public.buying_requests (
    user_id, title, description, category, quantity, unit, budget_fcfa,
    city, country, image_url, ai_keywords
  )
  VALUES (
    v_uid, v_title, nullif(v_desc, ''), nullif(btrim(coalesce(p_category, '')), ''),
    nullif(greatest(coalesce(p_quantity, 0), 0), 0),
    coalesce(nullif(btrim(coalesce(p_unit, '')), ''), 'pièces'),
    nullif(greatest(coalesce(p_budget_fcfa, 0), 0), 0),
    nullif(btrim(coalesce(p_city, '')), ''), nullif(btrim(coalesce(p_country, '')), ''),
    nullif(btrim(coalesce(p_image_url, '')), ''), coalesce(p_ai_keywords, '{}')
  )
  RETURNING id INTO v_id;

  RETURN json_build_object('ok', true, 'id', v_id, 'masked', v_masked);
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.create_buying_request(text, text, text, int, text, int, text, text, text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_buying_request(text, text, text, int, text, int, text, text, text, text[]) TO authenticated;

-- ------------------------------------------------------------
-- 4. Lister les demandes (public) — ou seulement les miennes
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_buying_requests(
  p_category text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_q text DEFAULT NULL,
  p_limit int DEFAULT 30,
  p_offset int DEFAULT 0,
  p_mine_only boolean DEFAULT false
)
RETURNS json
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT coalesce(json_agg(row_to_json(t)), '[]'::json) FROM (
    SELECT
      r.id, r.title, r.description, r.category, r.quantity, r.unit, r.budget_fcfa,
      r.city, r.country, r.image_url, r.ai_keywords, r.status, r.responses_count,
      r.created_at,
      greatest(0, ceil(extract(epoch FROM (r.expires_at - now())) / 86400))::int AS jours_restants,
      (r.user_id = auth.uid()) AS mine,
      coalesce(nullif(pf.shop_name, ''), 'Acheteur StockMe') AS buyer_name,
      coalesce(pf.verified AND (pf.verified_until IS NULL OR pf.verified_until > now()), false) AS buyer_verified,
      EXISTS (
        SELECT 1 FROM public.request_responses rr
         WHERE rr.request_id = r.id AND rr.seller_id = auth.uid()
      ) AS already_responded
    FROM public.buying_requests r
    LEFT JOIN public.profiles pf ON pf.id = r.user_id
    WHERE (
        (NOT coalesce(p_mine_only, false) AND r.status = 'open' AND r.expires_at > now())
        OR (coalesce(p_mine_only, false) AND r.user_id = auth.uid())
      )
      AND (p_category IS NULL OR r.category = p_category)
      AND (p_city IS NULL OR r.city = p_city)
      AND (p_q IS NULL OR r.title ILIKE '%' || p_q || '%'
           OR coalesce(r.description, '') ILIKE '%' || p_q || '%')
    ORDER BY r.created_at DESC
    LIMIT greatest(1, least(coalesce(p_limit, 30), 60))
    OFFSET greatest(coalesce(p_offset, 0), 0)
  ) t;
$fn$;
REVOKE EXECUTE ON FUNCTION public.get_buying_requests(text, text, text, int, int, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_buying_requests(text, text, text, int, int, boolean) TO anon, authenticated;

-- ------------------------------------------------------------
-- 5. Détail d'une demande + réponses (visibles par l'acheteur seulement)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_buying_request_detail(p_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_req public.buying_requests;
  v_mine boolean;
  v_responses json;
BEGIN
  SELECT * INTO v_req FROM public.buying_requests WHERE id = p_id;
  IF v_req.id IS NULL THEN
    RETURN json_build_object('ok', false, 'reason', 'not_found');
  END IF;

  v_mine := (v_req.user_id = auth.uid());
  IF v_req.status = 'hidden' AND NOT (v_mine OR public.has_role(auth.uid(), 'admin')) THEN
    RETURN json_build_object('ok', false, 'reason', 'not_found');
  END IF;

  v_responses := '[]'::json;
  IF v_mine OR public.has_role(auth.uid(), 'admin') THEN
    SELECT coalesce(json_agg(row_to_json(x)), '[]'::json) INTO v_responses FROM (
      SELECT rr.id, rr.seller_id, rr.message, rr.price_fcfa, rr.created_at,
             coalesce(nullif(pf.shop_name, ''), nullif(pf.full_name, ''), 'Fournisseur') AS seller_name,
             pf.whatsapp AS seller_whatsapp, pf.phone AS seller_phone, pf.city AS seller_city,
             coalesce(pf.verified AND (pf.verified_until IS NULL OR pf.verified_until > now()), false) AS seller_verified,
             (SELECT count(*) FROM public.products p
               WHERE p.owner_id = rr.seller_id AND p.published = true) AS seller_products
      FROM public.request_responses rr
      LEFT JOIN public.profiles pf ON pf.id = rr.seller_id
      WHERE rr.request_id = p_id
      ORDER BY rr.created_at ASC
    ) x;
  END IF;

  RETURN json_build_object(
    'ok', true,
    'request', json_build_object(
      'id', v_req.id, 'title', v_req.title, 'description', v_req.description,
      'category', v_req.category, 'quantity', v_req.quantity, 'unit', v_req.unit,
      'budget_fcfa', v_req.budget_fcfa, 'city', v_req.city, 'country', v_req.country,
      'image_url', v_req.image_url, 'status', v_req.status,
      'responses_count', v_req.responses_count, 'created_at', v_req.created_at,
      'jours_restants', greatest(0, ceil(extract(epoch FROM (v_req.expires_at - now())) / 86400))::int,
      'mine', v_mine,
      'buyer_name', coalesce(
        (SELECT nullif(pf.shop_name, '') FROM public.profiles pf WHERE pf.id = v_req.user_id),
        'Acheteur StockMe'),
      'already_responded', EXISTS (
        SELECT 1 FROM public.request_responses rr
         WHERE rr.request_id = v_req.id AND rr.seller_id = auth.uid())
    ),
    'responses', v_responses
  );
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.get_buying_request_detail(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_buying_request_detail(uuid) TO anon, authenticated;

-- ------------------------------------------------------------
-- 6. Répondre (« J'ai ce produit »)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.respond_to_buying_request(
  p_request_id uuid,
  p_message text DEFAULT NULL,
  p_price_fcfa int DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_req public.buying_requests;
  v_products int;
  v_count int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Connexion requise'; END IF;

  SELECT * INTO v_req FROM public.buying_requests WHERE id = p_request_id;
  IF v_req.id IS NULL THEN RETURN json_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF v_req.user_id = v_uid THEN RETURN json_build_object('ok', false, 'reason', 'own_request'); END IF;
  IF v_req.status <> 'open' OR v_req.expires_at <= now() THEN
    RETURN json_build_object('ok', false, 'reason', 'closed');
  END IF;

  SELECT count(*) INTO v_products
    FROM public.products WHERE owner_id = v_uid AND published = true;
  IF coalesce(v_products, 0) = 0 THEN
    RETURN json_build_object('ok', false, 'reason', 'no_products');
  END IF;

  IF EXISTS (SELECT 1 FROM public.request_responses
              WHERE request_id = p_request_id AND seller_id = v_uid) THEN
    RETURN json_build_object('ok', false, 'reason', 'already');
  END IF;

  INSERT INTO public.request_responses (request_id, seller_id, message, price_fcfa)
  VALUES (
    p_request_id, v_uid,
    nullif(btrim(coalesce(p_message, '')), ''),
    nullif(greatest(coalesce(p_price_fcfa, 0), 0), 0)
  );

  UPDATE public.buying_requests
     SET responses_count = responses_count + 1, updated_at = now()
   WHERE id = p_request_id
  RETURNING responses_count INTO v_count;

  RETURN json_build_object('ok', true, 'count', coalesce(v_count, 1));
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.respond_to_buying_request(uuid, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_to_buying_request(uuid, text, int) TO authenticated;

-- ------------------------------------------------------------
-- 7. Clôturer, signaler, modérer
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.close_buying_request(p_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Connexion requise'; END IF;
  UPDATE public.buying_requests
     SET status = 'closed', updated_at = now()
   WHERE id = p_id AND (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
  RETURN json_build_object('ok', true);
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.close_buying_request(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.close_buying_request(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.report_buying_request(p_id uuid, p_reason text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Connexion requise'; END IF;
  INSERT INTO public.request_reports (request_id, reporter_id, reason)
  VALUES (p_id, auth.uid(), left(coalesce(p_reason, ''), 300))
  ON CONFLICT (request_id, reporter_id) DO NOTHING;
  RETURN json_build_object('ok', true);
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.report_buying_request(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_buying_request(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_buying_request_status(p_id uuid, p_status text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Accès réservé aux administrateurs';
  END IF;
  IF p_status NOT IN ('open', 'closed', 'hidden') THEN
    RAISE EXCEPTION 'Statut inconnu';
  END IF;
  UPDATE public.buying_requests SET status = p_status, updated_at = now() WHERE id = p_id;
  RETURN json_build_object('ok', true);
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.admin_set_buying_request_status(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_buying_request_status(uuid, text) TO authenticated;

-- ------------------------------------------------------------
-- 8. Liste admin + compteur du menu
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_buying_requests()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v json;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Accès réservé aux administrateurs';
  END IF;
  SELECT coalesce(json_agg(row_to_json(t)), '[]'::json) INTO v FROM (
    SELECT r.id, r.title, r.description, r.category, r.quantity, r.unit, r.budget_fcfa,
           r.city, r.status, r.responses_count, r.created_at,
           coalesce(nullif(pf.shop_name, ''), nullif(pf.full_name, ''), '-') AS demandeur,
           pf.whatsapp AS demandeur_whatsapp, pf.phone AS demandeur_phone,
           (SELECT count(*) FROM public.request_reports rp WHERE rp.request_id = r.id) AS signalements
    FROM public.buying_requests r
    LEFT JOIN public.profiles pf ON pf.id = r.user_id
    ORDER BY (SELECT count(*) FROM public.request_reports rp WHERE rp.request_id = r.id) DESC,
             r.created_at DESC
    LIMIT 100
  ) t;
  RETURN v;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.admin_buying_requests() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_buying_requests() TO authenticated;

CREATE OR REPLACE FUNCTION public.count_matching_requests()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_cats text[];
  v_city text;
  v_n int;
BEGIN
  IF v_uid IS NULL THEN RETURN 0; END IF;

  SELECT array_agg(DISTINCT p.category), (array_agg(p.city ORDER BY p.created_at DESC))[1]
    INTO v_cats, v_city
    FROM public.products p
   WHERE p.owner_id = v_uid AND p.published = true;

  IF v_cats IS NULL AND v_city IS NULL THEN RETURN 0; END IF;

  SELECT count(*) INTO v_n
    FROM public.buying_requests r
   WHERE r.status = 'open'
     AND r.expires_at > now()
     AND r.user_id <> v_uid
     AND NOT EXISTS (
       SELECT 1 FROM public.request_responses rr
        WHERE rr.request_id = r.id AND rr.seller_id = v_uid
     )
     AND (
       (v_cats IS NOT NULL AND r.category = ANY(v_cats))
       OR (v_city IS NOT NULL AND r.city = v_city)
     );

  RETURN coalesce(v_n, 0);
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.count_matching_requests() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_matching_requests() TO authenticated;

-- ------------------------------------------------------------
-- 9. CONTRÔLE (doit renvoyer true partout)
-- ------------------------------------------------------------
SELECT
  to_regclass('public.buying_requests') IS NOT NULL AS table_demandes,
  to_regclass('public.request_responses') IS NOT NULL AS table_reponses,
  to_regclass('public.request_reports') IS NOT NULL AS table_signalements,
  (SELECT count(*) FROM pg_proc WHERE proname IN (
     'create_buying_request', 'get_buying_requests', 'get_buying_request_detail',
     'respond_to_buying_request', 'close_buying_request', 'report_buying_request',
     'admin_set_buying_request_status', 'admin_buying_requests', 'count_matching_requests'
   )) = 9 AS les_9_fonctions;
