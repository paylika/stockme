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

        /* ---- 5) COMPTEUR DE VITESSE DE LA BASE (mesuré depuis le bord) ----
           On chronomètre les requêtes que les pages utilisent vraiment. C'est le
           seul indicateur comparable dans le temps : il ne dépend ni du réseau du
           visiteur, ni du téléphone, ni du cache. Si ces durées montent au fil
           des mois, c'est que la base ralentit (données qui grossissent, index
           manquant) — et on le voit AVANT que les utilisateurs ne le sentent. */
        let vitesse: { requete: string; ms: number; ok: boolean }[] | null = null;
        if (detailed && serviceKey) {
          const entetes = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" };
          const chrono = async (nom: string, url: string, init?: RequestInit) => {
            const t0 = Date.now();
            try {
              const ctrl = new AbortController();
              const timer = setTimeout(() => ctrl.abort(), 8000);
              const res = await fetch(url, { ...init, headers: entetes, signal: ctrl.signal });
              clearTimeout(timer);
              return { requete: nom, ms: Date.now() - t0, ok: res.ok };
            } catch {
              return { requete: nom, ms: Date.now() - t0, ok: false };
            }
          };

          let produitId = "";
          let vendeurId = "";
          try {
            const res = await fetch(`${STOCKME_SUPABASE_URL}/rest/v1/products?select=id,owner_id&published=eq.true&limit=1`, {
              headers: entetes,
            });
            const rows = (await res.json()) as { id: string; owner_id: string }[];
            produitId = rows?.[0]?.id ?? "";
            vendeurId = rows?.[0]?.owner_id ?? "";
          } catch {
            /* les sondes dépendantes du produit seront ignorées */
          }

          const depuis30j = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
          const base = `${STOCKME_SUPABASE_URL}/rest/v1`;
          const sondes: Promise<{ requete: string; ms: number; ok: boolean }>[] = [
            chrono("accueil : 60 produits récents", `${base}/products?select=id,name,price_fcfa,images&published=eq.true&order=created_at.desc&limit=60`),
            chrono("vendeurs vérifiés", `${base}/rpc/get_verified_sellers`, { method: "POST", body: "{}" }),
          ];
          if (produitId) {
            sondes.push(
              chrono("fiche produit", `${base}/products?select=*&id=eq.${produitId}`),
              chrono("favoris du produit", `${base}/favorites?select=id&product_id=eq.${produitId}`),
              chrono("vues 30 jours du produit", `${base}/product_events?select=id&product_id=eq.${produitId}&created_at=gte.${depuis30j}`),
            );
          }
          if (vendeurId) {
            sondes.push(
              chrono("statistiques vendeur", `${base}/rpc/get_seller_stats`, {
                method: "POST",
                body: JSON.stringify({ p_seller_id: vendeurId }),
              }),
            );
          }
          vitesse = await Promise.all(sondes);
        }

        /* ---- 6) CONSOMMATION DE BANDE PASSANTE ----
           L'hébergeur a coupé le service pour un quota de données dépassé :
           l'objectif est de VOIR le compteur monter, au lieu de découvrir la
           coupure quand tout est déjà bloqué.
           Nécessite un jeton personnel Supabase (SUPABASE_ACCESS_TOKEN, gratuit
           à créer dans le tableau de bord). Sans ce jeton, on l'indique
           simplement — jamais d'erreur pour l'exploitant. */
        let bandePassante: unknown = null;
        if (detailed) {
          const jeton = await serverEnv("SUPABASE_ACCESS_TOKEN");
          if (!jeton) {
            bandePassante = {
              configure: false,
              comment:
                "Ajoutez la variable SUPABASE_ACCESS_TOKEN (jeton personnel Supabase, gratuit) pour suivre ici la consommation de données.",
            };
          } else {
            try {
              const ref = new URL(STOCKME_SUPABASE_URL).hostname.split(".")[0];
              const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/usage`, {
                headers: { Authorization: `Bearer ${jeton}` },
              });
              const texte = await res.text();
              const mesures: Record<string, unknown>[] = [];
              const explorer = (v: unknown, profondeur = 0) => {
                if (!v || typeof v !== "object" || profondeur > 4) return;
                if (Array.isArray(v)) {
                  v.forEach((x) => explorer(x, profondeur + 1));
                  return;
                }
                const o = v as Record<string, unknown>;
                const nom = String(o.metric ?? o.name ?? o.metric_name ?? "").toLowerCase();
                if (nom.includes("egress") || nom.includes("bandwidth")) mesures.push(o);
                Object.values(o).forEach((x) => explorer(x, profondeur + 1));
              };
              if (res.ok) {
                try {
                  explorer(JSON.parse(texte));
                } catch {
                  /* réponse inattendue : on la montre brute ci-dessous */
                }
              }
              bandePassante = {
                configure: true,
                http: res.status,
                mesures: mesures.slice(0, 4),
                lu: mesures.length > 0,
                apercu: mesures.length ? undefined : texte.slice(0, 300),
              };
            } catch (err) {
              bandePassante = { configure: true, erreur: err instanceof Error ? err.message : "erreur" };
            }
          }
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
            vitesse,
            bandePassante,
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
