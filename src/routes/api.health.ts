import { createFileRoute } from "@tanstack/react-router";
import { serverEnv } from "@/lib/server-env";
import { availableProviders } from "@/lib/payments/registry.server";
import { serviceClient, STOCKME_SUPABASE_URL } from "@/lib/payments/supabase-server";

/**
 * TOUR DE CONTRÔLE DU SITE — GET /api/health
 *
 * POURQUOI CETTE ADRESSE EXISTE : pour savoir qu'un problème existe AVANT que
 * les utilisateurs ne le signalent. Sans cela, on découvre les pannes par des
 * messages agacés, souvent des heures après — et c'est exactement ce qui donne
 * l'impression que « ça casse toutes les minutes ».
 *
 * DEUX NIVEAUX, POUR POUVOIR LA CONFIER À UN ROBOT DE SURVEILLANCE :
 *
 *   • Sans paramètre (public, aucune donnée sensible) :
 *       GET /api/health
 *       → { status: "ok", base: { ok: true, ms: 120 }, version: "e3037df" }
 *     C'est cette adresse qu'on donne à un service de surveillance gratuit
 *     (UptimeRobot, Better Stack…) qui prévient dès que le site ne répond plus.
 *
 *   • Avec la clé de tâche (détail complet, réservé à l'exploitant) :
 *       GET /api/health?key=VOTRE_JOB_SECRET
 *     → en plus : volumes qui grossissent, moyens de paiement configurés,
 *       latence de la base et du stockage, variables manquantes.
 */

