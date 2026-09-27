-- =====================================================================
--  NETTOYAGE DES COMPTES DE TEST
--
--  À coller dans Supabase → SQL Editor → Run.
--
--  POURQUOI : le test de santé (`npm run smoke`) crée des comptes de
--  vérification pour contrôler la publication et le contact. Les anciens
--  essais en ont laissé quelques-uns dans la liste des utilisateurs.
--
--  CE QUE FAIT CE SCRIPT : il supprime UNIQUEMENT les comptes dont l'adresse
--  se termine par « @stockme.test » (domaine de test qui ne peut pas exister
--  dans la vraie vie) et tout ce qui leur appartient : produits, favoris,
--  statistiques, portefeuille, messages. Aucun vrai vendeur n'est touché.
--
--  Le compte « verification-auto@stockme.test » est aussi supprimé : il est
--  recréé tout seul au prochain test de santé. Rien à faire.
-- =====================================================================

DO $$
DECLARE
  v_ids uuid[];
  v_produits int := 0;
  v_comptes int := 0;
BEGIN
  SELECT array_agg(id) INTO v_ids FROM auth.users WHERE email LIKE '%@stockme.test';

  IF v_ids IS NULL OR array_length(v_ids, 1) IS NULL THEN
    RAISE NOTICE 'Aucun compte de test à supprimer.';
    RETURN;
  END IF;

  -- 1) Les suites du vendeur (ce qui pointe vers ses produits)
  DELETE FROM public.product_events WHERE seller_id = ANY(v_ids);
  DELETE FROM public.product_events WHERE product_id IN (SELECT id FROM public.products WHERE owner_id = ANY(v_ids));
  DELETE FROM public.favorites      WHERE user_id  = ANY(v_ids);
  DELETE FROM public.favorites      WHERE product_id IN (SELECT id FROM public.products WHERE owner_id = ANY(v_ids));

  -- 2) Ses produits
  DELETE FROM public.products WHERE owner_id = ANY(v_ids);
  GET DIAGNOSTICS v_produits = ROW_COUNT;

  -- 3) Ses données de compte. Chaque ligne est protégée : si une table ou une
  --    colonne n'existe pas dans VOTRE base, elle est simplement ignorée et le
  --    nettoyage continue (aucune erreur ne bloque le script).
  BEGIN DELETE FROM public.payments WHERE user_id = ANY(v_ids); EXCEPTION WHEN others THEN NULL; END;
  BEGIN DELETE FROM public.wallets  WHERE user_id = ANY(v_ids); EXCEPTION WHEN others THEN NULL; END;
  BEGIN DELETE FROM public.wallet_transactions WHERE user_id = ANY(v_ids); EXCEPTION WHEN others THEN NULL; END;
  BEGIN DELETE FROM public.payments WHERE seller_id = ANY(v_ids); EXCEPTION WHEN others THEN NULL; END;
  BEGIN DELETE FROM public.ads     WHERE owner_id = ANY(v_ids); EXCEPTION WHEN others THEN NULL; END;
  BEGIN DELETE FROM public.buy_requests WHERE user_id = ANY(v_ids); EXCEPTION WHEN others THEN NULL; END;
  BEGIN DELETE FROM public.buy_requests WHERE seller_id = ANY(v_ids); EXCEPTION WHEN others THEN NULL; END;
  BEGIN DELETE FROM public.profiles WHERE id = ANY(v_ids); EXCEPTION WHEN others THEN NULL; END;

  -- 4) Les comptes eux-mêmes
  DELETE FROM auth.users WHERE id = ANY(v_ids);
  GET DIAGNOSTICS v_comptes = ROW_COUNT;

  RAISE NOTICE 'Nettoyage terminé : % compte(s) et % produit(s) supprimés.', v_comptes, v_produits;
END $$;

-- Contrôle : il ne doit plus rester aucune ligne
SELECT count(*) AS comptes_de_test_restants
FROM auth.users
WHERE email LIKE '%@stockme.test';
