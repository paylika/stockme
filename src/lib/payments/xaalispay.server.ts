import { serverEnv } from "@/lib/server-env";
import {
  hmacSha256Hex,
  safeEqual,
  type CreatePaymentInput,
  type CreatePaymentResult,
  type PaymentProvider,
  type WebhookVerification,
} from "@/lib/payments/types";

/**
 * XAALISPAY CONNECT — paiement séquestre (escrow) et mobile money.
 *
 * Doc : https://www.xaalispay.com/connect/docs (vérifiée le 27/09/2026).
 *
 * POURQUOI CE FOURNISSEUR EXISTE : il encaisse par **Wave / Orange Money /
 * Maxit** — les moyens que la majorité de tes vendeurs utilisent réellement —
 * et il peut séquestrer l'argent jusqu'à la livraison (protection acheteur et
 * vendeur). C'est la brique qui manquait pour que tes vendeurs PUISSENT payer.
 *
 * VARIABLES À METTRE DANS CLOUDFLARE (Workers → stockme → Settings → Variables) :
 *   • XAALISPAY_API_KEY       = la clé `sk_live_…` fournie par XaalisPay ;
 *   • XAALISPAY_WEBHOOK_SECRET = le secret `whsec_…` renvoyé quand tu enregistres
 *     l'adresse de webhook (voir /api/pay/webhook/xaalispay).
 * Sans ces deux variables, le fournisseur est simplement considéré comme non
 * configuré : rien ne casse, et le site n'affiche pas ce moyen de paiement.
 */

const API_URL = "https://api.xaalispay.com";

