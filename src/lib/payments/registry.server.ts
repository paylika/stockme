import { stripeProvider } from "@/lib/payments/stripe.server";
import type { PaymentMethod, PaymentProvider } from "@/lib/payments/types";

/**
 * Registre des fournisseurs de paiement.
 *
 * StockMe encaisse par CARTE BANCAIRE (Visa / Mastercard, via Stripe).
 * C'est le seul moyen en ligne : c'est un choix d'exploitation, pas un oubli.
 *
 * Conséquence importante : tout ce que le site annonce comme payable en ligne
 * est payable par carte, et rien d'autre. La tour de contrôle (/api/health) ne
 * signale plus de moyen de paiement manquant, puisque aucun n'est attendu.
 *
 * POUR AJOUTER UN MOYEN PLUS TARD (mobile money, virement…) : le fournisseur
 * `unitechpay.server.ts` est conservé dans le dossier ; il suffit de le
 * remettre dans cette liste et d'ajouter sa clé dans les variables du Worker.
 * Le reste du site (portefeuille, boosts, abonnements) n'a rien à changer : il
 * n'affiche que les moyens réellement configurés.
 */
export const PROVIDERS: PaymentProvider[] = [stripeProvider];

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
