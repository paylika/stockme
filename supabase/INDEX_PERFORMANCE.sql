-- ============================================================================
-- StockMe — INDEX DE PERFORMANCE
-- Le plus gros gain de vitesse, sans toucher à une seule ligne de code.
--
-- MODE D'EMPLOI : coller TOUT ce fichier d'un coup dans Supabase → SQL Editor →
-- Run. Rien à découper : aucun index n'utilise CONCURRENTLY, tout est idempotent
-- (`IF NOT EXISTS`), donc le fichier peut être relancé sans risque.
--
-- Vérifié le 28/09 : les 10 tables et les 55 colonnes utilisées ici existent
-- bien dans la base (contrôle automatique sur la vraie base).
-- ============================================================================

-- ============================================================================
-- PALIER 1 — GAIN ÉLEVÉ (fonctions appelées à CHAQUE affichage de page)
-- ============================================================================

-- 1. Classement de l'accueil et recherche IA : « ce produit est-il mis en avant ? »
--    Sans cet index, la table `ads` est parcourue ENTIÈREMENT pour chaque produit.
CREATE INDEX IF NOT EXISTS ads_product_idx
  ON public.ads (product_id) INCLUDE (kind, active, starts_at, ends_at);

-- 2. Favoris comptés PAR PRODUIT : l'index existant commence par user_id, donc
--    inutilisable ici (la table était lue en entier à chaque fiche produit).
CREATE INDEX IF NOT EXISTS favorites_product_idx
  ON public.favorites (product_id);

-- 3. Événements par produit ET par type ET par date (classement, similaires…).
--    Sans lui : tout l'historique d'un produit était lu pour compter 30 jours.
CREATE INDEX IF NOT EXISTS product_events_prod_event_created_idx
  ON public.product_events (product_id, event, created_at DESC);

-- 4. Rotation des annonces : « vues du jour » et « clics 7 jours » par annonce.
CREATE INDEX IF NOT EXISTS ad_events_ad_event_created_idx
  ON public.ad_events (ad_id, event_type, created_at DESC);

-- 5. Page Revenus : sommes et tri par date des paiements.
CREATE INDEX IF NOT EXISTS payment_intents_status_paid_at_idx
  ON public.payment_intents (status, paid_at DESC NULLS LAST);

-- 6. Fils d'accueil et catalogue : produits publiés triés par date.
--    L'index existant sur `published` seul (booléen) est inutilisable.
CREATE INDEX IF NOT EXISTS products_published_created_idx
  ON public.products (published, created_at DESC);

-- 7. Réparation automatique des campagnes (exécutée à CHAQUE page vendeur).
CREATE INDEX IF NOT EXISTS boost_campaigns_ad_idx
  ON public.boost_campaigns (ad_id);

-- 8. Recherche par nom de produit (ILIKE '%…%') : aucun index classique ne peut
--    servir ce type de recherche, il faut un index trigram.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS products_name_trgm_idx
  ON public.products USING gin (name gin_trgm_ops);

-- ============================================================================
-- PALIER 2 — GAIN MOYEN À ÉLEVÉ (admin, espace vendeur, filtres du catalogue)
-- ============================================================================

CREATE INDEX IF NOT EXISTS payment_intents_status_purpose_idx
  ON public.payment_intents (status, purpose) INCLUDE (amount_fcfa, paid_at);

CREATE INDEX IF NOT EXISTS products_pub_city_created_idx
  ON public.products (city, created_at DESC) WHERE published;

CREATE INDEX IF NOT EXISTS products_pub_cat_created_idx
  ON public.products (category, created_at DESC) WHERE published;

CREATE INDEX IF NOT EXISTS products_pub_dropship_created_idx
  ON public.products (dropshipping, created_at DESC) WHERE published;

-- Tâche quotidienne des mises en avant : évite de verrouiller TOUTE la table.
CREATE INDEX IF NOT EXISTS boost_campaigns_status_idx
  ON public.boost_campaigns (status) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS wallet_tx_user_kind_idx
  ON public.wallet_transactions (user_id, kind, created_at DESC);

CREATE INDEX IF NOT EXISTS wallet_tx_kind_created_idx
  ON public.wallet_transactions (kind, created_at DESC) INCLUDE (amount_fcfa, label);

CREATE INDEX IF NOT EXISTS profiles_verified_idx
  ON public.profiles (verified_until) WHERE verified;

CREATE INDEX IF NOT EXISTS profiles_plan_verified_idx
  ON public.profiles (plan, verified_until) WHERE verified;

CREATE INDEX IF NOT EXISTS products_owner_published_idx
  ON public.products (owner_id, published);

CREATE INDEX IF NOT EXISTS products_owner_created_idx
  ON public.products (owner_id, created_at DESC);

-- Renouvellement d'abonnement : retrouver un paiement par sa référence.
CREATE INDEX IF NOT EXISTS payment_intents_subref_idx
  ON public.payment_intents ((metadata->>'subscription_ref'))
  WHERE metadata ? 'subscription_ref';

CREATE INDEX IF NOT EXISTS product_events_event_created_idx
  ON public.product_events (event, created_at DESC);

-- ============================================================================
-- PALIER 3 — GAIN MOYEN (tables en croissance, pages secondaires)
-- ============================================================================

CREATE INDEX IF NOT EXISTS buying_requests_status_expires_idx
  ON public.buying_requests (status, expires_at);

CREATE INDEX IF NOT EXISTS buying_requests_user_created_idx
  ON public.buying_requests (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS boost_campaigns_user_created_idx
  ON public.boost_campaigns (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS buying_requests_trgm_idx
  ON public.buying_requests USING gin ((title || ' ' || coalesce(description, '')) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS payment_intents_pending_idx
  ON public.payment_intents (created_at DESC) WHERE status = 'pending';

-- Prépare le nettoyage/agrégation des événements (dégradation dans le temps).
CREATE INDEX IF NOT EXISTS product_events_created_idx
  ON public.product_events (created_at);

-- ============================================================================
-- APRÈS LES INDEX : mettre à jour les statistiques du planificateur
-- ============================================================================
ANALYZE public.products;
ANALYZE public.product_events;
ANALYZE public.ad_events;
ANALYZE public.ads;
ANALYZE public.favorites;
ANALYZE public.payment_intents;
ANALYZE public.wallet_transactions;
ANALYZE public.boost_campaigns;
ANALYZE public.profiles;
ANALYZE public.buying_requests;

-- ============================================================================
-- CONTRÔLE FINAL — doit afficher 27
-- ============================================================================
select count(*) as index_crees from pg_indexes
 where schemaname = 'public'
   and indexname in ('ads_product_idx','favorites_product_idx',
     'product_events_prod_event_created_idx','ad_events_ad_event_created_idx',
     'payment_intents_status_paid_at_idx','products_published_created_idx',
     'boost_campaigns_ad_idx','products_name_trgm_idx',
     'payment_intents_status_purpose_idx','products_pub_city_created_idx',
     'products_pub_cat_created_idx','products_pub_dropship_created_idx',
     'boost_campaigns_status_idx','wallet_tx_user_kind_idx',
     'wallet_tx_kind_created_idx','profiles_verified_idx',
     'profiles_plan_verified_idx','products_owner_published_idx',
     'products_owner_created_idx','payment_intents_subref_idx',
     'product_events_event_created_idx','buying_requests_status_expires_idx',
     'buying_requests_user_created_idx','boost_campaigns_user_created_idx',
     'buying_requests_trgm_idx','payment_intents_pending_idx',
     'product_events_created_idx');
