
-- Infos "vendeur" affichées publiquement (profil public + future section "À propos" du produit) :
--   shop_name   → nom de la boutique / marque
--   avatar_url  → photo de profil / logo (stockée dans le bucket public "product-images")
--   bio         → description "À propos" du vendeur
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS shop_name text,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS bio text;
