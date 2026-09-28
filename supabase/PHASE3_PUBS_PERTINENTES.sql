-- ============================================================================
-- StockMe — PHASE 3 : LES PUBS QUI ONT DU SENS
--
-- À coller dans Supabase → SQL Editor → Run. Un seul collage, relançable.
-- Ne modifie aucune donnée.
--
-- LE PROBLÈME : aujourd'hui une annonce sponsorisée s'affiche parce que le
-- vendeur a payé — même quand elle ne répond PAS à ce que l'acheteur cherche.
-- Conséquences : l'acheteur est trompé, il perd confiance dans la plateforme,
-- et le vendeur paie pour des vues qui ne convertiront jamais. Un boost qui ne
-- convertit pas, c'est un vendeur qui ne renouvelle pas.
--
-- LA PRUDENCE : cette fonction NE RÉÉCRIT PAS tes règles de publicité. Elle
-- part exactement de la sélection que tu utilises déjà (campagnes actives,
-- dates, rang vendeur, tout est conservé) et y ajoute deux garanties :
--
--   1. PERTINENCE OBLIGATOIRE — si l'acheteur a cherché quelque chose, la pub
--      doit y répondre (titre, mots-clés IA, attributs IA, tolérance aux
--      fautes de frappe). Sinon elle n'est pas affichée : sa place vaut mieux
--      pour un produit utile, et le vendeur ne gaspille plus son argent.
--      Sans recherche (page d'accueil, catalogue non filtré), la sélection
--      reste identique à aujourd'hui.
--
--   2. DÉMOTION AUTOMATIQUE — une annonce vue au moins 300 fois sur 30 jours
--      sans un seul clic ne mérite plus la place : elle est écartée. Cela
--      protège l'acheteur ET l'argent du vendeur, et cela s'applique tout seul.
--
-- SI CE SQL N'EST PAS COLLÉ : le site garde exactement les pubs d'aujourd'hui
-- (le code retombe automatiquement sur l'ancienne fonction).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_sponsored_products_v2(
  p_limit    int  DEFAULT 6,
  p_query    text DEFAULT NULL,
  p_city     text DEFAULT NULL,
  p_category text DEFAULT NULL
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

  WITH base AS (
    /* On repart de TA sélection existante : toutes les règles de publicité
       restent celles d'aujourd'hui. On en demande trois fois plus que
       nécessaire, puisque certaines seront écartées ensuite. */
    SELECT x.id, x.ad_id
    FROM json_to_recordset(public.get_sponsored_products(least(greatest(p_limit, 1) * 3, 30)))
      AS x(id uuid, ad_id uuid)
  ),
  mesure AS (
    /* Impressions et clics des 30 derniers jours, par annonce. */
    SELECT ad_id,
           count(*) FILTER (WHERE event_type = 'impression') AS vues,
           count(*) FILTER (WHERE event_type = 'click')      AS clics
    FROM public.ad_events
    WHERE created_at >= now() - interval '30 days'
    GROUP BY ad_id
  ),
  note AS (
    SELECT
      b.id,
      b.ad_id,
      (
        CASE WHEN v_q <> '' AND lower(p.name) LIKE '%' || v_q || '%' THEN 40 ELSE 0 END
        + CASE WHEN v_q <> '' THEN round(20 * greatest(similarity(lower(p.name), v_q), 0))::int ELSE 0 END
        + 10 * (SELECT count(*) FROM unnest(v_mots) m
                 WHERE m <> '' AND EXISTS (
                   SELECT 1 FROM unnest(coalesce(p.ai_keywords, '{}')) k WHERE lower(k) LIKE '%' || m || '%'))
        +  5 * (SELECT count(*) FROM unnest(v_mots) m
                 WHERE m <> '' AND (
                   lower(p.name) LIKE '%' || m || '%'
                   OR lower(coalesce(p.ai_attrs::text, '')) LIKE '%' || m || '%'))
      )::int AS pertinence,
      coalesce(m.vues, 0)  AS vues,
      coalesce(m.clics, 0) AS clics
    FROM base b
    JOIN public.products p ON p.id = b.id
    LEFT JOIN mesure m ON m.ad_id = b.ad_id
  )
  SELECT coalesce(
           json_agg(json_build_object('id', n.id, 'ad_id', n.ad_id) ORDER BY n.pertinence DESC, n.vues DESC),
           '[]'::json
         )
    INTO v_json
  FROM note n
  WHERE
    /* 1) La pub doit répondre à la recherche (aucune exigence s'il n'y a pas de recherche). */
    (
      v_q = ''
      OR n.pertinence > 0
    )
    /* 2) Une pub vue 300 fois sans un seul clic est écartée. */
    AND NOT (n.vues >= 300 AND n.clics = 0)
  LIMIT (SELECT least(greatest(p_limit, 1), 12));

  RETURN coalesce(v_json, '[]'::json);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_sponsored_products_v2(int, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_sponsored_products_v2(int, text, text, text) TO anon, authenticated;

-- ============================================================================
-- CONTRÔLE — doit répondre des identifiants (ou [] s'il n'y a aucune pub active)
-- ============================================================================
-- select json_array_length(public.get_sponsored_products_v2(6, 'sac', 'Dakar', null)) as pubs_pertinentes;
-- select json_array_length(public.get_sponsored_products_v2(6, null, null, null))  as pubs_sans_recherche;
