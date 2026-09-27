-- ############################################################################
-- StockMe — À COLLER DANS SUPABASE (SQL Editor), 2 BLOCS
--
--   BLOC 1 → REVENUS SÉPARÉS PAR SOURCE (pour la page Revenus)
--   BLOC 2 → 5 PHOTOS PAR PRODUIT (sans bloquer les anciennes fiches)
--
-- Collez-les UN PAR UN. Relançables sans risque.
-- ############################################################################


-- ############################################################################
-- BLOC 1 / 2 — DÉCOUPAGE DES REVENUS
--
--   Renvoie chaque source séparément : abonnements Pro, certifications
--   (badges validés à la main × 2 000 F), recharges, mise en avant consommée,
--   plus le MRR et l'ARR calculés dans l'application.
-- ############################################################################

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
    'boosts_paid_online', (
      SELECT coalesce(sum(amount_fcfa), 0) FROM public.payment_intents
       WHERE status = 'paid' AND purpose = 'boost'
    ),
    'boost_consumed', (
      SELECT coalesce(-sum(amount_fcfa), 0) FROM public.wallet_transactions WHERE kind = 'boost'
    ),
    'publication_consumed', (
      SELECT coalesce(-sum(amount_fcfa), 0) FROM public.wallet_transactions WHERE kind = 'publication'
    ),
    'wallet_liability', (
      SELECT coalesce(sum(balance_fcfa), 0) FROM public.wallets
    ),
    'pro_credit_given', (
      SELECT coalesce(sum(amount_fcfa), 0) FROM public.wallet_transactions
       WHERE kind = 'adjustment' AND label LIKE 'Crédit Vendeur Pro%'
    ),
    'verification_bonus_given', (
      SELECT coalesce(sum(amount_fcfa), 0) FROM public.wallet_transactions
       WHERE kind = 'adjustment' AND label LIKE 'Bonus vérification%'
    ),
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

-- Contrôle (doit répondre true)
-- select pg_get_functiondef(p.oid) like '%pro_annual_active%' as revenus_separes_ok
--   from pg_proc p where p.proname = 'admin_revenue_breakdown';


-- ############################################################################
-- BLOC 2 / 2 — 5 PHOTOS PAR PRODUIT
--
--   ⚠️ Les fiches DÉJÀ en ligne avec plus de 5 photos ne sont PAS touchées :
--   elles gardent leurs photos, on interdit seulement d'en AJOUTER au-delà
--   de 5. Sans cette précaution, un vendeur ne pourrait même plus corriger
--   le prix d'une ancienne fiche.
-- ############################################################################

CREATE OR REPLACE FUNCTION public.products_guard_limits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  c_max_images   constant int := 5;
  c_free_products constant int := 20;
  c_extra_price  constant int := 500;
  v_count int;
  v_balance int;
  v_is_pro boolean;
  v_images int;
  v_before int;
BEGIN
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  -- Photos : 5 maximum, mais on ne bloque qu'un AJOUT
  v_images := coalesce(array_length(NEW.images, 1), 0);
  v_before := CASE WHEN TG_OP = 'UPDATE' THEN coalesce(array_length(OLD.images, 1), 0) ELSE 0 END;
  IF v_images > c_max_images AND v_images > v_before THEN
    RAISE EXCEPTION 'Maximum % photos par produit.', c_max_images;
  END IF;

  -- Publications : 20 offertes, puis 500 F prélevés du solde
  IF TG_OP = 'INSERT' OR (NEW.published = true AND coalesce(OLD.published, false) = false) THEN

    SELECT count(*) INTO v_count
      FROM public.products
     WHERE owner_id = NEW.owner_id
       AND published = true
       AND id <> NEW.id;

    IF coalesce(v_count, 0) >= c_free_products THEN
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

-- Contrôle (doit répondre true)
-- select pg_get_functiondef(p.oid) like '%c_max_images   constant int := 5%' as cinq_photos_ok
--   from pg_proc p where p.proname = 'products_guard_limits';
