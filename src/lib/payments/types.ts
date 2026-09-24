/**
 * Couche de paiement indépendante du fournisseur.
 *
 * Ajouter un fournisseur = écrire un fichier qui respecte `PaymentProvider`
 * et l'enregistrer dans le registre. Aucun autre code n'est à modifier :
 * le portefeuille, les boosts et les abonnements s'en fichent du prestataire.
 */

export type PaymentMethod = "wave" | "orange_money" | "card";

export type CreatePaymentInput = {
  /** Montant en FCFA. */
  amount: number;
  method: PaymentMethod;
  /** Numéro mobile money du payeur (wave / orange_money). */
  customerNumber?: string | null;
  description: string;
  /** Notre identifiant d'intention, transmis au fournisseur quand il le permet. */
  intentId: string;
  /** URLs de retour du navigateur. */
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string | null;
};

export type CreatePaymentResult = {
  /** Identifiant chez le fournisseur (transaction_id Stripe session id…). */
  providerRef: string;
  /** URL vers laquelle rediriger le payeur. */
  checkoutUrl: string;
  /** Image base64 d'un QR code, si le fournisseur en renvoie un. */
  qrCode?: string | null;
  raw?: unknown;
};

export type WebhookVerification = {
  ok: boolean;
  /** Référence de la transaction chez le fournisseur. */
  providerRef?: string;
  /** Statut normalisé. */
  status?: "paid" | "failed" | "expired" | "ignored";
  amount?: number | null;
  payload?: unknown;
  reason?: string;
};

export type PaymentProvider = {
  /** Nom stocké dans `payment_intents.provider`. */
  name: string;
  /** Libellé affiché au vendeur. */
  label: string;
  /** Moyens de paiement réellement disponibles. */
  methods: PaymentMethod[];
  /** Vrai si les clés nécessaires sont configurées côté serveur. */
  isConfigured: () => Promise<boolean>;
  createPayment: (input: CreatePaymentInput) => Promise<CreatePaymentResult>;
  /** Vérifie la signature et normalise l'événement reçu. */
  verifyWebhook: (rawBody: string, headers: Headers) => Promise<WebhookVerification>;
  /** Contrôle facultatif côté serveur (anti-fraude / réconciliation). */
  fetchStatus?: (providerRef: string) => Promise<"paid" | "failed" | "expired" | "pending" | "unknown">;
};

/* ------------------------------------------------------------------ *
 * Utilitaires partagés
 * ------------------------------------------------------------------ */

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Comparaison à durée constante (évite les attaques par timing). */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const formatFcfa = (n: number) => `${n.toLocaleString("fr-FR")} FCFA`;
