import { useEffect, useState } from "react";
import { ensureSession } from "@/lib/auth-session";

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

let cached: (Omit<PaymentsStatus, "loading"> & { avecSession: boolean }) | null = null;
let inflight: Promise<Omit<PaymentsStatus, "loading">> | null = null;

async function fetchStatus(): Promise<Omit<PaymentsStatus, "loading">> {
  if (typeof window === "undefined") return { enabled: false, methods: [], providers: [] };

  /**
   * ON ENVOIE LA SESSION QUAND ELLE EXISTE.
   *
   * Pourquoi : le mobile money (Wave / Orange) est réservé à l'administration
   * pendant les tests. C'est le SERVEUR qui décide — il a donc besoin de savoir
   * qui demande. Le cache est conservé séparément avec et sans session, sinon
   * un administrateur qui se connecte verrait encore la réponse « visiteur ».
   */
  const session = await ensureSession();
  const avecSession = !!session?.access_token;

  if (cached && cached.avecSession === avecSession) return cached;

  inflight =
    inflight ??
    fetch("/api/pay/checkout", {
      headers: avecSession ? { Authorization: `Bearer ${session?.access_token}` } : {},
    })
      .then((r) => (r.ok ? r.json() : { methods: [], providers: [] }))
      .then((d: { methods?: string[]; providers?: PaymentsStatus["providers"] }) => {
        const methods = d?.methods ?? [];
        cached = {
          enabled: PAYMENTS_UI_ENABLED && methods.length > 0,
          methods,
          providers: d?.providers ?? [],
          avecSession,
        };
        return cached;
      })
      .catch(() => {
        cached = { enabled: false, methods: [], providers: [], avecSession };
        return cached;
      })
      .finally(() => {
        inflight = null;
      });

  return inflight;
}

export function usePaymentsStatus(): PaymentsStatus {
  const [state, setState] = useState<PaymentsStatus>(() =>
    cached ? { ...cached, loading: false } : { enabled: false, loading: true, methods: [], providers: [] },
  );

  useEffect(() => {
    let cancel = false;
    /**
     * ⚠️ ON APPELLE TOUJOURS `fetchStatus()`, MÊME SI UNE VALEUR EST EN CACHE.
     *
     * Bug constaté : un administrateur ne voyait plus Wave / Orange Money.
     * Cause : la page avait mémorisé la réponse « visiteur » (carte uniquement)
     * lors d'un chargement précédent, et ce raccourci la réutilisait sans
     * vérifier si la session avait changé entre-temps.
     *
     * `fetchStatus()` sait gérer ce cas : il compare la présence de session et
     * ne rappelle le serveur que si nécessaire. C'est lui qui décide — plus ce
     * raccourci.
     */
    fetchStatus().then((s) => {
      if (!cancel) setState({ ...s, loading: false });
    });
    return () => {
      cancel = true;
    };
  }, []);

  return state;
}
