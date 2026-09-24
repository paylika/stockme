import { createFileRoute } from "@tanstack/react-router";
import { serverEnv } from "@/lib/server-env";
import { getProvider } from "@/lib/payments/registry.server";
import { serviceClient } from "@/lib/payments/supabase-server";

/**
 * Webhook de paiement — un seul point d'entrée pour TOUS les fournisseurs :
 *   POST /api/pay/webhook/unitechpay
 *   POST /api/pay/webhook/stripe
 *
 * Règles de sécurité appliquées ici :
 *   1. La signature du fournisseur est vérifiée AVANT tout traitement.
 *   2. Le montant reçu est comparé au montant attendu.
 *   3. L'écriture se fait avec la clé de service (jamais exposée au client)
 *      et la fonction SQL est idempotente : un webhook rejoué ne crédite
 *      jamais deux fois.
 */
export const Route = createFileRoute("/api/pay/webhook/$provider")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const provider = getProvider(params.provider);
        if (!provider) return Response.json({ error: "Fournisseur inconnu." }, { status: 404 });

        const rawBody = await request.text();
        const check = await provider.verifyWebhook(rawBody, request.headers);

        if (!check.ok) {
          // Signature invalide : on refuse (mais on ne dit pas pourquoi).
          return Response.json({ error: "signature_invalide" }, { status: 401 });
        }

        // Événement non pertinent (retrait, etc.) : on accuse réception.
        if (check.status === "ignored" || !check.providerRef) {
          return Response.json({ ok: true, ignored: true });
        }

        if (check.status !== "paid") {
          return Response.json({ ok: true, status: check.status });
        }

        const serviceKey = await serverEnv("SUPABASE_SERVICE_ROLE_KEY");
        if (!serviceKey) {
          console.error("[pay/webhook] SUPABASE_SERVICE_ROLE_KEY manquante : paiement non enregistré");
          return Response.json({ error: "server_not_configured" }, { status: 500 });
        }

        const supabase = serviceClient(serviceKey);

        // ---- Échéance mensuelle d'un abonnement (carte enregistrée) ----
        if (check.kind === "subscription_invoice") {
          if (!check.subscriptionRef) {
            return Response.json({ ok: true, ignored: true, reason: "no_subscription_ref" });
          }
          const { data, error } = await supabase.rpc("subscription_renew", {
            p_provider: provider.name,
            p_subscription_ref: check.subscriptionRef,
            p_amount: check.amount ?? null,
            p_payload: (check.payload ?? null) as never,
          });
          if (error) {
            console.error("[pay/webhook] subscription_renew:", error.message);
            return Response.json({ error: error.message }, { status: 500 });
          }
          return Response.json({ ok: true, renewed: data });
        }

        // ---- Paiement unique (recharge, boost, 1re échéance d'abonnement) ----
        const { data, error } = await supabase.rpc("payment_mark_paid", {
          p_provider: provider.name,
          p_provider_ref: check.providerRef,
          p_amount: check.amount ?? null,
          p_payload: (check.payload ?? null) as never,
          p_subscription_ref: check.subscriptionRef ?? null,
        });

        if (error) {
          console.error("[pay/webhook] payment_mark_paid:", error.message);
          return Response.json({ error: error.message }, { status: 500 });
        }

        return Response.json({ ok: true, applied: data });
      },

      // Certains fournisseurs testent l'URL en GET.
      GET: async ({ params }) => Response.json({ ok: true, provider: params.provider, ready: true }),
    },
  },
});
