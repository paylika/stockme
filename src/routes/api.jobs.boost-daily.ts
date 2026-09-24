import { createFileRoute } from "@tanstack/react-router";
import { serverEnv } from "@/lib/server-env";
import { serviceClient } from "@/lib/payments/supabase-server";

/**
 * Tâche quotidienne des boosts : déduit le budget du jour du portefeuille
 * de chaque vendeur et prolonge sa mise en avant. Si le solde est insuffisant,
 * la campagne passe en pause (elle reprendra après recharge).
 *
 * Déclenchement (au choix) :
 *   • un service de cron gratuit (cron-job.org) qui appelle cette URL 1×/jour
 *     avec l'en-tête  x-job-secret: <JOB_SECRET>   ;
 *   • ou pg_cron dans Supabase (voir la note en fin de réponse).
 */
export const Route = createFileRoute("/api/jobs/boost-daily")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = await serverEnv("JOB_SECRET");
        if (!secret) return Response.json({ error: "JOB_SECRET non configuré." }, { status: 500 });

        const given = request.headers.get("x-job-secret") ?? new URL(request.url).searchParams.get("secret") ?? "";
        if (given !== secret) return Response.json({ error: "unauthorized" }, { status: 401 });

        const serviceKey = await serverEnv("SUPABASE_SERVICE_ROLE_KEY");
        if (!serviceKey) return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquante." }, { status: 500 });

        const supabase = serviceClient(serviceKey);
        const { data, error } = await supabase.rpc("boost_run_daily");
        if (error) return Response.json({ error: error.message }, { status: 500 });

        return Response.json({ ok: true, result: data });
      },

      GET: async ({ request }) => {
        // Même logique, pratique pour un cron qui n'envoie que des GET.
        const secret = await serverEnv("JOB_SECRET");
        const given = request.headers.get("x-job-secret") ?? new URL(request.url).searchParams.get("secret") ?? "";
        if (!secret || given !== secret) return Response.json({ error: "unauthorized" }, { status: 401 });

        const serviceKey = await serverEnv("SUPABASE_SERVICE_ROLE_KEY");
        if (!serviceKey) return Response.json({ error: "config" }, { status: 500 });

        const supabase = serviceClient(serviceKey);
        const { data, error } = await supabase.rpc("boost_run_daily");
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ ok: true, result: data });
      },
    },
  },
});
