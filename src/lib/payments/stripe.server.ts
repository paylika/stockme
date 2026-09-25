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
 * Stripe — paiement par carte (Visa / Mastercard, cartes prépayées incluses).
 *
 * Deux atouts par rapport au mobile money :
 *   • la carte est enregistrée → ABONNEMENT MENSUEL AUTOMATIQUE ;
 *   • large couverture internationale.
 *
 * La devise est détectée automatiquement sur le compte Stripe
 * (`/v1/account` → default_currency) : inutile de la configurer à la main.
 * La parité FCFA ↔ EUR est FIXE (1 EUR = 655,957 XOF), la conversion est donc
 * exacte et non approximative.
 */

const API = "https://api.stripe.com/v1";
const XOF_PER_EUR = 655.957;

/** Devises sans décimales (le montant est déjà l'unité entière). */
const ZERO_DECIMAL_CURRENCIES = ["xof", "xaf", "jpy", "krw", "vnd", "clp", "gnf", "pyg", "rwf", "ugx", "vuv", "xpf"];

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

async function stripeFetch<T>(path: string, init?: RequestInit & { form?: Record<string, unknown> }): Promise<T> {
  const key = await serverEnv("STRIPE_SECRET_KEY");
  if (!key) throw new Error("Stripe non configuré (STRIPE_SECRET_KEY manquante).");

  const { form, ...rest } = init ?? {};
  const res = await fetch(`${API}${path}`, {
    ...rest,
    method: rest.method ?? (form ? "POST" : "GET"),
    headers: {
      Authorization: `Bearer ${key}`,
      ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...(rest.headers ?? {}),
    },
    body: form ? formEncode(form) : rest.body,
  });

  const json = (await res.json()) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(json.error?.message ?? `Stripe: erreur HTTP ${res.status}`);
  return json;
}

export type StripeAccountInfo = {
  id: string;
  country: string | null;
  default_currency: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  livemode?: boolean;
};

/** Informations du compte (utilisées pour le diagnostic et la devise). */
export async function stripeAccount(): Promise<StripeAccountInfo> {
  return stripeFetch<StripeAccountInfo>("/account");
}

let cachedCurrency: { value: string; at: number } | null = null;

/** Devise d'encaissement détectée sur le compte (cache 10 minutes). */
async function accountCurrency(): Promise<string> {
  const forced = await serverEnv("STRIPE_CURRENCY");
  if (forced) return forced.toLowerCase();

  if (cachedCurrency && Date.now() - cachedCurrency.at < 10 * 60 * 1000) return cachedCurrency.value;

  try {
    const acc = await stripeAccount();
    const cur = (acc.default_currency ?? "eur").toLowerCase();
    cachedCurrency = { value: cur, at: Date.now() };
    return cur;
  } catch {
    return "eur";
  }
}

/** Convertit un montant en FCFA vers la devise du compte Stripe. */
async function toStripeAmount(amountFcfa: number): Promise<{ currency: string; amount: number }> {
  const currency = await accountCurrency();
  const zeroDecimal = ZERO_DECIMAL_CURRENCIES.includes(currency);

  if (zeroDecimal) return { currency, amount: Math.round(amountFcfa) };

  if (currency === "eur") return { currency, amount: Math.round(amountFcfa / XOF_PER_EUR * 100) / 100 };

  // Autre devise : taux fourni par l'exploitant (unités de devise pour 1 FCFA).
  const rate = Number((await serverEnv("STRIPE_FCFA_RATE")) ?? 0);
  if (rate > 0) return { currency, amount: Math.round(amountFcfa * rate * 100) / 100 };

  // Repli : on passe par l'euro (parité fixe) pour ne jamais bloquer un paiement.
  return { currency: "eur", amount: Math.round(amountFcfa / XOF_PER_EUR * 100) / 100 };
}

/**
 * CONVERSION INVERSE — indispensable au moment du webhook.
 *
 * Stripe renvoie le montant dans la plus petite unité de sa devise
 * (152 = 1,52 €). Si on l'envoyait tel quel, on comparerait « 2 » à
 * « 1 000 FCFA » et le crédit serait refusé : c'est exactement le bug qui a
 * empêché le solde de se mettre à jour. On reconvertit donc en FCFA.
 */
async function fromStripeAmount(minorAmount: number, currency: string): Promise<number> {
  const cur = (currency ?? "eur").toLowerCase();
  const major = ZERO_DECIMAL_CURRENCIES.includes(cur) ? minorAmount : minorAmount / 100;

  if (cur === "xof" || cur === "xaf") return Math.round(major);
  if (cur === "eur") return Math.round(major * XOF_PER_EUR);

  const rate = Number((await serverEnv("STRIPE_FCFA_RATE")) ?? 0);
  if (rate > 0) return Math.round(major / rate);
  return Math.round(major * XOF_PER_EUR); // repli : parité euro
}

