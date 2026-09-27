-- ============================================================
-- StockMe — BANNIR UN COMPTE (admin) + ANTI-DOUBLON DE PUBLICATION
--
--   1. `submission_token` : un jeton unique par formulaire de publication.
--      La base refuse deux fiches avec le même jeton → plus JAMAIS de dizaines
--      de publications identiques, même si le vendeur appuie 20 fois ou si le
--      réseau rejoue la requête.
--   2. Bannissement : `profiles.banned`, motif, date. Quand un compte est
--      banni, ses annonces sont MASQUÉES, ses publicités arrêtées, et la base
--      refuse toute nouvelle publication de sa part.
--
-- Idempotent : peut être relancé sans effet de bord.
-- ============================================================

-- ------------------------------------------------------------------
-- 1. ANTI-DOUBLON
-- ------------------------------------------------------------------
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS submission_token text;

-- Index UNIQUE : c'est lui qui rend le doublon techniquement impossible.
-- (Les anciennes fiches ont `null` : elles ne sont pas concernées.)
CREATE UNIQUE INDEX IF NOT EXISTS products_submission_token_uniq
  ON public.products (submission_token)
  WHERE submission_token IS NOT NULL;

-- ------------------------------------------------------------------
-- 2. BANNISSEMENT D'UN COMPTE
-- ------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS banned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS banned_at timestamptz,
  ADD COLUMN IF NOT EXISTS banned_reason text;

CREATE OR REPLACE FUNCTION public.admin_set_user_banned(
  p_user_id uuid,
  p_banned boolean,
  p_reason text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_off int := 0;
  v_ads int := 0;
  v_boosts int := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Accès réservé aux administrateurs';
  END IF;
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur manquant';
  END IF;
  -- On ne bannit jamais un administrateur (protection contre l'erreur fatale).
  IF public.has_role(p_user_id, 'admin') THEN
    RAISE EXCEPTION 'Impossible de bannir un administrateur';
  END IF;

  UPDATE public.profiles
     SET banned = coalesce(p_banned, false),
         banned_at = CASE WHEN p_banned THEN now() ELSE NULL END,
         banned_reason = CASE WHEN p_banned THEN nullif(btrim(coalesce(p_reason, '')), '') ELSE NULL END
   WHERE id = p_user_id;

  IF p_banned THEN
    -- 1. Ses annonces disparaissent du catalogue (jamais supprimées : on
    --    pourrait devoir les rétablir).
    UPDATE public.products
       SET published = false
     WHERE owner_id = p_user_id AND published = true;
    GET DIAGNOSTICS v_off = ROW_COUNT;

    -- 2. Ses publicités payées ne tournent plus.
    UPDATE public.ads a
       SET active = false
      FROM public.products p
     WHERE a.product_id = p.id AND p.owner_id = p_user_id AND a.active = true;
    GET DIAGNOSTICS v_ads = ROW_COUNT;

    -- 3. Ses mises en avant sont mises en pause (le solde restant lui reste).
    UPDATE public.boost_campaigns
       SET status = 'paused'
     WHERE user_id = p_user_id AND status = 'active';
    GET DIAGNOSTICS v_boosts = ROW_COUNT;
  END IF;

  RETURN json_build_object(
    'ok', true,
    'banned', coalesce(p_banned, false),
    'products_hidden', v_off,
    'ads_stopped', v_ads,
    'boosts_paused', v_boosts
  );
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.admin_set_user_banned(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_banned(uuid, boolean, text) TO authenticated;

-- ------------------------------------------------------------------
-- 3. La liste des utilisateurs renvoie l'état de suspension
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE v json;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT coalesce(json_agg(row_to_json(t)), '[]'::json) INTO v FROM (
    SELECT
      u.id,
      u.email,
      p.full_name,
      p.phone,
      p.whatsapp,
      p.city,
      p.role,
      p.plan,
      coalesce(p.banned, false) AS banned,
      p.banned_reason,
      u.created_at,
      EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = u.id AND r.role = 'admin') AS is_admin
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    ORDER BY u.created_at DESC
  ) t;
  RETURN v;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.admin_list_users() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;

-- ------------------------------------------------------------------
-- 4. Un compte banni ne peut plus publier (garde-fou en base)
--    On reprend la fonction complète, avec le contrôle de suspension.
-- ------------------------------------------------------------------
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
  v_banned boolean;
BEGIN
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  -- Compte suspendu : aucune publication possible.
  SELECT coalesce(banned, false) INTO v_banned FROM public.profiles WHERE id = NEW.owner_id;
  IF coalesce(v_banned, false) THEN
    RAISE EXCEPTION 'Votre compte est suspendu : vos annonces sont masquées. Écrivez à StockMe sur WhatsApp pour en parler.';
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

-- ============================================================
-- CONTRÔLES
-- ============================================================
-- select indexname from pg_indexes
--  where tablename = 'products' and indexname = 'products_submission_token_uniq';
--
-- select pg_get_functiondef(p.oid) like '%banned%' as bannissement_ok
--   from pg_proc p where p.proname = 'admin_set_user_banned';
--
-- -- Y a-t-il DÉJÀ des doublons en base ? (mêmes nom + vendeur + prix)
-- select owner_id, name, price_fcfa, count(*) as copies
--   from public.products
--  group by owner_id, name, price_fcfa
-- having count(*) > 1
--  order by copies desc
--  limit 30;