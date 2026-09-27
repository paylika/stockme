-- ============================================================
-- StockMe — REVENUS : LE DÉTAIL DE CHAQUE PAIEMENT
--
-- POURQUOI : les totaux ne suffisent pas. Il faut pouvoir répondre à
-- « qui a payé, pour quoi, et a-t-il reçu ce qu'il a payé ? ».
--
-- Cette fonction renvoie donc CHAQUE paiement avec :
--   • l'identité du payeur (email, boutique, téléphone) ;
--   • l'objet réel (rechargement / mise en avant / abonnement Pro / badge) ;
--   • le statut exact (payé, en attente, échoué…), la référence du fournisseur ;
--   • `delivered` = la personne a-t-elle VRAIMENT reçu ce qu'elle a payé ?
--     (badge/abonnement actif · solde crédité · mise en avant lancée)
--
-- Les badges activés à la main ressortent donc comme « livrés » : on voit que
-- le vendeur a bien eu son badge, même si l'activation a été manuelle.
--
-- Idempotent : peut être relancé sans effet de bord.
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_payments_detail(p_limit int DEFAULT 100)
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

  SELECT coalesce(json_agg(row_to_json(t)), '[]'::json) INTO v FROM (
    SELECT
      i.id,
      i.created_at,
      i.paid_at,
      i.status,
      i.purpose,
      i.amount_fcfa,
      i.provider,
      i.method,
      i.provider_ref,
      i.checkout_url,
      i.user_id,
      u.email,
      coalesce(nullif(btrim(p.shop_name), ''), p.full_name) AS seller,
      coalesce(p.phone, p.whatsapp) AS seller_phone,
      p.plan AS seller_plan,
      coalesce(p.verified, false) AS seller_verified,
      p.verified_until AS seller_verified_until,
      (i.metadata->>'plan') AS plan_meta,
      (i.metadata->>'days')::int AS jours,
      -- CE QUE LA PERSONNE A PAYÉ, EN CLAIR
      CASE
        WHEN i.purpose = 'wallet_topup' THEN 'Rechargement du solde'
        WHEN i.purpose = 'boost' THEN 'Mise en avant (payée directement)'
        WHEN coalesce(i.metadata->>'plan', '') = 'pro' THEN 'Abonnement Vendeur Pro'
        ELSE 'Badge Fournisseur vérifié'
      END AS objet,
      -- A-T-ELLE REÇU CE QU'ELLE A PAYÉ ?
      CASE
        WHEN i.status <> 'paid' THEN NULL
        WHEN i.purpose = 'subscription' THEN
          (coalesce(p.verified, false) AND (p.verified_until IS NULL OR p.verified_until > now()))
        WHEN i.purpose = 'wallet_topup' THEN EXISTS (
          SELECT 1 FROM public.wallet_transactions w
           WHERE w.user_id = i.user_id
             AND w.kind = 'topup'
             AND w.amount_fcfa = i.amount_fcfa
             AND w.created_at BETWEEN i.created_at - interval '2 hours'
                                  AND coalesce(i.paid_at, i.created_at) + interval '3 days'
        )
        WHEN i.purpose = 'boost' THEN EXISTS (
          SELECT 1 FROM public.boost_campaigns c
           WHERE c.user_id = i.user_id
             AND c.created_at BETWEEN i.created_at - interval '2 hours'
                                  AND coalesce(i.paid_at, i.created_at) + interval '3 days'
        )
        ELSE NULL
      END AS delivered
    FROM public.payment_intents i
    LEFT JOIN auth.users u ON u.id = i.user_id
    LEFT JOIN public.profiles p ON p.id = i.user_id
    ORDER BY coalesce(i.paid_at, i.created_at) DESC
    LIMIT greatest(1, least(coalesce(p_limit, 100), 300))
  ) t;

  RETURN v;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.admin_payments_detail(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_payments_detail(int) TO authenticated;

-- ============================================================
-- CONTRÔLES
-- ============================================================
-- select pg_get_functiondef(p.oid) like '%delivered%' as detail_paiements_ok
--   from pg_proc p where p.proname = 'admin_payments_detail';
--
-- -- Paiements marqués PAYÉS mais dont le vendeur n'a RIEN reçu (à corriger) :
-- select i.paid_at, i.amount_fcfa, i.purpose, i.provider, u.email
--   from public.payment_intents i
--   left join auth.users u on u.id = i.user_id
--   left join public.profiles p on p.id = i.user_id
--  where i.status = 'paid'
--    and i.purpose = 'subscription'
--    and not (coalesce(p.verified, false) and (p.verified_until is null or p.verified_until > now()))
--  order by i.paid_at desc;
--
-- -- Paiements EN ATTENTE (à ne PAS compter comme revenus) :
-- select i.created_at, i.amount_fcfa, i.purpose, i.status, i.provider, u.email
--   from public.payment_intents i
--   left join auth.users u on u.id = i.user_id
--  where i.status <> 'paid'
--  order by i.created_at desc
--  limit 30;
