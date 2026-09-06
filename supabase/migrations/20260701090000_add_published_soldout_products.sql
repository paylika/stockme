
-- Ajoute les statuts de visibilité des produits :
--   published = false → produit dépublié (caché des listes publiques / fiche publique)
--   sold_out  = true  → produit marqué "Épuisé" (reste visible mais contact désactivé)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS published boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sold_out boolean NOT NULL DEFAULT false;

-- Index léger pour les requêtes publiques "published = true"
CREATE INDEX IF NOT EXISTS products_published_idx ON public.products(published);
