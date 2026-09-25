import { createFileRoute } from "@tanstack/react-router";
import { serverEnv } from "@/lib/server-env";
import { stripeAccount } from "@/lib/payments/stripe.server";
import { serviceClient } from "@/lib/payments/supabase-server";

/**
 * Diagnostic complet de l'installation des paiements.
 *
 * Deux façons d'y accéder :
 *   • connecté comme administrateur :
 *       GET /api/pay/stripe-check     (en-tête Authorization: Bearer <jeton>)
 *   • OU avec le secret de tâche planifiée, directement depuis le navigateur :
 *       GET /api/pay/stripe-check?key=TON_JOB_SECRET
 *
 * Aucun secret n'est jamais renvoyé : uniquement des booléens et les
 * informations publiques du compte Stripe.
 */
export const Route = createFileRoute("/api/pay/stripe-check")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const jobSecret = await serverEnv("JOB_SECRET");
        const givenKey = url.searchParams.get("key") ?? "";
        const serviceKey = await serverEnv("SUPABASE_SERVICE_ROLE_KEY");

        /* ---------- Autorisation ---------- */
        let authorized = false;
        let authorizationMode: "session_admin" | "job_key" | null = null;

        if (jobSecret && givenKey && givenKey === jobSecret) {
          authorized = true;
          authorizationMode = "job_key";
        } else {
          const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
          if (token && serviceKey) {
            const service = serviceClient(serviceKey);
            const { data: userData } = await service.auth.getUser(token);
            const userId = userData?.user?.id;
            if (userId) {
              const { data: role } = await service
                .from("user_roles")
                .select("role")
                .eq("user_id", userId)
                .eq("role", "admin")
                .maybeSingle();
              if (role) {
                authorized = true;
                authorizationMode = "session_admin";
              }
            }
          }
        }

        if (!authorized) {
          return Response.json(
            {
              error: "Accès refusé.",
              how_to: "Connectez-vous comme administrateur, ou ajoutez ?key=VOTRE_JOB_SECRET à l'URL.",
            },
            { status: 401 },
          );
        }

        /* ---------- Contrôle de la clé de service ---------- */
        let serviceRoleWorks = false;
        let serviceRoleError: string | null = null;
        if (!serviceKey) {
          serviceRoleError = "SUPABASE_SERVICE_ROLE_KEY absente";
        } else {
          const service = serviceClient(serviceKey);
          const { error } = await service.from("user_roles").select("user_id").limit(1);
          if (error) serviceRoleError = error.message;
          else serviceRoleWorks = true;
        }

        /* ---------- Contrôle de Stripe ---------- */
        const secretKey = await serverEnv("STRIPE_SECRET_KEY");
        const webhookSecret = await serverEnv("STRIPE_WEBHOOK_SECRET");
        const forcedCurrency = await serverEnv("STRIPE_CURRENCY");
        const origin = url.origin;

        const report: Record<string, unknown> = {
          authorization: authorizationMode,
          secrets: {
            STRIPE_SECRET_KEY: !!secretKey,
            STRIPE_WEBHOOK_SECRET: !!webhookSecret,
            STRIPE_CURRENCY: forcedCurrency ?? null,
            SUPABASE_SERVICE_ROLE_KEY: !!serviceKey,
            JOB_SECRET: !!jobSecret,
            UNITECH_API_KEY: !!(await serverEnv("UNITECH_API_KEY")),
          },
          service_role: { works: serviceRoleWorks, error: serviceRoleError },
          webhook_urls: {
            stripe: `${origin}/api/pay/webhook/stripe`,
            unitechpay: `${origin}/api/pay/webhook/unitechpay`,
            boost_daily_job: `${origin}/api/jobs/boost-daily?secret=<JOB_SECRET>`,
          },
        };

        if (!secretKey) {
          report.stripe = { configured: false, hint: "Ajoutez STRIPE_SECRET_KEY dans les variables du Worker." };
          report.ready = false;
          return Response.json(report);
        }

        try {
          const account = await stripeAccount();
          report.stripe = {
            configured: true,
            mode: secretKey.startsWith("sk_live_") ? "live" : "test",
            account: {
              id: account.id,
              country: account.country,
              currency: account.default_currency,
              charges_enabled: account.charges_enabled,
              payouts_enabled: account.payouts_enabled,
            },
            webhook_secret_set: !!webhookSecret,
          };
          report.ready = account.charges_enabled && !!webhookSecret && serviceRoleWorks;
          report.checklist = {
            cle_stripe_valide: true,
            encaissement_actif: account.charges_enabled,
            virements_actifs: account.payouts_enabled,
            secret_webhook: webhookSecret ? "présent" : "MANQUANT",
            cle_de_service: serviceRoleWorks ? "fonctionne" : `PROBLEME : ${serviceRoleError}`,
          };
        } catch (err) {
          report.stripe = { configured: true, error: err instanceof Error ? err.message : "Erreur Stripe" };
          report.ready = false;
        }

        return Response.json(report);
      },
    },
  },
});
