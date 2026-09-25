import { createFileRoute } from "@tanstack/react-router";
import { serverEnv } from "@/lib/server-env";
import { serviceClient, userClient } from "@/lib/payments/supabase-server";
import { deepseekChat, parseJsonObject } from "@/lib/ai/deepseek.server";
import { logAiCall, countAiCallsToday, AI_DAILY_LIMITS } from "@/lib/ai/log.server";

/**
 * POST /api/ai/enrich
 *   { product_ids: string[] }           → le vendeur enrichit SES fiches
 *   en-tête x-job-secret: <JOB_SECRET>  → mode tâche (tout le catalogue, par lots)
 *
 * POURQUOI : une recherche par mot-clé (et plus tard par image) n'est bonne que
 * si les fiches contiennent assez de vocabulaire. Beaucoup de produits n'ont
 * qu'un nom court (« Smilekit », « Lacoste »). On demande donc à DeepSeek de
 * compléter chaque fiche avec des mots-clés qu'un acheteur taperait vraiment
 * (synonymes, matière, couleur, genre, usage) — stockés dans `products.ai_keywords`.
 *
 * Résultat : les deux recherches IA s'appuient sur ce vocabulaire, sans aucun
 * appel IA au moment de la recherche (donc gratuit et instantané à l'usage).
 */

const SYSTEM_PROMPT = `Tu enrichis un catalogue de gros (marketplace StockMe, Afrique de l'Ouest).
À partir des informations d'un produit, tu renvoies UNIQUEMENT un objet JSON, sans texte autour.

Format exact :
{
  "keywords": ["..."],
  "objet": "...",
  "genre": "homme" | "femme" | "enfant" | "mixte" | "",
  "couleurs": ["..."],
  "matieres": ["..."],
  "usage": "...",
  "synonymes": ["..."]
}

Règles des mots-clés :
- 8 à 14 mots-clés, en français, en minuscules, sans doublon.
- Inclure les mots qu'un ACHETEUR taperait réellement, pas seulement le nom du produit :
  synonymes courants (ex. baskets / sneakers / tennis / chaussures de sport),
  la catégorie, la matière, la couleur, le genre, l'usage (mariage, école, maison, revente),
  et le nom de marque s'il apparaît dans le texte fourni.
- Un mot-clé = 1 à 3 mots maximum.
- N'invente JAMAIS une information absente (pas de marque, pas de matière, pas de couleur inventée).
- Si l'information est absente, laisse la chaîne vide ou le tableau vide.`;

type EnrichPayload = {
  keywords?: unknown;
  objet?: unknown;
  genre?: unknown;
  couleurs?: unknown;
  matieres?: unknown;
  usage?: unknown;
  synonymes?: unknown;
};

const asStringArray = (v: unknown, max = 14): string[] =>
  Array.isArray(v)
    ? v
        .filter((x): x is string => typeof x === "string")
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s.length > 0 && s.length <= 40)
        .slice(0, max)
    : [];

const asString = (v: unknown): string => (typeof v === "string" ? v.trim().toLowerCase().slice(0, 40) : "");

