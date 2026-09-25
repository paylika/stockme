import { useEffect, useState } from "react";

/**
 * Interrupteur central des fonctionnalités PAYANTES (portefeuille, boost,
 * abonnement par carte).
 *
 * OUVERT le 25/09/2026 après vérification complète :
 *   • Stripe actif et testé avec un vrai paiement (solde crédité) ;
 *   • secret de webhook présent et signé ;
 *   • clé de service opérationnelle ;
 *   • tâche quotidienne protégée ;
 *   • toutes les fonctions SQL en place ;
 *   • aucune page en erreur.
 *
 * Double sécurité conservée :
 *   1. `PAYMENTS_UI_ENABLED` : interrupteur manuel (le remettre à false
 *      masque immédiatement toute l'interface payante).
 *   2. Le serveur : `/api/pay/checkout` ne renvoie un moyen de paiement
 *      que si le fournisseur a réellement ses clés. Si les variables
 *      Cloudflare disparaissent, l'interface se masque toute seule.
 */

export const PAYMENTS_UI_ENABLED = true;

export type PaymentsStatus = {
  /** true uniquement si l'interrupteur est ouvert ET qu'un paiement est configuré. */
  enabled: boolean;
  loading: boolean;
  /** Moyens de paiement réellement disponibles : wave, orange_money, card… */
  methods: string[];
  providers: { name: string; label: string; methods: string[]; configured: boolean }[];
};

let cached: Omit<PaymentsStatus, "loading"> | null = null;
let inflight: Promise<Omit<PaymentsStatus, "loading">> | null = null;

async function fetchStatus(): Promise<Omit<PaymentsStatus, "loading">> {
  if (cached) return cached;
  if (typeof window === "undefined") return { enabled: false, methods: [], providers: [] };

  inflight =
    inflight ??
    fetch("/api/pay/checkout")
      .then((r) => (r.ok ? r.json() : { methods: [], providers: [] }))
      .then((d: { methods?: string[]; providers?: PaymentsStatus["providers"] }) => {
        const methods = d?.methods ?? [];
        cached = {
          enabled: PAYMENTS_UI_ENABLED && methods.length > 0,
          methods,
          providers: d?.providers ?? [],
        };
        return cached;
      })
      .catch(() => {
        cached = { enabled: false, methods: [], providers: [] };
        return cached;
      });

  return inflight;
}

export function usePaymentsStatus(): PaymentsStatus {
  const [state, setState] = useState<PaymentsStatus>(() =>
    cached ? { ...cached, loading: false } : { enabled: false, loading: true, methods: [], providers: [] },
  );

  useEffect(() => {
    let cancel = false;
    if (cached) {
      setState({ ...cached, loading: false });
      return;
    }
    fetchStatus().then((s) => {
      if (!cancel) setState({ ...s, loading: false });
    });
    return () => {
      cancel = true;
    };
  }, []);

  return state;
}
