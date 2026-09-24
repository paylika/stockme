import { createFileRoute } from "@tanstack/react-router";
import { serverEnv } from "@/lib/server-env";
import { stripeAccount } from "@/lib/payments/stripe.server";

/**
 * Diagnostic Stripe — réservé aux administrateurs.
 *
 * Vérifie en 1 appel que l'encaissement par carte est réellement opérationnel :
 * compte, pays, devise, capacités d'encaissement et de virement, présence du
 * secret de webhook. Utile après avoir ajouté les clés dans Cloudflare.
 *
 * GET /api/pay/stripe-check
 *   Authorization: Bearer <jeton de session d'un administrateur>
 */
export const Route = createFileRoute("/api/pay/stripe-check")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.replace(/^Bearer\s+/i, "").trim();
        if (!token) return Response.json({ error: "Session requise." }, { status: 401 });

        // Contrôle du rôle admin côté serveur.
        const { serviceClient } = await import("@/lib/payments/supabase-server");
        const serviceKey = await serverEnv("SUPABASE_SERVICE_ROLE_KEY");
        if (!serviceKey) {
          return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquante." }, { status: 500 });
        }

        const service = serviceClient(serviceKey);
        const { data: userData } = await service.auth.getUser(token);
        const userId = userData?.user?.id;
        if (!userId) return Response.json({ error: "Session invalide." }, { status: 401 });

        const { data: role } = await service
          .from("user_roles")
          .select("role")
          .eq("user_id", userId)
          .eq("role", "admin")
          .maybeSingle();
        if (!role) return Response.json({ error: "Accès réservé aux administrateurs." }, { status: 403 });

        const secretKey = await serverEnv("STRIPE_SECRET_KEY");
        const webhookSecret = await serverEnv("STRIPE_WEBHOOK_SECRET");
        const forcedCurrency = await serverEnv("STRIPE_CURRENCY");

        if (!secretKey) {
          return Response.json({
            configured: false,
            hint: "Ajoutez STRIPE_SECRET_KEY (et STRIPE_WEBHOOK_SECRET) dans Cloudflare → Settings → Variables and Secrets.",
          });
        }

        try {
          const account = await stripeAccount();
          return Response.json({
            configured: true,
            mode: secretKey.startsWith("sk_live_") ? "live" : "test",
            webhook_secret_set: !!webhookSecret,
            forced_currency: forcedCurrency ?? null,
            account: {
              id: account.id,
              country: account.country,
              currency: account.default_currency,
              charges_enabled: account.charges_enabled,
              payouts_enabled: account.payouts_enabled,
            },
            ready: account.charges_enabled && !!webhookSecret,
          });
        } catch (err) {
          return Response.json(
            { configured: true, error: err instanceof Error ? err.message : "Erreur Stripe" },
            { status: 400 },
          );
        }
      },
    },
  },
});
