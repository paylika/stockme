-- ============================================================
-- StockMe — Offre « Vendeur Pro » (2 900 F / mois)
--
--   1. 3 000 F de mise en avant crédités sur le SOLDE chaque mois
--      (donc plus que le prix de l'abonnement : le vendeur est gagnant) ;
--   2. publications ILLIMITÉES (plus de 500 F au-delà de 20 produits) ;
--   3. badge « Fournisseur vérifié » inclus tant que l'abonnement court.
--
-- POURQUOI dans la base : c'est elle qui décide, jamais le navigateur. Le
-- crédit mensuel est idempotent (un seul par mois civil) : un webhook rejoué
-- ou une page rechargée ne crédite jamais deux fois.
--
-- CE SCRIPT RÉPARE AUSSI UN BUG PAYANT (partie 3) : le garde-fou du badge
-- annulait silencieusement les activations faites par le serveur (webhook de
-- paiement, clé de service, éditeur SQL), car `auth.uid()` y est NULL. Résultat :
-- des vendeurs payaient par carte et ne recevaient jamais leur badge.
--
-- Idempotent : peut être relancé sans effet de bord.
-- ============================================================

-- ------------------------------------------------------------------
-- 1. Le crédit mensuel de mise en avant
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pro_monthly_credit(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  c_credit constant int := 3000;
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

  -- Abonnement expiré : le mois n'a pas été payé, donc aucun crédit.
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

-- ------------------------------------------------------------------
-- 2. Dès qu'un compte devient PRO (1er paiement) ou qu'une échéance
--    mensuelle est encaissée, le crédit du mois est versé.
--
--    Un trigger plutôt qu'une réécriture des grosses fonctions de paiement :
--    moins de code à copier, rien à casser, et le crédit suit AUTOMATIQUEMENT
--    toute source de paiement (carte aujourd'hui, autre demain).
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.profiles_pro_credit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NEW.plan = 'pro' THEN
    -- Le crédit ne doit JAMAIS faire échouer l'activation d'un abonnement
    -- (si le portefeuille a un souci, le badge et l'offre passent quand même).
    BEGIN
      PERFORM public.pro_monthly_credit(NEW.id);
    EXCEPTION WHEN others THEN
      NULL;
    END;
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.profiles_pro_credit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_pro_credit ON public.profiles;
CREATE TRIGGER profiles_pro_credit
  AFTER INSERT OR UPDATE OF plan, verified_until ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_pro_credit();

-- ------------------------------------------------------------------
-- 3. RÉPARATION DU GARDE-FOU DU BADGE
--
--    Avant : toute écriture sans session ADMIN était annulée — y compris
--    celles du SERVEUR (webhook de paiement avec la clé de service, éditeur
--    SQL), parce que `auth.uid()` y vaut NULL. Le vendeur payait, le badge
--    n'arrivait jamais, et aucune erreur n'était affichée.
--
--    Maintenant : on ne bloque que les écritures venant d'un utilisateur
--    connecté (anon / authenticated) qui n'est pas administrateur. On protège
--    aussi `plan`, qui n'était pas protégé du tout : sans cela, un vendeur
--    pouvait s'attribuer « pro » et publier sans limite.
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.profiles_guard_verified()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_user_call boolean := current_user IN ('anon', 'authenticated');
  v_admin boolean := false;
BEGIN
  IF v_user_call THEN
    v_admin := public.has_role(auth.uid(), 'admin');
  END IF;

  IF v_user_call AND NOT v_admin THEN
    IF TG_OP = 'INSERT' THEN
      NEW.verified := false;
      NEW.verified_at := NULL;
      NEW.verified_until := NULL;
      NEW.plan := 'gratuit';
    ELSE
      NEW.verified := OLD.verified;
      NEW.verified_at := OLD.verified_at;
      NEW.verified_until := OLD.verified_until;
      NEW.plan := OLD.plan;
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.profiles_guard_verified() FROM PUBLIC;

DROP TRIGGER IF EXISTS profiles_guard_verified ON public.profiles;
CREATE TRIGGER profiles_guard_verified
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_guard_verified();

-- ------------------------------------------------------------------
-- 4. Publications ILLIMITÉES pour un Vendeur Pro actif
--    (les 20 publications offertes et les 10 photos ne changent pas)
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.products_guard_limits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  c_max_images   constant int := 10;   -- photos par produit, pour tout le monde
  c_free_products constant int := 20;  -- publications offertes
  c_extra_price  constant int := 500;  -- prix d'une publication supplémentaire
  v_count int;
  v_balance int;
  v_is_pro boolean;
BEGIN
  -- Les administrateurs ne sont jamais bloqués (modération).
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  -- ---- Photos : 10 maximum, pour tout le monde ----
  IF coalesce(array_length(NEW.images, 1), 0) > c_max_images THEN
    RAISE EXCEPTION 'Maximum % photos par produit.', c_max_images;
  END IF;

  -- ---- Publications : 20 offertes, puis 500 F prélevés du solde ----
  -- On ne facture que les VRAIES publications : insertion d'un produit publié,
  -- ou passage de « masqué » à « en ligne ».
  IF TG_OP = 'INSERT' OR (NEW.published = true AND coalesce(OLD.published, false) = false) THEN

    SELECT count(*) INTO v_count
      FROM public.products
     WHERE owner_id = NEW.owner_id
       AND published = true
       AND id <> NEW.id;

    IF coalesce(v_count, 0) >= c_free_products THEN
      -- Vendeur Pro dont l'abonnement court encore : publications illimitées.
      SELECT (p.plan = 'pro' AND coalesce(p.verified_until, now() + interval '1 day') > now())
        INTO v_is_pro
        FROM public.profiles p
       WHERE p.id = NEW.owner_id;

      IF NOT coalesce(v_is_pro, false) THEN
        SELECT coalesce(balance_fcfa, 0) INTO v_balance
          FROM public.wallets WHERE user_id = NEW.owner_id;
        v_balance := coalesce(v_balance, 0);

        IF v_balance < c_extra_price THEN
          RAISE EXCEPTION
            'Vous avez atteint vos % produits publiés offerts. Chaque publication supplémentaire coûte % FCFA : rechargez votre solde (disponible : % FCFA) — ou passez Vendeur Pro (publications illimitées).',
            c_free_products, c_extra_price, v_balance;
        END IF;

        -- Débit du prix de la publication (annulé si la publication échoue).
        UPDATE public.wallets
           SET balance_fcfa = balance_fcfa - c_extra_price, updated_at = now()
         WHERE user_id = NEW.owner_id;

        INSERT INTO public.wallet_transactions (user_id, amount_fcfa, kind, label)
        VALUES (NEW.owner_id, -c_extra_price, 'publication',
                'Publication supplémentaire — ' || c_extra_price || ' FCFA');
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.products_guard_limits() FROM PUBLIC;

-- ============================================================
-- CONTRÔLES (les deux premiers doivent répondre true)
-- ============================================================
-- select pg_get_functiondef(p.oid) like '%c_credit constant int := 3000%' as credit_3000_ok
--   from pg_proc p where p.proname = 'pro_monthly_credit';
--
-- select pg_get_functiondef(p.oid) like '%v_is_pro%' as pro_illimite_ok
--   from pg_proc p where p.proname = 'products_guard_limits';
--
-- -- Badge : le serveur peut-il enfin écrire ? (doit répondre « autorise »)
-- -- Le trigger est actif ?
-- select tgname, tgenabled from pg_trigger
--  where tgrelid = 'public.profiles'::regclass and not tgisinternal;
--
-- -- Vendeurs Pro en cours (vide tant que personne n'a souscrit)
-- select id, shop_name, plan, verified_until from public.profiles
--  where plan = 'pro' and coalesce(verified_until, now() + interval '1 day') > now();
--
-- -- Des paiements ont-ils été encaissés SANS badge ? (doit être vide)
-- select pi.paid_at, pi.amount_fcfa, pi.user_id, pf.verified, pf.plan
--   from public.payment_intents pi
--   join public.profiles pf on pf.id = pi.user_id
--  where pi.purpose = 'subscription' and pi.status = 'paid' and coalesce(pf.verified, false) = false
--  order by pi.paid_at desc;
