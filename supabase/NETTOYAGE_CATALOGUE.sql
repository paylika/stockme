-- ============================================================
-- StockMe — NETTOYAGE DU CATALOGUE (cohérence des fiches)
--
-- Trouvé en production : une fiche publiée dont le NOM est un lien
--   « https://www.alibaba.com/x/1lBGnCF?ck=pdp » (ville Bambey, 8 000 F),
--   avec en photo une CAPTURE D'ÉCRAN de l'appli Alibaba.
-- Conséquences : illisible pour l'acheteur, introuvable dans la recherche,
-- et elle passe en tête du catalogue (tri par date).
--
-- Ce script (1) liste les fiches à problèmes, (2) corrige celle-ci.
-- ============================================================


-- ============================================================
-- 1. DIAGNOSTIC — à lancer tel quel (ne modifie rien)
-- ============================================================

-- 1.a) Noms de produits qui sont des LIENS
SELECT id, name, category, city, price_fcfa, published, created_at
FROM public.products
WHERE name ~* 'https?://|www\.'
ORDER BY created_at DESC;

-- 1.b) Noms avec un numéro de téléphone (7 chiffres et plus)
SELECT id, name, city, published FROM public.products
WHERE name ~ '[0-9]{7,}'
ORDER BY created_at DESC;

-- 1.c) Fiches PUBLIÉES sans aucune photo (carte vide dans le catalogue)
SELECT id, name, city, created_at FROM public.products
WHERE published = true AND coalesce(array_length(images, 1), 0) = 0
ORDER BY created_at DESC;

-- 1.d) Doublons : même vendeur, même nom
SELECT owner_id, lower(btrim(name)) AS nom, count(*) AS copies, array_agg(id) AS ids
FROM public.products
WHERE published = true
GROUP BY owner_id, lower(btrim(name))
HAVING count(*) > 1
ORDER BY copies DESC;

-- 1.e) Prix à 0 ou stock négatif
SELECT id, name, price_fcfa, quantity, moq FROM public.products
WHERE price_fcfa <= 0 OR quantity < 0 OR moq < 1
ORDER BY created_at DESC;


-- ============================================================
-- 2. CORRECTION DE LA FICHE « LIEN ALIBABA » (capture d'écran)
--    Vérifié : c'est un SAC À DOS NOIR « BE YOUR STYLE », 8 000 F, Bambey.
--    Remplacez le nom si vous voulez autre chose.
-- ============================================================
UPDATE public.products
   SET name = 'Sac à dos noir BE YOUR STYLE',
       category = 'Mode & Textile',
       description = 'Sac à dos noir tendance, format scolaire et voyage. Stock limité.'
 WHERE id = '06807967-9c96-40c5-8973-57085bf610f5';

-- Si le vendeur ne répond pas, mieux vaut masquer la fiche que de la laisser
-- avec une capture d'écran d'une autre application :
-- UPDATE public.products SET published = false WHERE id = '06807967-9c96-40c5-8973-57085bf610f5';


-- ============================================================
-- 3. GARDE-FOU EN BASE (optionnel mais recommandé)
--    Refuse définitivement un nom de produit qui est un lien ou une bouillie
--    de chiffres, même si la fiche arrive par un autre chemin qu'un formulaire.
-- ============================================================
CREATE OR REPLACE FUNCTION public.products_guard_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NEW.name ~* 'https?://|www\.' THEN
    RAISE EXCEPTION 'Le nom du produit ne peut pas être un lien : écrivez le nom de l''article.';
  END IF;
  IF NOT (NEW.name ~ '[A-Za-zÀ-ÿ]{3}') THEN
    RAISE EXCEPTION 'Le nom du produit doit contenir des lettres.';
  END IF;
  IF length(btrim(NEW.name)) > 90 THEN
    NEW.name := left(btrim(NEW.name), 90);
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.products_guard_name() FROM PUBLIC;

DROP TRIGGER IF EXISTS products_guard_name ON public.products;
CREATE TRIGGER products_guard_name
  BEFORE INSERT OR UPDATE OF name ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.products_guard_name();

-- CONTRÔLE : doit renvoyer true
SELECT EXISTS (
  SELECT 1 FROM pg_trigger WHERE tgname = 'products_guard_name'
) AS garde_fou_nom_actif;
