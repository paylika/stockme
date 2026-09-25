-- ============================================================
-- StockMe — IA, étape 1 : enrichissement des fiches + journal
--
-- À coller dans Supabase → SQL Editor.
-- Ce script ne change RIEN au comportement actuel du site : il ajoute
-- seulement les rangements dont l'IA a besoin.
--
--   1. Trois colonnes sur `products` pour les mots-clés et attributs que
--      DeepSeek génère à partir du nom, de la catégorie et de la description.
--      C'est le socle : sans vocabulaire, aucune recherche intelligente n'est
--      bonne (beaucoup de fiches n'ont qu'un nom court).
--   2. Le journal des appels IA : coût, latence, qualité — et le compteur
--      anti-abus (plafonds par utilisateur et par jour).
--
-- Idempotent : peut être relancé sans effet de bord.
-- ============================================================

-- ------------------------------------------------------------------
-- 1. Colonnes d'enrichissement
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
-- C) Coût des appels IA (après quelques utilisations)
-- select kind, count(*), sum(input_tokens) as tokens_entree, sum(output_tokens) as tokens_sortie,
--        round(avg(latency_ms)) as latence_moyenne_ms
--   from public.ai_calls group by kind order by 2 desc;
