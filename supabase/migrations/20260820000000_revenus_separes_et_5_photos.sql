-- ============================================================
-- StockMe — REVENUS SÉPARÉS PAR SOURCE + 5 PHOTOS PAR PRODUIT
--
--   1. `admin_revenue_breakdown()` : un seul appel qui renvoie CHAQUE source de
--      revenu séparément (abonnements, certifications, recharges, mise en
--      avant), pour que le tableau de bord ne mélange plus tout.
--   2. Photos : 5 par produit au lieu de 10 — SANS toucher aux fiches déjà en
--      ligne qui en ont plus (elles gardent leurs photos, on interdit
--      seulement d'en AJOUTER au-delà de 5).
--
-- Idempotent : peut être relancé sans effet de bord.
-- ============================================================

-- ------------------------------------------------------------------
-- 1. Découpage des revenus
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_revenue_breakdown()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE v json;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Accès réservé aux administrateurs';
  END IF;

  SELECT json_build_object(
    -- ===== 1. ABONNEMENTS VENDEUR PRO =====
    -- Un Pro MENSUEL est un abonnement de 30 jours : son échéance tombe dans
    -- moins de 60 jours. Un Pro ANNUEL a une échéance à plus de 60 jours.
    'pro_monthly_active', (
      SELECT count(*) FROM public.profiles
       WHERE plan = 'pro' AND verified = true
         AND verified_until IS NOT NULL
         AND verified_until > now()
         AND verified_until <= now() + interval '60 days'
    ),
    'pro_annual_active', (
      SELECT count(*) FROM public.profiles
       WHERE plan = 'pro' AND verified = true
         AND verified_until > now() + interval '60 days'
    ),
    'pro_collected', (
      SELECT coalesce(sum(amount_fcfa), 0) FROM public.payment_intents
       WHERE status = 'paid' AND purpose = 'subscription'
         AND coalesce(metadata->>'plan', '') = 'pro'
    ),

    -- ===== 2. CERTIFICATIONS (badge fournisseur vérifié) =====
    -- Badges activés À LA MAIN (aucun paiement en ligne rattaché au compte).
    'badges_manual', (
      SELECT count(*) FROM public.profiles p
       WHERE p.verified = true
         AND (p.verified_until IS NULL OR p.verified_until > now())
         AND NOT EXISTS (
           SELECT 1 FROM public.payment_intents i
            WHERE i.user_id = p.id AND i.status = 'paid' AND i.purpose = 'subscription'
         )
    ),
    'badges_paid_online', (
      SELECT coalesce(sum(amount_fcfa), 0) FROM public.payment_intents
       WHERE status = 'paid' AND purpose = 'subscription'
         AND coalesce(metadata->>'plan', 'verifie') <> 'pro'
    ),
    'badges_paid_count', (
      SELECT count(*) FROM public.payment_intents
       WHERE status = 'paid' AND purpose = 'subscription'
         AND coalesce(metadata->>'plan', 'verifie') <> 'pro'
    ),

    -- ===== 3. RECHARGES ET MISE EN AVANT =====
    'topups_collected', (
      SELECT coalesce(sum(amount_fcfa), 0) FROM public.payment_intents
       WHERE status = 'paid' AND purpose = 'wallet_topup'
    ),
    'topups_count', (
      SELECT count(*) FROM public.payment_intents
       WHERE status = 'paid' AND purpose = 'wallet_topup'
    ),
    -- Mise en avant payée directement par carte (sans passer par le solde).
    'boosts_paid_online', (
      SELECT coalesce(sum(amount_fcfa), 0) FROM public.payment_intents
       WHERE status = 'paid' AND purpose = 'boost'
    ),
    -- Ce qui a été RÉELLEMENT consommé depuis les soldes (le vrai revenu gagné).
    'boost_consumed', (
      SELECT coalesce(-sum(amount_fcfa), 0) FROM public.wallet_transactions WHERE kind = 'boost'
    ),
    'publication_consumed', (
      SELECT coalesce(-sum(amount_fcfa), 0) FROM public.wallet_transactions WHERE kind = 'publication'
    ),
    -- Argent des vendeurs encore chez nous (rechargé, pas encore dépensé).
    'wallet_liability', (
      SELECT coalesce(sum(balance_fcfa), 0) FROM public.wallets
    ),
    -- Ce que NOUS avons offert (à ne jamais confondre avec un revenu).
    'pro_credit_given', (
      SELECT coalesce(sum(amount_fcfa), 0) FROM public.wallet_transactions
       WHERE kind = 'adjustment' AND label LIKE 'Crédit Vendeur Pro%'
    ),
    'verification_bonus_given', (
      SELECT coalesce(sum(amount_fcfa), 0) FROM public.wallet_transactions
       WHERE kind = 'adjustment' AND label LIKE 'Bonus vérification%'
    ),
    -- Ventes protégées XaalisPay (aucun revenu StockMe, mais utile à suivre).
    'xaalispay_escrow_count', (
      SELECT count(*) FROM public.payment_intents
       WHERE status = 'paid' AND purpose = 'subscription' AND coalesce(metadata->>'source', '') = 'xaalispay'
    )
  ) INTO v;

  RETURN v;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.admin_revenue_breakdown() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_revenue_breakdown() TO authenticated;

-- ------------------------------------------------------------------
-- 2. Photos : 5 par produit, sans punir les fiches existantes
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.products_guard_limits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  c_max_images   constant int := 5;    -- photos par produit : 5 pour tout le monde
  c_free_products constant int := 20;  -- publications offertes
  c_extra_price  constant int := 500;  -- prix d'une publication supplémentaire
  v_count int;
  v_balance int;
  v_is_pro boolean;
  v_images int;
  v_before int;
BEGIN
  -- Les administrateurs ne sont jamais bloqués (modération).
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  -- ---- Photos : 5 maximum, MAIS on ne touche pas aux fiches existantes ----
  -- Une fiche déjà en ligne avec 8 photos doit rester modifiable (prix, stock)
  -- sans être obligée de supprimer des photos : on ne bloque qu'un AJOUT.
  v_images := coalesce(array_length(NEW.images, 1), 0);
  v_before := CASE WHEN TG_OP = 'UPDATE' THEN coalesce(array_length(OLD.images, 1), 0) ELSE 0 END;
  IF v_images > c_max_images AND v_images > v_before THEN
    RAISE EXCEPTION 'Maximum % photos par produit.', c_max_images;
  END IF;

  -- ---- Publications : 20 offertes, puis 500 F prélevés du solde ----
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
-- CONTRÔLES (les deux doivent répondre true)
-- ============================================================
-- select pg_get_functiondef(p.oid) like '%pro_annual_active%' as revenus_separes_ok
--   from pg_proc p where p.proname = 'admin_revenue_breakdown';
--
-- select pg_get_functiondef(p.oid) like '%c_max_images   constant int := 5%' as cinq_photos_ok
--   from pg_proc p where p.proname = 'products_guard_limits';
--
-- -- Combien de fiches ont DÉJÀ plus de 5 photos ? (elles ne sont pas touchées)
-- select count(*) as fiches_avec_plus_de_5_photos
--   from public.products where coalesce(array_length(images, 1), 0) > 5;
