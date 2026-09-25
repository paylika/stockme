-- ============================================================
-- StockMe — Socle de l'IA (recherche intelligente)
--
-- À coller dans Supabase → SQL Editor. Ce script prépare TOUT ce dont
-- l'intelligence artificielle a besoin, sans toucher à l'existant :
--
--   1. Les colonnes d'enrichissement des fiches (mots-clés et attributs
--      produits par DeepSeek) — c'est le socle : sans vocabulaire, aucune
--      recherche intelligente n'est bonne.
--   2. Le JOURNAL des appels IA : coût, latence, qualité, et compteur
--      anti-abus (plafonds par utilisateur et par jour).
--   3. La fonction de RECHERCHE INTELLIGENTE qui classe les résultats en
--      gardant tes règles commerciales : mise en avant payée d'abord, puis
--      fournisseur vérifié, puis pertinence.
--
-- Idempotent : peut être relancé sans effet de bord.
-- ============================================================

-- ------------------------------------------------------------------
-- 1. Enrichissement des fiches
-- ------------------------------------------------------------------
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS ai_keywords text[];
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS ai_attrs jsonb;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS ai_enriched_at timestamptz;

-- Index pour retrouver vite un produit par ses mots-clés.
CREATE INDEX IF NOT EXISTS products_ai_keywords_idx ON public.products USING gin (ai_keywords);

-- ------------------------------------------------------------------
-- 2. Journal + quotas des appels IA
-- ------------------------------------------------------------------
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

-- Aucune lecture publique : seul le serveur écrit (clé de service).
-- Les administrateurs peuvent consulter les chiffres.
DROP POLICY IF EXISTS ai_calls_admin_read ON public.ai_calls;
CREATE POLICY ai_calls_admin_read ON public.ai_calls
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ------------------------------------------------------------------
-- 3. Recherche intelligente
--
--    L'IA ne décide PAS du classement : elle traduit la demande de
--    l'acheteur en mots-clés et en filtres. Le classement reste ici, où
--    vivent les règles commerciales (boost payé, vendeur vérifié).
-- ------------------------------------------------------------------
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
  -- Avec des mots-clés, on ne garde que les produits qui en contiennent au
  -- moins un (sinon on afficherait du hasard). Sans mot-clé, on garde tout.
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
        -- 1) ce que l'acheteur a demandé
        c_name_weight * f.name_hits
        + c_keyword_weight * f.all_hits
        -- 2) la qualité et l'activité du produit
        + 3 * ln(1 + coalesce(ev.contacts_30, 0))
        + 1.5 * ln(1 + coalesce(ev.views_30, 0))
        + 2 * ln(1 + coalesce(fv.favorites, 0))
        + 18 * exp(-f.age_days / 12.0)
        + 1.5 * ln(1 + coalesce(ev.events_7, 0))
        + (CASE WHEN f.promo_price_fcfa IS NOT NULL AND f.promo_price_fcfa < f.price_fcfa THEN 10 ELSE 0 END)
        -- 3) tes règles commerciales
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
       -- À pertinence comparable : la mise en avant payée passe devant,
       -- puis le fournisseur vérifié.
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

-- ============================================================
-- CONTRÔLES
-- ============================================================
-- A) Les colonnes existent-elles ?
-- select column_name from information_schema.columns
--  where table_name = 'products' and column_name like 'ai_%';
--
-- B) Combien de fiches enrichies ? (0 au départ, c'est normal)
-- select count(*) filter (where ai_enriched_at is not null) as enrichies,
--        count(*) as total
--   from public.products where published = true;
--
-- C) La recherche intelligente répond-elle ? (doit renvoyer des produits)
-- select public.search_products_ai(array['savon','mains'], null, null, null, null, null, 'pertinence', 5, 0);
--
-- D) Coût des appels IA (après quelques utilisations)
-- select kind, count(*), sum(input_tokens) as tokens_entree, sum(output_tokens) as tokens_sortie,
--        round(avg(latency_ms)) as latence_moyenne_ms
--   from public.ai_calls group by kind order by 2 desc;
