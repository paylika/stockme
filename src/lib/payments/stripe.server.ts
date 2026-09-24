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
 * Stripe — paiement par carte (Visa / Mastercard, y compris cartes prépayées).
 *
 * ⚠️ IMPORTANT : Stripe n'ouvre pas de compte marchand au Sénégal.
 * Ce fournisseur s'active donc automatiquement dès que `STRIPE_SECRET_KEY`
 * est présent — c'est-à-dire quand une entité dans un pays supporté
 * (Stripe Atlas / société UE) sera disponible. Aucun code à réécrire.
 *
 * Avantage par rapport au mobile money : la carte peut être enregistrée
 * (card-on-file) → véritable abonnement mensuel automatique.
 */

const API = "https://api.stripe.com/v1";

const formEncode = (obj: Record<string, unknown>): string => {
  const parts: string[] = [];
  const walk = (prefix: string, value: unknown) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((v, i) => walk(`${prefix}[${i}]`, v));
      return;
    }
    if (typeof value === "object") {
      Object.entries(value as Record<string, unknown>).forEach(([k, v]) => walk(`${prefix}[${k}]`, v));
      return;
    }
    parts.push(`${encodeURIComponent(prefix)}=${encodeURIComponent(String(value))}`);
  };
  Object.entries(obj).forEach(([k, v]) => walk(k, v));
  return parts.join("&");
};

type StripeSession = { id: string; url?: string };

export const stripeProvider: PaymentProvider = {
  name: "stripe",
  label: "Carte bancaire (Visa / Mastercard)",
  methods: ["card"],

  async isConfigured() {
    return !!(await serverEnv("STRIPE_SECRET_KEY"));
  },

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const key = await serverEnv("STRIPE_SECRET_KEY");
    if (!key) throw new Error("Stripe non configuré (STRIPE_SECRET_KEY manquante).");

    // Stripe exige un montant en centimes, dans une devise supportée par la
    // carte de l'acheteur. On encaisse en EUR (converti) ou en XOF si le
    // compte le permet : XOF_STRIPE_CURRENCY permet de choisir.
    const currency = (await serverEnv("STRIPE_CURRENCY")) ?? "eur";
    const isZeroDecimal = currency.toLowerCase() === "xof";
    const unitAmount = isZeroDecimal ? Math.round(input.amount) : Math.round(input.amount / 655.957);

    const body = formEncode({
      mode: "payment",
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      client_reference_id: input.intentId,
      customer_email: input.customerEmail ?? undefined,
      metadata: { intent_id: input.intentId },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: Math.max(50, unitAmount), // minimum Stripe
            product_data: { name: input.description },
          },
        },
      ],
    });

    const res = await fetch(`${API}/checkout/sessions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    const json = (await res.json()) as StripeSession & { error?: { message?: string } };
    if (!res.ok || !json.id) throw new Error(json.error?.message ?? `Stripe: erreur HTTP ${res.status}`);

    return { providerRef: json.id, checkoutUrl: json.url ?? "", raw: json };
  },

  async verifyWebhook(rawBody: string, headers: Headers): Promise<WebhookVerification> {
    const secret = await serverEnv("STRIPE_WEBHOOK_SECRET");
    if (!secret) return { ok: false, reason: "provider_not_configured" };

    // En-tête Stripe : « t=1234567890,v1=signature »
    const header = headers.get("stripe-signature") ?? "";
    const parts = Object.fromEntries(
      header.split(",").map((p) => {
        const [k, v] = p.split("=");
        return [k?.trim(), v?.trim()];
      }),
    ) as Record<string, string>;

    if (!parts.t || !parts.v1) return { ok: false, reason: "missing_signature" };

    const expected = await hmacSha256Hex(secret, `${parts.t}.${rawBody}`);
    if (!safeEqual(expected, parts.v1)) return { ok: false, reason: "invalid_signature" };

    // Tolérance de 5 minutes contre le rejeu.
    const age = Math.abs(Date.now() / 1000 - Number(parts.t));
    if (!Number.isFinite(age) || age > 300) return { ok: false, reason: "timestamp_out_of_tolerance" };

    const event = JSON.parse(rawBody) as {
      type?: string;
      data?: { object?: { id?: string; amount_total?: number; payment_status?: string; metadata?: Record<string, string> } };
    };

    const obj = event.data?.object;
    const type = event.type ?? "";
    const ref = obj?.metadata?.intent_id ? `cs_${obj?.id}` : String(obj?.id ?? "");

    const status: WebhookVerification["status"] =
      type === "checkout.session.completed" || type === "payment_intent.succeeded"
        ? "paid"
        : type === "checkout.session.expired"
        ? "expired"
        : type === "payment_intent.payment_failed"
        ? "failed"
        : "ignored";

    return { ok: true, providerRef: ref, status, amount: obj?.amount_total ?? null, payload: event };
  },
};