/** Mesure une opération et renvoie { ok, ms } sans jamais lever d'erreur. */
async function timed(run: () => Promise<unknown>): Promise<{ ok: boolean; ms: number; error?: string }> {
  const start = Date.now();
  try {
    await run();
    return { ok: true, ms: Date.now() - start };
  } catch (err) {
    return { ok: false, ms: Date.now() - start, error: err instanceof Error ? err.message : "erreur" };
  }
}

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const jobSecret = await serverEnv("JOB_SECRET");
        const serviceKey = await serverEnv("SUPABASE_SERVICE_ROLE_KEY");
        const givenKey = url.searchParams.get("key") ?? "";
        const detailed = !!jobSecret && !!givenKey && givenKey === jobSecret;

        /* Version déployée : utile pour savoir quel code tourne réellement. */
        const version =
          (await serverEnv("WORKERS_CI_COMMIT_SHA")) ??
          (await serverEnv("CF_PAGES_COMMIT_SHA")) ??
          (await serverEnv("GIT_COMMIT_SHA")) ??
          null;

        /* ---- 1) La base de données répond-elle ? ---- */
        const base = await timed(async () => {
          const res = await fetch(`${STOCKME_SUPABASE_URL}/rest/v1/products?select=id&limit=1`, {
            headers: { apikey: serviceKey ?? "", Authorization: `Bearer ${serviceKey ?? ""}` },
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
        });

        /* ---- 2) L'API du stockage photos répond-elle ? ---- */
        const stockage = await timed(async () => {
          const res = await fetch(`${STOCKME_SUPABASE_URL}/storage/v1/bucket`, {
            headers: { apikey: serviceKey ?? "", Authorization: `Bearer ${serviceKey ?? ""}` },
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
        });

        /* ---- 3) Les paiements sont-ils utilisables ? ---- */
        let paiement = { ok: false, moyens: [] as string[], non_configures: [] as string[] };
        try {
          const providers = await availableProviders();
          paiement = {
            ok: providers.some((p) => p.configured),
            moyens: providers.filter((p) => p.configured).flatMap((p) => p.methods),
            non_configures: providers.filter((p) => !p.configured).map((p) => p.label),
          };
        } catch {
          /* rapporté tel quel : paiement indisponible */
        }

        /* ---- 4) Ce qui s'use avec le trafic (détail réservé) ---- */
        let volumes: Record<string, number | null> | null = null;
        if (detailed && serviceKey) {
          const service = serviceClient(serviceKey);
          const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
          const [produits, evenements, evenements24h] = await Promise.all([
            service.from("products").select("*", { count: "exact", head: true }).eq("published", true),
            service.from("product_events").select("*", { count: "exact", head: true }),
            service.from("product_events").select("*", { count: "exact", head: true }).gte("created_at", since),
          ]);
          volumes = {
            produits_publies: produits.count ?? null,
            evenements_total: evenements.count ?? null,
            evenements_24h: evenements24h.count ?? null,
          };
        }

        /* ---- 4) LA BASE CONTIENT-ELLE TOUT CE QUE LE CODE ATTEND ? ----
           C'est la panne la plus fréquente après un déploiement : le code part
           en production alors que le SQL n'a pas encore été collé dans Supabase.
           On interroge donc chaque fonction attendue : « fonction inconnue »
           veut dire qu'il manque du SQL ; toute autre réponse (droits, session,
           argument) prouve que la fonction est bien là.                     */
        let fonctions: { attendues: number; manquantes: string[] } | null = null;
        if (detailed && serviceKey) {
          const service = serviceClient(serviceKey);
          const essais: [string, Record<string, unknown>][] = [
            ["seller_dashboard", {}],
            ["get_public_seller", { p_seller_id: "00000000-0000-0000-0000-000000000000" }],
            ["get_verified_sellers", {}],
            ["get_seller_stats", { p_seller_id: "00000000-0000-0000-0000-000000000000" }],
            ["get_similar_products", { p_product_id: "00000000-0000-0000-0000-000000000000", p_limit: 1 }],
            ["wallet_overview", {}],
            ["log_product_event", { p_product_id: "00000000-0000-0000-0000-000000000000", p_event: "view" }],
            ["admin_revenue_breakdown", {}],
            ["admin_list_users", {}],
            ["admin_payments_detail", {}],
          ];
          const manquantes: string[] = [];
          await Promise.all(
            essais.map(async ([nom, args]) => {
              try {
                const { error } = await service.rpc(nom as never, args as never);
                const message = `${error?.code ?? ""} ${error?.message ?? ""}`.toLowerCase();
                if (message.includes("pgrst202") || message.includes("could not find the function")) {
                  manquantes.push(nom);
                }
              } catch (err) {
                const message = (err instanceof Error ? err.message : "").toLowerCase();
                if (message.includes("could not find the function")) manquantes.push(nom);
              }
            }),
          );
          fonctions = { attendues: essais.length, manquantes };
        }

        const down = !base.ok;
        const degraded = down || !stockage.ok || !paiement.ok;
        const sqlManquant = (fonctions?.manquantes.length ?? 0) > 0;

        const publicPart = {
          status: down ? "down" : degraded || sqlManquant ? "degraded" : "ok",
          time: new Date().toISOString(),
          version,
          base: { ok: base.ok, ms: base.ms },
          stockage: { ok: stockage.ok, ms: stockage.ms },
        };

        if (!detailed) {
          return Response.json(publicPart, { status: down ? 503 : 200 });
        }

        return Response.json(
          {
            ...publicPart,
            paiement,
            volumes,
            fonctions,
            avertissement: sqlManquant
              ? "Du SQL n'a pas encore été collé dans Supabase : des fonctions attendues par le code sont absentes."
              : null,
            variables: {
              SUPABASE_SERVICE_ROLE_KEY: !!serviceKey,
              JOB_SECRET: !!jobSecret,
              STRIPE_SECRET_KEY: !!(await serverEnv("STRIPE_SECRET_KEY")),
              UNITECH_API_KEY: !!(await serverEnv("UNITECH_API_KEY")),
            },
            erreurs: { base: base.error ?? null, stockage: stockage.error ?? null },
          },
          { status: down ? 503 : 200 },
        );
      },
    },
  },
});
