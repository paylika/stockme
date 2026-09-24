import { unitechPayProvider } from "@/lib/payments/unitechpay.server";
import { stripeProvider } from "@/lib/payments/stripe.server";
import type { PaymentMethod, PaymentProvider } from "@/lib/payments/types";

/**
 * Registre des fournisseurs de paiement.
 *
 * Pour ajouter PayDunya, CinetPay, Bictorys… : créez le fichier du fournisseur
 * sur le modèle de `unitechpay.server.ts`, puis ajoutez-le ici. Le reste de
 * l'application (portefeuille, boosts, abonnements) n'a pas à changer.
 */
export const PROVIDERS: PaymentProvider[] = [unitechPayProvider, stripeProvider];

export const getProvider = (name: string): PaymentProvider | undefined =>
  PROVIDERS.find((p) => p.name === name);

/** Liste des moyens de paiement réellement utilisables (clés présentes). */
export async function availableProviders() {
  const out: { name: string; label: string; methods: PaymentMethod[]; configured: boolean }[] = [];
  for (const p of PROVIDERS) {
    out.push({ name: p.name, label: p.label, methods: p.methods, configured: await p.isConfigured() });
  }
  return out;
}

/**
 * Choisit le fournisseur : celui demandé s'il gère ce moyen de paiement et
 * qu'il est configuré, sinon le premier fournisseur configuré qui le gère.
 */
export async function resolveProvider(preferred: string | undefined, method: PaymentMethod): Promise<PaymentProvider> {
  if (preferred) {
    const asked = getProvider(preferred);
    if (asked && asked.methods.includes(method) && (await asked.isConfigured())) return asked;
  }
  for (const p of PROVIDERS) {
    if (p.methods.includes(method) && (await p.isConfigured())) return p;
  }
  throw new Error(
    method === "card"
      ? "Le paiement par carte n'est pas encore activé."
      : "Le paiement mobile money n'est pas encore activé.",
  );
}
