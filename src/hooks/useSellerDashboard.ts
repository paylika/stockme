import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/stockme-client";
import type { WalletData } from "@/hooks/useWallet";

/**
 * TOUT L'ESPACE VENDEUR EN UN SEUL APPEL.
 *
 * POURQUOI : chaque requête à la base coûte environ une demi-seconde depuis un
 * téléphone en Afrique de l'Ouest. La page Profil appelait la base 9 fois
 * (profil, produits, statistiques, portefeuille, barre latérale ×2, liste des
 * produits, réparation des publicités, demandes) : entre 3 et 6 secondes
 * d'attente, à chaque ouverture.
 *
 * Ici, une seule fonction SQL (`seller_dashboard`) renvoie tout, et TOUS les
 * composants (page Profil, menu latéral, solde, statistiques) lisent ce même
 * paquet déjà en mémoire. Pas de second appel, pas de doublon.
 */

export type SellerProfileRow = {
  id: string;
  shop_name: string | null;
  full_name: string | null;
  avatar_url: string | null;
  city: string | null;
  bio: string | null;
  phone: string | null;
  whatsapp: string | null;
  role: string | null;
  plan: string | null;
  verified: boolean | null;
  verified_until: string | null;
  banner_url: string | null;
  banner_position: number | null;
  /** Compte suspendu par l'administration (annonces masquées). */
  banned?: boolean | null;
};

export type SellerProductRow = {
  id: string;
  name: string;
  price_fcfa: number;
  promo_price_fcfa: number | null;
  quantity: number;
  moq: number;
  city: string | null;
  category: string | null;
  images: string[] | null;
  published: boolean;
  sold_out: boolean;
  dropshipping: boolean;
};

export type SellerStatsRow = {
  total_products: number;
  total_views: number;
  total_contacts: number;
  total_favorites: number;
  stock_value?: number;
  countries?: { country: string; value: number }[];
  trend?: { day: string; value: number }[];
};

export type SellerDashboard = {
  profile: SellerProfileRow | null;
  products: SellerProductRow[];
  stats: SellerStatsRow | null;
  wallet: WalletData | null;
  requests: number;
};

/* ------------------------------------------------------------------ *
 * Magasin partagé : une seule requête en vol, pour tout le site.
 * ------------------------------------------------------------------ */

type Snapshot = { data: SellerDashboard | null; loading: boolean };

let snapshot: Snapshot = { data: null, loading: false };
let inflight: Promise<SellerDashboard | null> | null = null;
let warnedOnce = false;
const listeners = new Set<() => void>();

/**
 * Déconnexion / connexion : on VIDE la mémoire puis on recharge. Sans cela, un
 * vendeur qui se déconnecte sur un téléphone partagé laisserait ses données
 * visibles pour le compte suivant.
 */
let wired = false;
const wireAuth = () => {
  if (wired || typeof window === "undefined") return;
  wired = true;
  supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") {
      inflight = null;
      emit({ data: null, loading: false });
    } else if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
      inflight = null;
      void loadSellerDashboard(true);
    }
  });
};

const emit = (next: Snapshot) => {
  snapshot = next;
  listeners.forEach((l) => l());
};

/**
 * PLAN B — si la fonction `seller_dashboard` n'existe pas encore en base
 * (SQL pas encore collé), on refait les mêmes lectures en parallèle : 4 appels
 * au lieu de 1, mais la page fonctionne normalement. Dès que le SQL est en
 * place, ce chemin n'est plus jamais utilisé.
 */
const legacyDashboard = async (): Promise<SellerDashboard | null> => {
  const { data: session } = await supabase.auth.getSession();
  const uid = session.session?.user?.id;
  if (!uid) return null;

  const [profRes, prodRes, walletRes, statsRes] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id,shop_name,full_name,avatar_url,city,bio,phone,whatsapp,role,plan,verified,verified_until,banner_url,banner_position,banned",
      )
      .eq("id", uid)
      .maybeSingle(),
    supabase
      .from("products")
      .select(
        "id,name,price_fcfa,promo_price_fcfa,quantity,moq,city,category,images,published,sold_out,dropshipping,created_at",
      )
      .eq("owner_id", uid)
      .order("created_at", { ascending: false }),
    supabase.rpc("wallet_overview"),
    supabase.rpc("get_seller_stats", { p_seller_id: uid }),
  ]);

  return {
    profile: (profRes.data as SellerProfileRow | null) ?? null,
    products: (prodRes.data as SellerProductRow[] | null) ?? [],
    stats: (statsRes.data as SellerStatsRow | null) ?? null,
    wallet: (walletRes.data as WalletData | null) ?? null,
    requests: 0,
  };
};

/** Requête unique. `force` = on rafraîchit (après un paiement, un boost…). */
export const loadSellerDashboard = async (force = false): Promise<SellerDashboard | null> => {
  if (inflight && !force) return inflight;

  if (!force && snapshot.data && !snapshot.loading) return snapshot.data;

  const run = (async () => {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session?.user) {
      emit({ data: null, loading: false });
      return null;
    }

    emit({ data: snapshot.data, loading: true });

    const { data, error } = await supabase.rpc("seller_dashboard");
    const res = (data ?? null) as (SellerDashboard & { ok?: boolean; reason?: string }) | null;

    // Fonction absente ou en erreur → on repasse par les lectures classiques.
    if (error || !res?.ok) {
      if (error && !warnedOnce) {
        warnedOnce = true;
        console.info(
          "[StockMe] seller_dashboard absent : repli sur les lectures séparées (collez le BLOC 1 de supabase/VITESSE.sql pour accélérer).",
        );
      }
      const fallback = await legacyDashboard();
      emit({ data: fallback, loading: false });
      return fallback;
    }

    const next: SellerDashboard = {
      profile: res.profile ?? null,
      products: res.products ?? [],
      stats: res.stats ?? null,
      wallet: res.wallet ?? null,
      requests: res.requests ?? 0,
    };
    emit({ data: next, loading: false });
    return next;
  })().finally(() => {
    inflight = null;
  });

  inflight = run;
  return run;
};

/** Rafraîchit tout (profil, produits, statistiques, solde) en un appel. */
export const refreshSellerDashboard = () => loadSellerDashboard(true);

/** Vide la mémoire (déconnexion). */
export const clearSellerDashboard = () => {
  inflight = null;
  emit({ data: null, loading: false });
};

/**
 * Le vendeur est-il Vendeur Pro (abonnement en cours) ?
 * Sert à appliquer SON tarif de mise en avant : 800 F/jour au lieu de 1 000 F.
 */
export function useIsPro() {
  const { data } = useSellerDashboard();
  const p = data?.profile;
  if (!p || p.plan !== "pro") return false;
  const until = p.verified_until;
  return !until || new Date(until) > new Date();
}

/**
 * Lit le paquet partagé. `enabled = false` (visiteur non connecté) : rien.
 */
export function useSellerDashboard(enabled = true) {
  const [, bump] = useState(0);

  useEffect(() => {
    wireAuth();
    const l = () => bump((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  useEffect(() => {
    if (!enabled) {
      clearSellerDashboard();
      return;
    }
    // Déjà en mémoire (arrivée sur une autre page) → aucun appel réseau.
    if (snapshot.data) return;
    void loadSellerDashboard();
  }, [enabled]);

  const refresh = useCallback(() => {
    void refreshSellerDashboard();
  }, []);

  return { data: snapshot.data, loading: snapshot.loading || (!snapshot.data && enabled), refresh };
}
