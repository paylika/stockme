-- ============================================================================
-- StockMe — PAGE ADMIN RAPIDE
--
-- À coller dans Supabase → SQL Editor → Run. Un seul collage, relançable.
--
-- POURQUOI : la page /admin téléchargeait TOUTE la base (tous les produits,
-- tous les profils) uniquement pour calculer deux nombres : le nombre de
-- pays/villes et le classement des villes. Avec 20 000 produits, cela
-- représenterait des dizaines de mégaoctets rapatriés dans le navigateur à
-- chaque ouverture, pour n'afficher que 12 lignes. Postgres calcule ces deux
-- résultats en quelques millisecondes, sans rien télécharger.
--
-- LES CHIFFRES RESTENT IDENTIQUES : la fonction renvoie exactement la même
-- information que l'ancien calcul (liste des villes distinctes des produits ET
-- des profils, et les 8 villes les plus représentées).
--
-- Tant que ce SQL n'est pas collé, la page admin continue de fonctionner comme
-- avant : le code bascule tout seul sur l'ancienne méthode.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_geo_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v json;
BEGIN
  -- Réservé à l'administration : cette fonction lit des données de tous les
  -- utilisateurs, elle ne doit pas être appelable par un visiteur.
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT json_build_object(
    -- Toutes les villes distinctes (produits + profils). La valeur `null` est
    -- conservée quand une annonce ou un profil n'a pas de ville : l'ancien
    -- calcul la comptait comme « Autre », on reproduit donc le même résultat.
    'cities', (
      SELECT coalesce(json_agg(DISTINCT city), '[]'::json)
      FROM (
        SELECT city FROM public.products
        UNION ALL
        SELECT city FROM public.profiles
      ) x
    ),
    -- Les 8 villes les plus représentées (annonces uniquement, comme avant).
    'top_cities', (
      SELECT coalesce(json_agg(row_to_json(t)), '[]'::json)
      FROM (
        SELECT city AS name, count(*)::int AS value
        FROM public.products
        WHERE city IS NOT NULL AND city <> ''
        GROUP BY city
        ORDER BY count(*) DESC, city
        LIMIT 8
      ) t
    )
  )
  INTO v;

  RETURN v;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_geo_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_geo_stats() TO authenticated;

-- ============================================================================
-- CONTRÔLE : doit répondre « forbidden » (et non « function does not exist »).
-- C'est la preuve que la fonction est bien installée et protégée.
-- ============================================================================
-- select public.admin_geo_stats();
