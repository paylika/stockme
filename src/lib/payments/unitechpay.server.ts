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
 * UnitechPay — Wave et Orange Money (Sénégal + CI, TG, BF, BJ).
 * Doc : https://pay.unitech.sn/documentation/
 *
 * La clé API sert AUSSI de secret de signature des webhooks : elle ne doit
 * jamais quitter le serveur.
 */

const API_URL = "https://api.unitech.sn/api.php";

async function request<T>(action: string, body: Record<string, unknown> = {}, method: "GET" | "POST" = "POST"): Promise<T> {
  const key = await serverEnv("UNITECH_API_KEY");
  if (!key) throw new Error("UnitechPay non configuré (UNITECH_API_KEY manquante).");

  const res = await fetch(method === "GET" ? `${API_URL}?action=${action}` : `${API_URL}?action=${action}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: method === "POST" ? JSON.stringify(body) : undefined,
  });

  const json = (await res.json()) as { success?: boolean; message?: string; data?: T };
  if (!res.ok || json.success === false) {
    throw new Error(json.message || `UnitechPay: erreur HTTP ${res.status}`);
  }
  return (json.data ?? (json as unknown)) as T;
}

type UnitechPaymentData = {
  transaction_id?: number;
  reference?: string;
  payment_url?: string;
  qr_code?: string;
};

export const unitechPayProvider: PaymentProvider = {
  name: "unitechpay",
  label: "Wave / Orange Money",
  methods: ["wave", "orange_money"],

  async isConfigured() {
    return !!(await serverEnv("UNITECH_API_KEY"));
  },

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const action = input.method === "wave" ? "create_wave_payment" : "create_orange_om";

    const body: Record<string, unknown> = {
      amount: Math.round(input.amount),
      description: input.description,
      callback_success: input.successUrl,
      callback_cancel: input.cancelUrl,
    };
    // Wave et Orange exigent le numéro du client.
    if (input.customerNumber) body.customer_number = input.customerNumber.replace(/[^\d+]/g, "");

    const data = await request<UnitechPaymentData>(action, body);
    const url = data.payment_url || "";
    const ref = String(data.transaction_id ?? data.reference ?? "");

    if (!ref || !url) {
      throw new Error("UnitechPay n'a pas renvoyé de lien de paiement (vérifiez le numéro du client).");
    }

    return { providerRef: ref, checkoutUrl: url, qrCode: data.qr_code ?? null, raw: data };
  },

  async verifyWebhook(rawBody: string, headers: Headers): Promise<WebhookVerification> {
    const key = await serverEnv("UNITECH_API_KEY");
    if (!key) return { ok: false, reason: "provider_not_configured" };

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      return { ok: false, reason: "invalid_json" };
    }

    // Deux méthodes prévues par la doc : en-tête, ou chaîne canonique dans le
    // corps (recommandée derrière un CDN — c'est notre cas sur Cloudflare).
    const headerSig = headers.get("x-unitechpay-signature") ?? "";
    const bodySig = String(data.signature ?? "");

    const headerExpected = await hmacSha256Hex(key, rawBody);
    const canonical = [data.event ?? "", data.reference ?? "", data.amount ?? "", data.status ?? "", data.signed_at ?? ""].join("|");
    const bodyExpected = await hmacSha256Hex(key, canonical);

    const valid = (headerSig && safeEqual(headerExpected, headerSig)) || (bodySig && safeEqual(bodyExpected, bodySig));
    if (!valid) return { ok: false, reason: "invalid_signature" };

    const event = String(data.event ?? "");
    const ref = String(data.transaction_id ?? data.reference ?? "");
    const amount = typeof data.amount === "number" ? data.amount : null;

    const status: WebhookVerification["status"] =
      event === "payment_completed" ? "paid" : event === "payment_failed" ? "failed" : event === "payment_expired" ? "expired" : "ignored";

    return { ok: true, providerRef: ref, status, amount, payload: data };
  },

  async fetchStatus(providerRef: string) {
    try {
      const list = await request<{ transaction_id?: number; status?: string }[]>("transactions", {}, "GET");
      const found = (Array.isArray(list) ? list : []).find((t) => String(t.transaction_id) === String(providerRef));
      const s = (found?.status ?? "").toLowerCase();
      if (s === "completed" || s === "success") return "paid";
      if (s === "failed") return "failed";
      if (s === "expired") return "expired";
      return "pending";
    } catch {
      return "unknown";
    }
  },
};