async function requete<T>(chemin: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const cle = await serverEnv("XAALISPAY_API_KEY");
  if (!cle) throw new Error("XaalisPay non configuré (XAALISPAY_API_KEY manquante).");

  const res = await fetch(`${API_URL}/api/v1/connect${chemin}`, {
    method: init.method ?? "POST",
    headers: { Authorization: `Bearer ${cle}`, "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

  const texte = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(texte) as unknown;
  } catch {
    /* réponse non JSON : on la garde en texte */
  }

  if (!res.ok) {
    // Trois formes d'erreur possibles selon la couche (doc § Erreurs).
    const corps = (json ?? {}) as Record<string, unknown>;
    const premier = Object.values(corps)[0];
    const message =
      (typeof corps.error === "string" && corps.error) ||
      (typeof corps.detail === "string" && corps.detail) ||
      (Array.isArray(premier) && typeof premier[0] === "string" && premier[0]) ||
      `XaalisPay : erreur HTTP ${res.status}`;
    throw new Error(message);
  }

  return json as T;
}

type TransactionXaalis = {
  id?: string;
  status?: string;
  checkout_url?: string;
  amount?: number;
  currency?: string;
};

export const xaalispayProvider: PaymentProvider = {
  name: "xaalispay",
  label: "Wave / Orange Money / Maxit (paiement sécurisé)",
  // Opérateurs mobile money (interrogeables via GET /operators?country=SN).
  methods: ["wave", "orange_money"],

  async isConfigured() {
    const [cle, secret] = await Promise.all([
      serverEnv("XAALISPAY_API_KEY"),
      serverEnv("XAALISPAY_WEBHOOK_SECRET"),
    ]);
    // Les DEUX sont nécessaires : sans le secret, on ne pourrait pas vérifier
    // que la notification vient bien de XaalisPay (donc pas de crédit fiable).
    return !!cle && !!secret;
  },

  /**
   * Création d'une transaction séquestre avec paiement immédiat.
   * On demande un lien de paiement (`checkout_url`) vers lequel rediriger
   * l'acheteur, exactement comme avec Stripe.
   */
  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const methode = input.method === "orange_money" ? "orange" : "wave";
    const reference = `stockme-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const transaction = await requete<TransactionXaalis>("/transactions", {
      body: {
        amount: Math.round(input.amount),
        // `beneficiary` reste obligatoire ; ici la plateforme s'auto-encaisse
        // (le compte connecté de StockMe est créé côté XaalisPay).
        beneficiary: await serverEnv("XAALISPAY_BENEFICIARY_REF"),
        // `on_funding` : les fonds passent directement en disponible — utile
        // pour un rechargement de portefeuille (pas de séquestre à gérer).
        release_policy: "on_funding",
        external_ref: reference,
        payment_method: methode,
        initiate_charge: true,
        ...(input.customerNumber ? { payer: { phone: input.customerNumber.replace(/[^\d+]/g, "") } } : {}),
      },
    });

    const url = transaction.checkout_url ?? "";
    const ref = String(transaction.id ?? reference);
    if (!url) throw new Error("XaalisPay n'a pas renvoyé de lien de paiement.");

    return { providerRef: ref, checkoutUrl: url, qrCode: null, raw: transaction };
  },

  /**
   * Vérification de la notification — HMAC-SHA256, exactement comme le décrit
   * la documentation :
   *   en-tête  X-XaalisPay-Signature: t=<horodatage>,v1=<signature>
   *   message  « <horodatage>.<corps BRUT> »   (jamais du JSON re-sérialisé)
   * On refuse aussi toute notification vieille de plus de 5 minutes (rejeu).
   */
  async verifyWebhook(rawBody: string, headers: Headers): Promise<WebhookVerification> {
    const secret = await serverEnv("XAALISPAY_WEBHOOK_SECRET");
    if (!secret) return { ok: false, reason: "provider_not_configured" };

    const entete = headers.get("x-xaalispay-signature") ?? "";
    const morceaux: Record<string, string> = {};
    for (const partie of entete.split(",")) {
      const [cle, valeur] = partie.split("=");
      if (cle && valeur) morceaux[cle.trim()] = valeur.trim();
    }
    const horodatage = morceaux.t ?? "";
    const signature = morceaux.v1 ?? "";
    if (!horodatage || !signature) return { ok: false, reason: "invalid_signature" };

    const age = Math.abs(Date.now() / 1000 - Number(horodatage));
    if (!Number.isFinite(age) || age > 300) return { ok: false, reason: "invalid_signature" };

    const attendu = await hmacSha256Hex(secret, `${horodatage}.${rawBody}`);
    if (!safeEqual(attendu, signature)) return { ok: false, reason: "invalid_signature" };

    let enveloppe: { id?: string; type?: string; data?: Record<string, unknown> };
    try {
      enveloppe = JSON.parse(rawBody) as typeof enveloppe;
    } catch {
      return { ok: false, reason: "invalid_json" };
    }

    const type = String(enveloppe.type ?? "");
    const donnees = (enveloppe.data ?? {}) as Record<string, unknown>;
    const reference = String(donnees.transaction_id ?? donnees.payout_id ?? "");
    const montant = typeof donnees.amount === "number" ? donnees.amount : null;

    /**
     * Correspondance entre les événements XaalisPay et notre vocabulaire.
     * Seuls les événements qui signifient « l'argent est bien arrivé » sont
     * traités comme un paiement réussi — un `transaction.funded` seul ne
     * crédite rien (il peut encore être remboursé).
     */
    const statut: WebhookVerification["status"] =
      type === "transaction.released" || type === "payout.succeeded"
        ? "paid"
        : type === "transaction.refunded" || type === "payout.failed"
          ? "failed"
          : type === "transaction.disputed"
            ? "expired"
            : "ignored";

    return { ok: true, providerRef: reference, status: statut, amount: montant, payload: enveloppe as never };
  },

  async fetchStatus(providerRef: string) {
    try {
      const t = await requete<TransactionXaalis>(`/transactions/${providerRef}`, { method: "GET" });
      const s = String(t.status ?? "").toLowerCase();
      if (s === "released" || s === "funded") return "paid";
      if (s === "refunded" || s === "failed") return "failed";
      if (s === "disputed") return "expired";
      return "pending";
    } catch {
      return "unknown";
    }
  },
};
