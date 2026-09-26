-- ============================================================
-- StockMe — On ne facture JAMAIS une journée qui n'a pas pu être servie
--
-- PROBLÈME RÉSOLU
--   La tâche quotidienne (`boost_run_daily`) débitait 1 000 F par jour à une
--   campagne active, sans vérifier que le produit pouvait réellement s'afficher.
--   Un produit dépublié ou EN RUPTURE DE STOCK disparaît pourtant des
--   emplacements mis en avant (`get_sponsored_products` filtre sold_out) :
--   le vendeur payait donc des journées pendant lesquelles son annonce était
--   invisible — exactement le genre de chose qui fait perdre la confiance.
--
-- CE QUE FAIT CE SCRIPT
--   • produit publié ET disponible  → journée servie et facturée (comme avant) ;
--   • produit dépublié ou en rupture → journée NON facturée, campagne laissée
--     ACTIVE : rien n'est perdu, la diffusion repart dès la remise en stock.
--
-- Le reste du comportement est inchangé (solde insuffisant → pause, etc.).
-- Idempotent : peut être relancé sans effet de bord.
-- ============================================================

CREATE OR REPLACE FUNCTION public.boost_run_daily()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  c record;
  v_balance int;
  v_ad uuid;
  v_served int := 0;
  v_paused int := 0;
  v_skipped int := 0;
BEGIN
  FOR c IN
    SELECT * FROM public.boost_campaigns WHERE status = 'active' FOR UPDATE
  LOOP
    -- 0. Le produit peut-il être montré ? Sinon on ne débite RIEN.
    IF NOT EXISTS (
      SELECT 1 FROM public.products p
       WHERE p.id = c.product_id
         AND p.published = true
         AND p.sold_out = false
    ) THEN
      UPDATE public.boost_campaigns SET last_run_at = now() WHERE id = c.id;
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    SELECT balance_fcfa INTO v_balance FROM public.wallets WHERE user_id = c.user_id;
    v_balance := coalesce(v_balance, 0);

    -- Solde insuffisant → on met la campagne en pause (elle reprendra après recharge)
    IF v_balance < c.daily_budget_fcfa THEN
      UPDATE public.boost_campaigns
         SET status = 'paused', last_run_at = now()
       WHERE id = c.id;
      v_paused := v_paused + 1;
      CONTINUE;
    END IF;

    -- Débit du budget du jour
    UPDATE public.wallets
       SET balance_fcfa = balance_fcfa - c.daily_budget_fcfa, updated_at = now()
     WHERE user_id = c.user_id;

    INSERT INTO public.wallet_transactions (user_id, amount_fcfa, kind, label)
    VALUES (c.user_id, -c.daily_budget_fcfa, 'boost',
            'Boost quotidien — ' || c.daily_budget_fcfa || ' FCFA');

    -- La mise en avant couvre la journée : on prolonge l'annonce existante
    IF c.ad_id IS NULL THEN
      INSERT INTO public.ads (kind, product_id, starts_at, ends_at, active, weight)
      VALUES ('product', c.product_id, now(), now() + interval '1 day', true,
              public.boost_weight(c.daily_budget_fcfa))
      RETURNING id INTO v_ad;

      UPDATE public.boost_campaigns SET ad_id = v_ad WHERE id = c.id;
    ELSE
      UPDATE public.ads
         SET active = true,
             ends_at = greatest(coalesce(ends_at, now()), now()) + interval '1 day',
             weight = public.boost_weight(c.daily_budget_fcfa)
       WHERE id = c.ad_id;
    END IF;

    UPDATE public.boost_campaigns
       SET days_served = days_served + 1,
           total_spent_fcfa = total_spent_fcfa + c.daily_budget_fcfa,
           last_run_at = now()
     WHERE id = c.id;

    v_served := v_served + 1;
  END LOOP;

  RETURN json_build_object('ok', true, 'served', v_served, 'paused', v_paused,
                           'skipped', v_skipped, 'ran_at', now());
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.boost_run_daily() FROM PUBLIC, anon, authenticated;

-- ============================================================
-- CONTRÔLE : doit renvoyer true
-- ============================================================
SELECT pg_get_functiondef(p.oid) LIKE '%v_skipped%' AS journee_non_servie_non_facturee
FROM pg_proc p WHERE p.proname = 'boost_run_daily';
