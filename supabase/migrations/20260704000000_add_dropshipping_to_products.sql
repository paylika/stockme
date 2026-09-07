
-- Dropshipping : un produit peut être marqué "dropshipping"
--   (vendu et livré sur commande, unité par unité) plutôt qu'en gros (lots, MOQ).
--   dropshipping = false → vente en gros (affiché sur l'accueil / browse)
--   dropshipping = true  → livraison sur commande (affiché dans la page dédiée)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS dropshipping boolean NOT NULL DEFAULT false;
