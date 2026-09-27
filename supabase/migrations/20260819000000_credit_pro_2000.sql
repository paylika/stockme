-- ============================================================
-- StockMe — Nouvelle grille Vendeur Pro + rotation équitable
--
--   1. Le crédit mensuel de mise en avant passe à 2 000 F (au lieu de 3 000 F).
--   2. La mise en avant d'un Vendeur Pro démarre à 800 F/jour (au lieu de
--      1 000 F) et descend jusqu'à 600 F : le PRIX vient de l'application, il
--      n'y a donc rien à changer ici — sauf le poids de rotation (point 3).
--   3. Rotation des annonces : toutes les mises en avant actives tournent à
--      ÉGALITÉ. Un Pro qui paie 800 F/jour ne doit pas passer après un vendeur
--      qui paie 1 000 F/jour : l'ordre réel se fait déjà sur « le moins vu
--      aujourd'hui ».
--
-- Idempotent : peut être relancé sans effet de bord.
-- ============================================================

-- ------------------------------------------------------------------
-- 1. Crédit mensuel : 2 000 F
-- ------------------------------------------------------------------
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

-- ------------------------------------------------------------------
-- 2. Rotation des annonces : égalité entre toutes les mises en avant actives
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.boost_weight(p_daily_budget int)
RETURNS int
LANGUAGE sql IMMUTABLE
AS $fn$
  SELECT CASE WHEN coalesce(p_daily_budget, 0) > 0 THEN 1 ELSE 0 END
$fn$;

-- ============================================================
-- CONTRÔLES
-- ============================================================
-- select pg_get_functiondef(p.oid) like '%c_credit constant int := 2000%' as credit_2000_ok
--   from pg_proc p where p.proname = 'pro_monthly_credit';
--
-- select pg_get_functiondef(p.oid) like '%> 0 THEN 1%' as rotation_egalitaire_ok
--   from pg_proc p where p.proname = 'boost_weight';
