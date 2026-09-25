-- ============================================================
-- StockMe — Nouvelles règles de publication (simples et identiques pour tous)
--
--   1. 20 produits publiés OFFERTS (au lieu de 10) ;
--   2. 10 photos par produit pour TOUT LE MONDE, compte gratuit compris ;
--   3. au-delà de 20 produits : 500 F par publication, prélevés du SOLDE ;
--   4. la mise en avant reste à 500 F/jour pour tout le monde.
--
-- POURQUOI dans la base : le navigateur ne doit jamais décider si une
-- publication est gratuite ou payante. Le débit est fait ICI, dans la même
-- transaction que la publication : si la publication échoue, le débit est
-- annulé automatiquement (aucun vendeur ne paie pour rien).
--
-- Le vendeur au solde insuffisant reçoit un message clair au lieu d'une erreur
-- technique : il recharge et republie.
--
-- Idempotent : peut être relancé sans effet de bord.
-- ============================================================

-- ------------------------------------------------------------------
-- 0. Le journal du portefeuille accepte le motif « publication »
-- ------------------------------------------------------------------
ALTER TABLE public.wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_kind_check;
ALTER TABLE public.wallet_transactions
  ADD CONSTRAINT wallet_transactions_kind_check
  CHECK (kind IN ('topup', 'boost', 'subscription', 'refund', 'adjustment', 'publication'));

-- ------------------------------------------------------------------
-- 1. Quotas et prix de publication
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.products_guard_limits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c_max_images   constant int := 10;   -- photos par produit, pour tout le monde
  c_free_products constant int := 20;  -- publications offertes
  c_extra_price  constant int := 500;  -- prix d'une publication supplémentaire
  v_count int;
  v_balance int;
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
      SELECT coalesce(balance_fcfa, 0) INTO v_balance
        FROM public.wallets WHERE user_id = NEW.owner_id;
      v_balance := coalesce(v_balance, 0);

      IF v_balance < c_extra_price THEN
        RAISE EXCEPTION
          'Vous avez atteint vos % produits publiés offerts. Chaque publication supplémentaire coûte % FCFA : rechargez votre solde (disponible : % FCFA).',
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

  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.products_guard_limits() FROM PUBLIC;

-- ============================================================
-- CONTRÔLES
-- ============================================================
-- A) Les nouvelles limites sont-elles en place ?
-- select pg_get_functiondef(p.oid) like '%c_free_products constant int := 20%' as limite_20_ok,
--        pg_get_functiondef(p.oid) like '%c_extra_price  constant int := 500%' as prix_500_ok
--   from pg_proc p where p.proname = 'products_guard_limits';
--
-- B) Des vendeurs ont-ils DÉJÀ plus de 20 produits publiés ?
--    (utile à savoir avant d'annoncer la règle : eux ne paieront que pour de
--     nouvelles publications, les produits déjà en ligne ne sont jamais facturés)
-- select owner_id, count(*) as produits_en_ligne
--   from public.products where published = true
--  group by owner_id having count(*) > 20 order by 2 desc;
