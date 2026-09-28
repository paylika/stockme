-- ============================================================================
-- StockMe — PHASE 0 : LA MÉMOIRE DES RECHERCHES
--
-- À coller dans Supabase → SQL Editor → Run. Un seul collage, relançable.
--
-- POURQUOI CE FICHIER EXISTE — la vérité mesurée avant d'écrire une ligne :
--   • aucune recherche n'était enregistrée (0 ligne) ;
--   • les événements (vues, contacts) ne portaient PAS l'identifiant de
--     l'utilisateur.
-- Conséquence : « recommander selon les recherches » et « selon l'historique »
-- étaient LITTÉRALEMENT impossibles, et le resteraient même dans un an si on ne
-- posait pas cette fondation aujourd'hui. C'est 1 000 lignes par jour, sans
-- aucun coût, et ça débloque tout le reste.
--
-- CE QUE ÇA PERMET DE SAVOIR DÈS DEMAIN :
--   • ce que les acheteurs cherchent vraiment (et avec quels mots) ;
--   • ce qui ne trouve RIEN (les recherches sans résultat montrent les
--     catégories où il manque de l'offre — une information en or) ;
--   • qui a fait quoi (pour la personnalisation de la phase 2).
--
-- VIE PRIVÉE : l'identifiant est renseigné automatiquement par la base
-- (`auth.uid()`) UNIQUEMENT si la personne est connectée, et ne peut pas être
-- falsifié. Les visiteurs anonymes sont enregistrés sans identité. Pense à le
-- déclarer dans ta page « Confidentialité ».
-- ============================================================================

-- ============================================================================
-- 1. LA TABLE DES RECHERCHES
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.search_logs (
  id           bigserial PRIMARY KEY,
  query        text,                                  -- le mot cherché
  query_clean  text,                                  -- en minuscules, sans espaces superflus
  results      int  NOT NULL DEFAULT 0,               -- nombre de résultats trouvés
  category     text,                                  -- filtre catégorie, s'il y en avait un
  city         text,                                  -- ville demandée
  country      text,                                  -- pays détecté du visiteur
  user_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Index pour les analyses (le classement ne concerne que les 3 requêtes ci-dessous).
CREATE INDEX IF NOT EXISTS search_logs_created_idx ON public.search_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS search_logs_clean_idx   ON public.search_logs (query_clean);
CREATE INDEX IF NOT EXISTS search_logs_vides_idx   ON public.search_logs (created_at DESC) WHERE results = 0;
CREATE INDEX IF NOT EXISTS search_logs_user_idx    ON public.search_logs (user_id, created_at DESC);

-- Aucune lecture publique : ces données ne passent que par les fonctions ci-dessous.
ALTER TABLE public.search_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 2. ENREGISTRER UNE RECHERCHE (appelable par le site, même par un visiteur)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.log_search(
  p_query    text,
  p_results  int,
  p_city     text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_country  text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean text;
BEGIN
  -- On ne garde que ce qui a du sens : ni vide, ni démesuré.
  v_clean := lower(btrim(coalesce(p_query, '')));
  v_clean := regexp_replace(v_clean, '\s+', ' ', 'g');
  IF length(v_clean) > 120 THEN
    v_clean := left(v_clean, 120);
  END IF;

  -- Rien à enregistrer : ni mot, ni filtre.
  IF v_clean = '' AND coalesce(p_city, '') = '' AND coalesce(p_category, '') = '' THEN
    RETURN;
  END IF;

  INSERT INTO public.search_logs (query, query_clean, results, category, city, country, user_id)
  VALUES (
    nullif(left(coalesce(p_query, ''), 200), ''),
    nullif(v_clean, ''),
    greatest(0, least(coalesce(p_results, 0), 100000)),
    nullif(left(coalesce(p_category, ''), 60), ''),
    nullif(left(coalesce(p_city, ''), 60), ''),
    nullif(left(coalesce(p_country, ''), 60), ''),
    auth.uid()          -- renseigné par la base : impossible à falsifier
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_search(text, int, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_search(text, int, text, text, text) TO anon, authenticated;

-- ============================================================================
-- 3. RATTACHER L'UTILISATEUR AUX VUES ET AUX CONTACTS (phase 2)
-- ============================================================================
ALTER TABLE public.product_events ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS product_events_user_idx ON public.product_events (user_id, created_at DESC);

-- On remplace la fonction d'enregistrement : identique, mais elle note
-- désormais QUI a vu ou contacté (uniquement si la personne est connectée).
CREATE OR REPLACE FUNCTION public.log_product_event(
  p_product_id uuid,
  p_event text,
  p_country text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seller uuid;
BEGIN
  IF p_event NOT IN ('view', 'contact') THEN
    RAISE EXCEPTION 'invalid event';
  END IF;

  SELECT owner_id INTO v_seller FROM public.products WHERE id = p_product_id;
  IF v_seller IS NULL THEN
    RAISE EXCEPTION 'product not found';
  END IF;

  INSERT INTO public.product_events (product_id, seller_id, event, country, user_id)
  VALUES (p_product_id, v_seller, p_event, p_country, auth.uid());
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_product_event(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_product_event(uuid, text, text) TO anon, authenticated;

-- ============================================================================
-- CONTRÔLE — doit renvoyer 0 (aucune recherche encore) puis grandir
-- ============================================================================
select count(*) as recherches_enregistrees from public.search_logs;
