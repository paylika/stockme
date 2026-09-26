-- ============================================================
-- BADGE FOURNISSEUR VÉRIFIÉ — ACTIVATION MANUELLE
-- ============================================================
-- À utiliser quand un vendeur a payé (Wave / Orange Money sur WhatsApp, ou
-- carte bancaire) mais que son badge n'est pas encore allumé.
--
-- ⚠️ TRÈS IMPORTANT
-- Le garde-fou `profiles_guard_verified` REMET l'ancienne valeur si la
-- modification n'est pas faite par un administrateur connecté. Dans l'éditeur
-- SQL, `auth.uid()` est NULL : un simple UPDATE sans désactiver le trigger
-- ne fait DONC RIEN (aucune erreur, aucun effet). C'est pour ça que les
-- requêtes ci-dessous désactivent le trigger le temps de l'opération.


-- ============================================================
-- 1) QUI A PAYÉ SANS RECEVOIR LE BADGE ? (contrôle, ne modifie rien)
-- ============================================================
-- a) paiements par carte enregistrés comme payés, vendeur toujours non vérifié
SELECT
  pi.paid_at,
  pi.amount_fcfa,
  pi.method,
  pi.provider,
  pi.user_id,
  COALESCE(NULLIF(pf.shop_name, ''), pf.full_name, '—') AS boutique,
  pf.verified,
  pf.verified_until
FROM public.payment_intents pi
LEFT JOIN public.profiles pf ON pf.id = pi.user_id
WHERE pi.purpose = 'subscription'
  AND pi.status = 'paid'
  AND COALESCE(pf.verified, false) = false
ORDER BY pi.paid_at DESC;

-- b) paiements carte restés en attente (le paiement n'est jamais revenu)
SELECT pi.created_at, pi.amount_fcfa, pi.method, pi.status, pi.provider_ref,
       COALESCE(NULLIF(pf.shop_name, ''), pf.full_name, '—') AS boutique, pi.user_id
FROM public.payment_intents pi
LEFT JOIN public.profiles pf ON pf.id = pi.user_id
WHERE pi.purpose = 'subscription'
  AND pi.status <> 'paid'
ORDER BY pi.created_at DESC
LIMIT 50;


-- ============================================================
-- 2) ACTIVER LE BADGE (12 MOIS) POUR TOUS CEUX QUI ONT PAYÉ
-- ============================================================
BEGIN;
ALTER TABLE public.profiles DISABLE TRIGGER profiles_guard_verified;

WITH payeurs AS (
  SELECT DISTINCT pi.user_id
  FROM public.payment_intents pi
  JOIN public.profiles pf ON pf.id = pi.user_id
  WHERE pi.purpose = 'subscription'
    AND pi.status = 'paid'
    AND COALESCE(pf.verified, false) = false
)
UPDATE public.profiles p
   SET verified       = true,
       verified_at    = COALESCE(p.verified_at, now()),
       verified_until = GREATEST(COALESCE(p.verified_until, now()), now()) + interval '12 months'
  FROM payeurs
 WHERE p.id = payeurs.user_id;

ALTER TABLE public.profiles ENABLE TRIGGER profiles_guard_verified;
COMMIT;


-- ============================================================
-- 3) ACTIVER LE BADGE POUR UNE SEULE BOUTIQUE (nom reçu sur WhatsApp)
-- ============================================================
-- Remplacez le nom, puis exécutez le bloc entier.
BEGIN;
ALTER TABLE public.profiles DISABLE TRIGGER profiles_guard_verified;

UPDATE public.profiles
   SET verified       = true,
       verified_at    = COALESCE(verified_at, now()),
       verified_until = GREATEST(COALESCE(verified_until, now()), now()) + interval '12 months'
 WHERE lower(btrim(COALESCE(shop_name, ''))) = lower(btrim('NOM DE LA BOUTIQUE'));

ALTER TABLE public.profiles ENABLE TRIGGER profiles_guard_verified;
COMMIT;


-- ============================================================
-- 4) CONTRÔLE FINAL
-- ============================================================
SELECT
  count(*) FILTER (WHERE verified AND (verified_until IS NULL OR verified_until > now())) AS vendeurs_verifies,
  count(*) FILTER (WHERE verified AND verified_until IS NOT NULL AND verified_until <= now()) AS badges_expires,
  count(*) AS profils;
