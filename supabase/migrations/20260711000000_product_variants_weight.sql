
-- Variantes produit : tailles (jusqu'à 5XL), couleurs, et poids
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS sizes text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS colors text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS weight_grams integer;
