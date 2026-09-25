import { createFileRoute } from "@tanstack/react-router";
import { serverEnv } from "@/lib/server-env";
import { serviceClient } from "@/lib/payments/supabase-server";
import { stripeCheckoutStatus } from "@/lib/payments/stripe.server";

/**
 * Réconciliation des paiements restés « en attente ».
 *
 * Utile dans deux cas :
 *   • le webhook n'a pas pu être livré (URL erronée, panne, signature) alors
 *     que le client a bien payé → on interroge le fournisseur et on crédite ;
 *   • contrôle périodique de sécurité (à brancher sur le cron quotidien).
 *
 * GET /api/pay/reconcile?key=<JOB_SECRET>
 */
export const Route = createFileRoute("/api/pay/reconcile")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const secret = await serverEnv("JOB_SECRET");
        const given = url.searchParams.get("key") ?? request.headers.get("x-job-secret") ?? "";
        if (!secret || given !== secret) {
          return Response.json({ error: "Accès refusé. Ajoutez ?key=VOTRE_JOB_SECRET." }, { status: 401 });
        }

        const serviceKey = await serverEnv("SUPABASE_SERVICE_ROLE_KEY");
        if (!serviceKey) return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquante." }, { status: 500 });

        const service = serviceClient(serviceKey);
        const { data: pending, error } = await service.rpc("pending_payment_intents", {
          p_minutes: 1,
          p_limit: 100,
        });
        if (error) return Response.json({ error: error.message }, { status: 500 });

        type PendingIntent = {
          id: string;
          purpose: string;
          amount_fcfa: number;
          provider: string;
          provider_ref: string;
          created_at: string;
        };

        const list = (pending as PendingIntent[] | null) ?? [];
        const results: { intent: string; provider: string; outcome: string; amount?: number }[] = [];
        let credited = 0;

        for (const intent of list) {
          if (intent.provider !== "stripe") {
            results.push({ intent: intent.id, provider: intent.provider, outcome: "provider_non_gere" });
            continue;
          }

          try {
            const status = await stripeCheckoutStatus(intent.provider_ref);
            if (!status.paid) {
              results.push({ intent: intent.id, provider: intent.provider, outcome: "toujours_impaye" });
              continue;
            }

            const { data: applied, error: applyError } = await service.rpc("payment_mark_paid", {
              p_provider: "stripe",
              p_provider_ref: intent.provider_ref,
              p_amount: status.amountFcfa,
              p_payload: status.raw as never,
              p_subscription_ref: null,
            });

            if (applyError) {
              results.push({ intent: intent.id, provider: intent.provider, outcome: `erreur: ${applyError.message}` });
              continue;
            }

            const res = applied as { ok?: boolean; reason?: string } | null;
            if (res?.ok) {
              credited += 1;
              results.push({
                intent: intent.id,
                provider: intent.provider,
                outcome: "credite",
                amount: status.amountFcfa,
              });
            } else {
              results.push({ intent: intent.id, provider: intent.provider, outcome: `refuse: ${res?.reason ?? "?"}` });
            }
          } catch (err) {
            results.push({
              intent: intent.id,
              provider: intent.provider,
              outcome: err instanceof Error ? err.message : "erreur inconnue",
            });
          }
        }

        return Response.json({ ok: true, checked: list.length, credited, results });
      },
    },
  },
});
