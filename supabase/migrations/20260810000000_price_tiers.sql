-- ============================================================
-- StockMe — Paliers de prix par quantité (vente en gros)
--
-- À coller dans Supabase → SQL Editor.
--
-- Les acheteurs veulent savoir « combien si j'en prends plus ». On stocke donc
-- sur chaque produit une liste de paliers :
--
--   [ { "from": 10,  "to": 99,   "price": 1000 },
--     { "from": 100, "to": 499,  "price": 800  },
--     { "from": 500, "to": null, "price": 650  } ]
--
-- `to = null` signifie « et plus ». C'est exactement le modèle d'Alibaba.
-- Un produit sans palier (price_tiers NULL) garde son prix unique habituel :
-- rien ne change pour les fiches existantes.
--
-- Idempotent : peut être relancé sans effet de bord.
-- ============================================================

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS price_tiers jsonb;

-- Garde-fou minimal : ce doit être un tableau (la cohérence fine — quantités
-- croissantes, prix décroissants — est vérifiée par l'application).
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_price_tiers_is_array;
ALTER TABLE public.products
  ADD CONSTRAINT products_price_tiers_is_array
  CHECK (price_tiers IS NULL OR jsonb_typeof(price_tiers) = 'array');

-- ============================================================
-- CONTRÔLES
-- ============================================================
-- A) La colonne existe ?
-- select column_name, data_type from information_schema.columns
--  where table_name = 'products' and column_name = 'price_tiers';
--
-- B) Voir les paliers déjà saisis
-- select name, moq, price_fcfa, promo_price_fcfa, price_tiers
--   from public.products
--  where price_tiers is not null
--  limit 20;