export const Route = createFileRoute("/api/ai/enrich")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as { product_ids?: unknown };
          const ids = Array.isArray(body.product_ids)
            ? body.product_ids.filter((x): x is string => typeof x === "string").slice(0, 12)
            : [];
          if (ids.length === 0) return Response.json({ error: "Aucun produit à enrichir." }, { status: 400 });

          // Deux modes : le vendeur (sa session) ou la tâche planifiée (secret).
          const givenSecret =
            request.headers.get("x-job-secret") ?? new URL(request.url).searchParams.get("secret") ?? "";
          const jobSecret = await serverEnv("JOB_SECRET");
          const isJob = !!jobSecret && givenSecret === jobSecret;

          const auth = request.headers.get("authorization") ?? "";
          const token = auth.replace(/^Bearer\s+/i, "").trim();
          if (!isJob && !token) return Response.json({ error: "Session requise." }, { status: 401 });

          const serviceKey = await serverEnv("SUPABASE_SERVICE_ROLE_KEY");
          if (!serviceKey) return Response.json({ error: "Configuration serveur incomplète." }, { status: 500 });

          // Le vendeur ne peut enrichir que ses propres fiches : on lit avec SA
          // session (les règles de sécurité de la base s'appliquent).
          const admin = serviceClient(serviceKey);
          let rows: { id: string; name: string; category: string | null; description: string | null }[] = [];
          let userId: string | null = null;

          if (isJob) {
            const { data } = await admin
              .from("products")
              .select("id,name,category,description")
              .in("id", ids);
            rows = (data as typeof rows | null) ?? [];
          } else {
            const scoped = userClient(token);
            const { data: userData } = await scoped.auth.getUser();
            if (!userData.user) return Response.json({ error: "Session expirée." }, { status: 401 });
            userId = userData.user.id;
            const { data } = await scoped
              .from("products")
              .select("id,name,category,description")
              .in("id", ids)
              .eq("owner_id", userId);
            rows = (data as typeof rows | null) ?? [];
          }
          if (rows.length === 0) return Response.json({ error: "Produits introuvables." }, { status: 404 });

          // Plafond quotidien : protège la facture d'un usage abusif.
          if (userId) {
            const used = await countAiCallsToday("enrich", userId);
            if (used >= AI_DAILY_LIMITS.enrich) {
              return Response.json({ ok: false, reason: "quota" }, { status: 429 });
            }
          }

          const results: { id: string; keywords: string[] }[] = [];
          let tokensIn = 0;
          let tokensOut = 0;

          for (const p of rows) {
            const userPrompt = [
              `Nom : ${p.name}`,
              `Catégorie : ${p.category ?? "non précisée"}`,
              `Description : ${(p.description ?? "").slice(0, 600) || "aucune"}`,
            ].join("\n");

            const res = await deepseekChat({
              messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: `${userPrompt}\n\nRenvoie le JSON.` },
              ],
              json: true,
              maxTokens: 400,
              timeoutMs: 20_000,
            });

            await logAiCall({
              kind: "enrich",
              userId,
              ok: res.ok,
              error: res.ok ? null : res.error,
              ms: res.ms,
              input: res.ok ? res.usage.input : 0,
              output: res.ok ? res.usage.output : 0,
              cached: res.ok ? res.usage.cached : 0,
              detail: p.id,
            });

            if (!res.ok) continue;
            tokensIn += res.usage.input;
            tokensOut += res.usage.output;

            const parsed = parseJsonObject<EnrichPayload>(res.text);
            if (!parsed) continue;

            // On rassemble mots-clés + attributs : c'est ce que la recherche lira.
            const attrs = {
              objet: asString(parsed.objet),
              genre: asString(parsed.genre),
              couleurs: asStringArray(parsed.couleurs, 6),
              matieres: asStringArray(parsed.matieres, 6),
              usage: asString(parsed.usage),
              synonymes: asStringArray(parsed.synonymes, 10),
            };
            const keywords = Array.from(
              new Set([
                ...asStringArray(parsed.keywords),
                ...attrs.synonymes,
                ...attrs.couleurs,
                ...attrs.matieres,
                attrs.objet,
                attrs.usage,
              ]),
            )
              .filter(Boolean)
              .slice(0, 24);

            const { error } = await admin
              .from("products")
              .update({ ai_keywords: keywords, ai_attrs: attrs, ai_enriched_at: new Date().toISOString() })
              .eq("id", p.id);
            if (!error) results.push({ id: p.id, keywords });
          }

          return Response.json({
            ok: true,
            enriched: results.length,
            requested: rows.length,
            results,
            usage: { input: tokensIn, output: tokensOut },
          });
        } catch (e) {
          return Response.json({ error: e instanceof Error ? e.message : "Erreur IA" }, { status: 500 });
        }
      },
    },
  },
});