/** État d'une session de paiement, pour la réconciliation. */
export async function stripeCheckoutStatus(
  sessionId: string,
): Promise<{ paid: boolean; amountFcfa: number; raw: unknown }> {
  const session = await stripeFetch<{
    id: string;
    payment_status?: string;
    status?: string;
    amount_total?: number;
    currency?: string;
  }>(`/checkout/sessions/${sessionId}`);

  const paid = session.payment_status === "paid" || session.status === "complete";
  const amountFcfa = session.amount_total ? await fromStripeAmount(session.amount_total, session.currency ?? "eur") : 0;
  return { paid, amountFcfa, raw: session };
}

export const stripeProvider: PaymentProvider = {
  name: "stripe",
  label: "Carte bancaire (Visa / Mastercard)",
  methods: ["card"],

  async isConfigured() {
    return !!(await serverEnv("STRIPE_SECRET_KEY"));
  },

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const { currency, amount } = await toStripeAmount(input.amount);
    const zeroDecimal = ["xof", "xaf", "jpy", "krw", "vnd", "clp", "gnf"].includes(currency);
    const unitAmount = Math.max(zeroDecimal ? 100 : 50, Math.round(zeroDecimal ? amount : amount * 100));

    const recurring = input.recurring === "month";

    const body: Record<string, unknown> = {
      mode: recurring ? "subscription" : "payment",
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      client_reference_id: input.intentId,
      metadata: { intent_id: input.intentId },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: unitAmount,
            product_data: { name: input.description },
            ...(recurring ? { recurring: { interval: "month" } } : {}),
          },
        },
      ],
    };

    // La carte étant enregistrée, on garde le client pour les échéances suivantes.
    if (input.customerEmail) body.customer_email = input.customerEmail;
    if (recurring) {
      body.subscription_data = { metadata: { intent_id: input.intentId } };
    }

    const session = await stripeFetch<{ id: string; url?: string; subscription?: string }>("/checkout/sessions", {
      form: body,
    });

    if (!session.id) throw new Error("Stripe n'a pas renvoyé de session de paiement.");
    if (!session.url) throw new Error("Stripe n'a pas renvoyé d'URL de paiement.");

    return { providerRef: session.id, checkoutUrl: session.url, raw: session };
  },

  async verifyWebhook(rawBody: string, headers: Headers): Promise<WebhookVerification> {
    const secret = await serverEnv("STRIPE_WEBHOOK_SECRET");
    if (!secret) return { ok: false, reason: "provider_not_configured" };

    // En-tête Stripe : « t=1716542100,v1=signature »
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

    const age = Math.abs(Date.now() / 1000 - Number(parts.t));
    if (!Number.isFinite(age) || age > 300) return { ok: false, reason: "timestamp_out_of_tolerance" };

    type StripeEvent = {
      type?: string;
      data?: {
        object?: {
          id?: string;
          amount_total?: number;
          amount_paid?: number;
          currency?: string;
          payment_status?: string;
          client_reference_id?: string;
          subscription?: string;
          metadata?: Record<string, string>;
        };
      };
    };

    let event: StripeEvent;
    try {
      event = JSON.parse(rawBody) as StripeEvent;
    } catch {
      return { ok: false, reason: "invalid_json" };
    }

    const obj = event.data?.object;
    const type = event.type ?? "";

    // ---- Échéance mensuelle d'un abonnement (renouvellement carte) ----
    if (type === "invoice.paid" || type === "invoice.payment_succeeded") {
      const subscriptionRef = typeof obj?.subscription === "string" ? obj.subscription : null;
      const amountFcfa =
        obj?.amount_paid != null ? await fromStripeAmount(obj.amount_paid, obj?.currency ?? "eur") : null;
      return {
        ok: true,
        status: "paid",
        kind: "subscription_invoice",
        subscriptionRef,
        providerRef: `invoice_${obj?.id ?? ""}`,
        amount: amountFcfa,
        payload: event,
      };
    }

    if (type === "invoice.payment_failed") {
      return { ok: true, status: "failed", kind: "subscription_invoice", payload: event, reason: "invoice_failed" };
    }

    // ---- Paiement unique ou première échéance d'un abonnement ----
    if (type === "checkout.session.completed" || type === "payment_intent.succeeded") {
      const isSubscription = typeof obj?.subscription === "string" && obj.subscription.length > 0;
      const amountFcfa =
        obj?.amount_total != null ? await fromStripeAmount(obj.amount_total, obj?.currency ?? "eur") : null;
      return {
        ok: true,
        status: "paid",
        kind: "payment",
        // Référence EXACTE telle qu'enregistrée à la création (id de session).
        providerRef: String(obj?.id ?? ""),
        subscriptionRef: isSubscription ? (obj?.subscription as string) : null,
        amount: amountFcfa,
        payload: event,
      };
    }

    if (type === "checkout.session.expired") {
      return { ok: true, status: "expired", kind: "payment", providerRef: String(obj?.id ?? ""), payload: event };
    }

    return { ok: true, status: "ignored", payload: event };
  },
};
