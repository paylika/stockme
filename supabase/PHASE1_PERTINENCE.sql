-- ============================================================================
-- StockMe — PHASE 1 : LE CLASSEMENT PAR PERTINENCE
--
-- À coller dans Supabase → SQL Editor → Run. Un seul collage, relançable.
-- Ne modifie AUCUNE donnée : cette fonction ne fait que LIRE et classer.
--
-- LE PROBLÈME MESURÉ : la recherche faisait exactement ceci —
--     name ILIKE '%mot%'   puis   ORDER BY created_at DESC
-- Autrement dit : elle ne regardait QUE le titre, ne tolérait aucune faute de
-- frappe, ignorait les mots-clés et attributs produits par ton IA (190 annonces
-- déjà enrichies : « huile moteur », « 10w40 », « vidange », « lubrifiant »…),
-- ignorait la ville de l'acheteur et la qualité du vendeur. Résultat : beaucoup
-- de recherches ne trouvaient rien alors que le produit était là.
--
-- CE QUE FAIT CE CLASSEMENT (du plus fort au plus faible) :
--   • titre complet trouvé                     120 points
--   • titre proche (fautes de frappe)       jusqu'à  60
--   • chaque mot du titre trouvé              25 / mot
--   • chaque mot-clé IA trouvé                20 / mot
--   • chaque attribut IA trouvé (usage, objet…) 10 / mot
--   • description                             6 / mot
--   • fraîcheur (annonce récente)           jusqu'à  15
--   • vendeur vérifié                         12
--   • MÊME VILLE que l'acheteur               18
--
-- Un produit qui correspond mal ne remonte donc plus artificiellement parce
-- qu'il est récent : c'est la pertinence d'abord, la nouveauté ensuite.
--
-- SI CE SQL N'EST PAS COLLÉ : le site continue avec l'ancienne recherche
-- (aucune casse, aucun écran vide) — le code bascule tout seul.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.search_products(
  p_query    text,
  p_city     text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_limit    int  DEFAULT 60
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_q    text;
  v_mots text[];
  v_json json;
BEGIN
  v_q := lower(btrim(coalesce(p_query, '')));
  v_q := regexp_replace(v_q, '\s+', ' ', 'g');
  v_mots := string_to_array(v_q, ' ');

  SELECT coalesce(json_agg(row_to_json(t)), '[]'::json) INTO v_json
  FROM (
    SELECT
      p.*,
      (
        CASE WHEN v_q <> '' AND lower(p.name) LIKE '%' || v_q || '%' THEN 120 ELSE 0 END
        + CASE WHEN v_q <> '' THEN round(60 * greatest(similarity(lower(p.name), v_q), 0))::int ELSE 0 END
        + 25 * (SELECT count(*) FROM unnest(v_mots) m WHERE m <> '' AND lower(p.name) LIKE '%' || m || '%')
        + 20 * (SELECT count(*) FROM unnest(v_mots) m
                 WHERE m <> '' AND EXISTS (
                   SELECT 1 FROM unnest(coalesce(p.ai_keywords, '{}')) k WHERE lower(k) LIKE '%' || m || '%'))
        + 10 * (SELECT count(*) FROM unnest(v_mots) m
                 WHERE m <> '' AND lower(coalesce(p.ai_attrs::text, '')) LIKE '%' || m || '%')
        +  6 * (SELECT count(*) FROM unnest(v_mots) m
                 WHERE m <> '' AND lower(coalesce(p.description, '')) LIKE '%' || m || '%')
        + greatest(0, 15 - (extract(epoch FROM (now() - p.created_at)) / 86400 / 2)::int)
        + CASE WHEN pr.verified AND (pr.verified_until IS NULL OR pr.verified_until > now()) THEN 12 ELSE 0 END
        + CASE WHEN p_city IS NOT NULL AND p_city <> '' AND p.city = p_city THEN 18 ELSE 0 END
      )::int AS pertinence
    FROM public.products p
    LEFT JOIN public.profiles pr ON pr.id = p.owner_id
    WHERE p.published
      AND NOT p.dropshipping
      AND NOT p.sold_out
      AND (p_category IS NULL OR p_category = '' OR p.category = p_category)
      AND (
        v_q = ''
        OR lower(p.name) LIKE '%' || v_q || '%'
        OR similarity(lower(p.name), v_q) > 0.25
        OR EXISTS (
          SELECT 1 FROM unnest(v_mots) m
          WHERE m <> '' AND length(m) >= 3 AND (
            lower(p.name) LIKE '%' || m || '%'
            OR EXISTS (SELECT 1 FROM unnest(coalesce(p.ai_keywords, '{}')) k WHERE lower(k) LIKE '%' || m || '%')
            OR lower(coalesce(p.ai_attrs::text, '')) LIKE '%' || m || '%'
            OR lower(coalesce(p.description, '')) LIKE '%' || m || '%'
          )
        )
      )
    ORDER BY pertinence DESC, p.created_at DESC
    LIMIT least(greatest(coalesce(p_limit, 60), 1), 120)
  ) t;

  RETURN v_json;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.search_products(text, text, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_products(text, text, text, int) TO anon, authenticated;

-- ============================================================================
-- CONTRÔLE — une recherche réelle doit renvoyer des produits classés
-- ============================================================================
-- select json_array_length(public.search_products('huile', 'Dakar', null, 10)) as trouves;
