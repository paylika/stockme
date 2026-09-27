-- ############################################################################
-- StockMe — À COLLER DANS SUPABASE (SQL Editor), 3 BLOCS
--
--   BLOC 1 → VITESSE : un seul appel pour tout l'espace vendeur
--   BLOC 2 → le crédit mensuel Vendeur Pro passe à 2 000 F
--   BLOC 3 → rotation des annonces équitable (le Pro n'est pas pénalisé)
--
-- Collez-les UN PAR UN (pas tout d'un coup : un texte tronqué provoque
-- l'erreur « syntax error at or near DECLARE »).
-- Relançables sans risque.
-- ############################################################################


-- ############################################################################
-- BLOC 1 / 3 — VITESSE : UN SEUL APPEL POUR TOUT L'ESPACE VENDEUR
--
--   La page Profil appelait la base 9 fois de suite (profil, produits, stats,
--   portefeuille, barre latérale ×2, liste des produits, réparation des pubs,
--   demandes). Chaque appel coûte environ une demi-seconde depuis un téléphone
--   en Afrique de l'Ouest → 3 à 6 secondes d'attente.
--
--   Cette fonction renvoie TOUT d'un coup : la page passe à 1 seul aller-retour.
--   Aucun changement de contenu, exactement les mêmes données.
-- ############################################################################

CREATE OR REPLACE FUNCTION public.seller_dashboard()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_profile json;
  v_products json;
  v_stats json;
  v_wallet json;
  v_requests int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RETURN json_build_object('ok', false, 'reason', 'not_logged_in');
  END IF;

  -- Réparation des campagnes (annonce financée qui n'est plus servie) :
  -- faite ici, gratuitement, au lieu d'un appel depuis le navigateur.
  BEGIN
    PERFORM public.boost_self_heal();
  EXCEPTION WHEN others THEN
    NULL;
  END;

  SELECT row_to_json(t) INTO v_profile FROM (
    SELECT id, shop_name, full_name, avatar_url, city, bio, phone, whatsapp,
           role, plan, verified, verified_until, banner_url, banner_position
      FROM public.profiles
     WHERE id = v_uid
  ) t;

  SELECT coalesce(json_agg(row_to_json(p)), '[]'::json) INTO v_products FROM (
    SELECT id, name, price_fcfa, promo_price_fcfa, quantity, moq, city, category,
           images, published, sold_out, dropshipping, created_at
      FROM public.products
     WHERE owner_id = v_uid
     ORDER BY created_at DESC
  ) p;

  BEGIN
    v_stats := public.get_seller_stats(v_uid);
  EXCEPTION WHEN others THEN
    v_stats := NULL;
  END;

  BEGIN
    v_wallet := public.wallet_overview();
  EXCEPTION WHEN others THEN
    v_wallet := NULL;
  END;

  BEGIN
    SELECT public.count_matching_requests() INTO v_requests;
  EXCEPTION WHEN others THEN
    v_requests := 0;
  END;

  RETURN json_build_object(
    'ok', true,
    'profile', v_profile,
    'products', v_products,
    'stats', v_stats,
    'wallet', v_wallet,
    'requests', coalesce(v_requests, 0)
  );
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.seller_dashboard() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seller_dashboard() TO authenticated;

-- Contrôle (doit répondre true)
-- select pg_get_functiondef(p.oid) like '%boost_self_heal%' as dashboard_ok
--   from pg_proc p where p.proname = 'seller_dashboard';


-- ############################################################################
-- BLOC 2 / 3 — CRÉDIT MENSUEL VENDEUR PRO : 2 000 F (au lieu de 3 000 F)
---------------------------------------------------------------------------
--   Versé automatiquement chaque mois sur le solde, une seule fois par mois
--   civil, et seulement si l'abonnement est en cours.
-- ############################################################################

CREATE OR REPLACE FUNCTION public.pro_monthly_credit(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  c_credit constant int := 2000;
  v_plan   text;
  v_until  timestamptz;
  v_month  text;
  v_already boolean;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN json_build_object('ok', false, 'reason', 'missing_user');
  END IF;

  SELECT plan, verified_until INTO v_plan, v_until
    FROM public.profiles WHERE id = p_user_id;

  IF v_plan IS DISTINCT FROM 'pro' THEN
    RETURN json_build_object('ok', false, 'reason', 'not_pro');
  END IF;

  IF v_until IS NOT NULL AND v_until <= now() THEN
    RETURN json_build_object('ok', false, 'reason', 'expired');
  END IF;

  v_month := to_char(now(), 'YYYY-MM');

  SELECT EXISTS (
    SELECT 1 FROM public.wallet_transactions
     WHERE user_id = p_user_id
       AND kind = 'adjustment'
       AND label LIKE 'Crédit Vendeur Pro%'
       AND to_char(created_at, 'YYYY-MM') = v_month
  ) INTO v_already;

  IF v_already THEN
    RETURN json_build_object('ok', true, 'reason', 'already_granted', 'month', v_month);
  END IF;

  INSERT INTO public.wallets (user_id, balance_fcfa)
  VALUES (p_user_id, c_credit)
  ON CONFLICT (user_id) DO UPDATE
    SET balance_fcfa = public.wallets.balance_fcfa + c_credit,
        updated_at = now();

  INSERT INTO public.wallet_transactions (user_id, amount_fcfa, kind, label)
  VALUES (p_user_id, c_credit, 'adjustment',
          'Crédit Vendeur Pro — ' || c_credit || ' FCFA de mise en avant (' || v_month || ')');

  RETURN json_build_object('ok', true, 'granted', c_credit, 'month', v_month);
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.pro_monthly_credit(uuid) FROM PUBLIC, anon, authenticated;

-- Contrôle (doit répondre true)
-- select pg_get_functiondef(p.oid) like '%c_credit constant int := 2000%' as credit_2000_ok
--   from pg_proc p where p.proname = 'pro_monthly_credit';


-- ############################################################################
-- BLOC 3 / 3 — ROTATION DES ANNONCES ÉQUITABLE
--
--   L'ordre de diffusion se fait déjà sur « l'annonce la moins vue
--   aujourd'hui ». Le « poids » ne servait qu'à départager : il est maintenant
--   IDENTIQUE pour toutes les mises en avant actives, donc un Vendeur Pro qui
--   paie 800 F/jour au lieu de 1 000 F ne passe jamais après un autre.
-- ############################################################################

CREATE OR REPLACE FUNCTION public.boost_weight(p_daily_budget int)
RETURNS int
LANGUAGE sql IMMUTABLE
AS $fn$
  SELECT CASE WHEN coalesce(p_daily_budget, 0) > 0 THEN 1 ELSE 0 END
$fn$;

-- Contrôle (doit répondre true)
-- select pg_get_functiondef(p.oid) like '%> 0 THEN 1%' as rotation_egalitaire_ok
--   from pg_proc p where p.proname = 'boost_weight';
