-- ============================================================
-- StockMe — VITESSE : un seul appel pour tout l'espace vendeur
--
-- PROBLÈME MESURÉ : chaque requête à la base coûte ~0,5 s depuis un
-- téléphone au Sénégal (distance + réseau). La page Profil en faisait 9
-- (profil, produits, stats, portefeuille, barre latérale ×2, liste des
-- produits ×2, réparation des pubs, demandes) → 3 à 6 secondes d'attente.
--
-- SOLUTION : UNE fonction qui renvoie tout d'un coup. La page passe de 9
-- allers-retours à 1. Aucun changement de contenu : exactement les mêmes
-- données, dans un seul paquet.
--
-- Idempotent : peut être relancé sans effet de bord.
-- ============================================================

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
  -- Jamais connecté → rien à renvoyer (aucune erreur technique affichée).
  IF v_uid IS NULL THEN
    RETURN json_build_object('ok', false, 'reason', 'not_logged_in');
  END IF;

  -- 1. Réparation des campagnes : une annonce financée qui n'est plus servie
  --    est remise en service. Fait ICI, gratuitement, au lieu d'un appel
  --    supplémentaire depuis le navigateur.
  BEGIN
    PERFORM public.boost_self_heal();
  EXCEPTION WHEN others THEN
    NULL; -- jamais bloquant
  END;

  -- 2. Le profil du vendeur (tout ce qu'affichent l'en-tête et le menu)
  SELECT row_to_json(t) INTO v_profile FROM (
    SELECT id, shop_name, full_name, avatar_url, city, bio, phone, whatsapp,
           role, plan, verified, verified_until, banner_url, banner_position
      FROM public.profiles
     WHERE id = v_uid
  ) t;

  -- 3. Ses produits (les siens, en ligne ou masqués), du plus récent au plus ancien
  SELECT coalesce(json_agg(row_to_json(p)), '[]'::json) INTO v_products FROM (
    SELECT id, name, price_fcfa, promo_price_fcfa, quantity, moq, city, category,
           images, published, sold_out, dropshipping, created_at
      FROM public.products
     WHERE owner_id = v_uid
     ORDER BY created_at DESC
  ) p;

  -- 4. Ses statistiques (vues, contacts, favoris, tendance 14 jours, pays)
  BEGIN
    v_stats := public.get_seller_stats(v_uid);
  EXCEPTION WHEN others THEN
    v_stats := NULL;
  END;

  -- 5. Son argent : solde, mouvements, campagnes, paiements en attente
  BEGIN
    v_wallet := public.wallet_overview();
  EXCEPTION WHEN others THEN
    v_wallet := NULL;
  END;

  -- 6. Demandes d'achat qui le concernent (0 si la fonction n'est pas encore
  --    installée : on ne casse jamais la page pour un compteur).
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

-- ============================================================
-- CONTRÔLE (doit répondre true, puis renvoyer du JSON pour un vendeur connecté)
-- ============================================================
-- select pg_get_functiondef(p.oid) like '%boost_self_heal%' as dashboard_ok
--   from pg_proc p where p.proname = 'seller_dashboard';
