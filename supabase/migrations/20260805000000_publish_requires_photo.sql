-- ============================================================
-- StockMe — Une fiche sans photo ne peut plus être publiée
--
-- POURQUOI : 7 produits étaient visibles dans le catalogue avec une carte
-- vide (aucune photo enregistrée). Les fichiers n'existaient même pas dans le
-- stockage : l'envoi des photos avait échoué et le produit était publié quand
-- même. Une carte vide fait fuir l'acheteur et abîme la confiance.
--
-- CE QUE FAIT CE SCRIPT :
--   1. Interdit `published = true` sans au moins 1 photo (garde-fou côté base,
--      impossible à contourner par le navigateur). Les administrateurs restent
--      libres, comme pour les autres limites.
--   2. Repasse en « masqué » les fiches déjà publiées sans photo. Elles
--      réapparaîtront dès que le vendeur ajoute une photo et remet en ligne.
--
-- Idempotent : peut être collé plusieurs fois sans effet de bord.
-- ============================================================

-- ------------------------------------------------------------------
-- 1. Garde-fou : pas de publication sans photo
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.products_require_photo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Les administrateurs ne sont jamais bloqués (modération).
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

-- ------------------------------------------------------------------
-- 2. On masque les fiches déjà publiées sans photo
--    (elles restent dans le tableau de bord du vendeur, avec le rappel
--     « Photo manquante — ajoutez-en une »)
-- ------------------------------------------------------------------
UPDATE public.products
   SET published = false
 WHERE published = true
   AND coalesce(array_length(images, 1), 0) = 0;

-- ------------------------------------------------------------------
-- 3. Contrôle : doit renvoyer 0
-- ------------------------------------------------------------------
-- select count(*) as fiches_publiees_sans_photo
--   from public.products
--  where published = true and coalesce(array_length(images, 1), 0) = 0;
