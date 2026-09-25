import { supabase } from "@/integrations/supabase/stockme-client";

/**
 * Démarrage d'un paiement (rechargement, abonnement).
 * Le fournisseur (Stripe, UnitechPay…) est choisi par le serveur : le
 * navigateur ne connaît jamais la clé secrète.
 */

export type PayMethod = "wave" | "orange_money" | "card";
export type PayPurpose = "wallet_topup" | "subscription" | "boost";

export type CheckoutResult = {
  intent_id: string;
  provider: string;
  provider_label: string;
  checkout_url: string;
  qr_code?: string | null;
};

export async function startCheckout(input: {
  purpose: PayPurpose;
  amount: number;
  method: PayMethod;
  customerNumber?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<CheckoutResult> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Reconnectez-vous pour payer.");

  const res = await fetch("/api/pay/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });

  const json = (await res.json()) as CheckoutResult & { error?: string };
  if (!res.ok) throw new Error(json?.error ?? "Paiement impossible pour le moment.");
  if (!json.checkout_url) throw new Error("Le fournisseur n'a pas renvoyé de lien de paiement.");
  return json;
}

/** Envoie le vendeur sur la page de paiement du fournisseur. */
export async function goToCheckout(input: Parameters<typeof startCheckout>[0]): Promise<void> {
  const result = await startCheckout(input);
  window.location.href = result.checkout_url;
}

export const METHOD_LABELS: Record<PayMethod, string> = {
  card: "Carte bancaire",
  wave: "Wave",
  orange_money: "Orange Money",
};
