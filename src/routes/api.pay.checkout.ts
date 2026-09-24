import { createFileRoute } from "@tanstack/react-router";
import { availableProviders, resolveProvider } from "@/lib/payments/registry.server";
import { userClient } from "@/lib/payments/supabase-server";
import type { PaymentMethod } from "@/lib/payments/types";

/**
 * Point d'entrée unique du paiement (portefeuille, boost, abonnement).
 *
 * Le fournisseur (UnitechPay, Stripe…) est choisi ici, pas dans l'interface :
 * ajouter un prestataire ne touche donc jamais le code du vendeur.
 *
 * POST /api/pay/checkout
 *   { purpose: 'wallet_topup'|'boost'|'subscription', amount, method,
 *     provider?, customerNumber?, metadata? }
 *   Authorization: Bearer <jeton de session>
 */
export const Route = createFileRoute("/api/pay/checkout")({
  server: {
    handlers: {
      // Quels moyens de paiement sont disponibles aujourd'hui ?
      GET: async () => {
        const providers = await availableProviders();
        const methods: PaymentMethod[] = [];
        for (const p of providers) {
          if (!p.configured) continue;
          for (const m of p.methods) if (!methods.includes(m)) methods.push(m);
        }
        return Response.json({
          providers: providers.map((p) => ({ name: p.name, label: p.label, methods: p.methods, configured: p.configured })),
          methods,
        });
      },

      POST: async ({ request }) => {
        try {
          const auth = request.headers.get("authorization") ?? "";
          const token = auth.replace(/^Bearer\s+/i, "").trim();
          if (!token) return Response.json({ error: "Session requise." }, { status: 401 });

          const body = (await request.json()) as {
            purpose?: string;
            amount?: number;
            method?: PaymentMethod;
            provider?: string;
            customerNumber?: string | null;
            metadata?: Record<string, unknown>;
          };

          const purpose = body.purpose ?? "";
          const amount = Number(body.amount ?? 0);
          const method = (body.method ?? "wave") as PaymentMethod;

          if (!["wallet_topup", "boost", "subscription"].includes(purpose)) {
            return Response.json({ error: "Objet de paiement invalide." }, { status: 400 });
          }
          if (!Number.isFinite(amount) || amount < 100) {
            return Response.json({ error: "Montant minimum : 100 FCFA." }, { status: 400 });
          }

          const provider = await resolveProvider(body.provider, method);

          const supabase = userClient(token);
          const { data: userData, error: userError } = await supabase.auth.getUser();
          if (userError || !userData.user) {
            return Response.json({ error: "Session expirée, reconnectez-vous." }, { status: 401 });
          }

          // 1) Intention de paiement (tracée en base, avec sa propre référence)
          const { data: intent, error: intentError } = await supabase.rpc("payment_create_intent", {
            p_purpose: purpose,
            p_amount: Math.round(amount),
            p_provider: provider.name,
            p_method: method,
            p_metadata: body.metadata ?? {},
          });
          if (intentError) return Response.json({ error: intentError.message }, { status: 400 });

          const intentId = (intent as { intent_id?: string } | null)?.intent_id;
          if (!intentId) return Response.json({ error: "Intention de paiement non créée." }, { status: 500 });

          // 2) Session de paiement chez le fournisseur
          const origin = new URL(request.url).origin;
          const created = await provider.createPayment({
            amount: Math.round(amount),
            method,
            customerNumber: body.customerNumber ?? null,
            description: `StockMe — ${purpose === "wallet_topup" ? "rechargement du solde" : purpose === "boost" ? "mise en avant" : "abonnement vérifié"}`,
            intentId,
            successUrl: `${origin}/paiement/retour?intent=${intentId}&status=ok`,
            cancelUrl: `${origin}/paiement/retour?intent=${intentId}&status=cancel`,
            customerEmail: userData.user.email ?? null,
          });

          // 3) On garde la référence du fournisseur pour que le webhook retrouve la commande
          await supabase.rpc("payment_attach_checkout", {
            p_intent_id: intentId,
            p_provider_ref: created.providerRef,
            p_checkout_url: created.checkoutUrl,
          });

          return Response.json({
            intent_id: intentId,
            provider: provider.name,
            provider_label: provider.label,
            checkout_url: created.checkoutUrl,
            qr_code: created.qrCode ?? null,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Paiement impossible.";
          return Response.json({ error: message }, { status: 400 });
        }
      },
    },
  },
});
