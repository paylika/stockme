import { createFileRoute } from "@tanstack/react-router";
import { serverEnv } from "@/lib/server-env";
import { serviceClient, userClient } from "@/lib/payments/supabase-server";
import { deepseekChat, parseJsonObject, aiConfigured } from "@/lib/ai/deepseek.server";
import { logAiCall, countAiCallsToday, AI_DAILY_LIMITS } from "@/lib/ai/log.server";
import { CATEGORIES } from "@/lib/constants";

/**
 * POST /api/ai/image-search
 *   { image: "data:image/jpeg;base64,…" }     → photo déjà compressée par le navigateur
 *
 * RECHERCHE PAR IMAGE (façon Alibaba) :
 *   1. `deepseek-flash` REGARDE la photo et renvoie des mots-clés + attributs
 *      (objet, catégorie, couleurs, matières, genre, marque lisible) ;
 *   2. on cherche avec ces mots-clés dans les fiches produits ;
 *   3. le classement reste en base (`search_products_ai`) : pertinence, puis
 *      MISE EN AVANT PAYÉE, puis fournisseur vérifié — l'IA ne touche pas à
 *      tes règles commerciales.
 *
 * Si la fonction `search_products_ai` n'est pas encore installée, on bascule
 * sur une recherche simple : la fonctionnalité marche quand même.
 */

const MAX_IMAGE_CHARS = 12_000_000; // ~9 Mo de binaire : large, la compression client fait le reste

const SYSTEM_PROMPT = `Tu analyses la photo d'un produit envoyée par un acheteur sur StockMe, une marketplace de gros en Afrique de l'Ouest.
Tu réponds UNIQUEMENT par un objet JSON, sans texte autour.

Format exact :
{
  "est_un_produit": true,
  "produit": "nom court du produit en français",
  "categorie": "une valeur EXACTE de la liste autorisée, sinon vide",
  "mots_cles": ["..."],
  "couleurs": ["..."],
  "matieres": ["..."],
  "genre": "homme" | "femme" | "enfant" | "mixte" | "",
  "marque_visible": "...",
  "texte_visible": "...",
  "confiance": 0.0
}

Règles :
- "est_un_produit" vaut false si la photo ne montre pas un objet vendable (selfie, paysage, capture d'écran, texte seul). Dans ce cas, laisse les autres champs vides.
- "mots_cles" : 8 à 14 mots qu'un ACHETEUR taperait vraiment pour trouver ce produit (nom générique, synonymes courants, catégorie, matière, couleur, usage). En minuscules, 1 à 3 mots chacun, sans doublon.
- "couleurs" et "matieres" : uniquement ce qui est réellement visible sur la photo.
- "marque_visible" : uniquement si la marque est lisible sur la photo, sinon vide.
- "confiance" : ta confiance globale entre 0 et 1.
- N'invente jamais une information absente de la photo.`;

type VisionPayload = {
  est_un_produit?: unknown;
  produit?: unknown;
  categorie?: unknown;
  mots_cles?: unknown;
  couleurs?: unknown;
  matieres?: unknown;
  genre?: unknown;
  marque_visible?: unknown;
  texte_visible?: unknown;
  confiance?: unknown;
};

const arr = (v: unknown, max: number): string[] =>
  Array.isArray(v)
    ? v
        .filter((x): x is string => typeof x === "string")
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s.length > 1 && s.length <= 40)
        .slice(0, max)
    : [];

const str = (v: unknown, max = 60): string =>
  typeof v === "string" ? v.trim().toLowerCase().slice(0, max) : "";

export const Route = createFileRoute("/api/ai/image-search")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          if (!(await aiConfigured())) {
            return Response.json({ ok: false, reason: "ai_not_configured" }, { status: 503 });
          }

          const body = (await request.json()) as { image?: unknown };
          const image = typeof body.image === "string" ? body.image : "";
          if (!image.startsWith("data:image/") || image.length > MAX_IMAGE_CHARS) {
            return Response.json({ ok: false, reason: "bad_image" }, { status: 400 });
          }

          // Qui demande ? (facultatif : la recherche par image est ouverte à tous)
          const auth = request.headers.get("authorization") ?? "";
          const token = auth.replace(/^Bearer\s+/i, "").trim();
          let userId: string | null = null;
          if (token) {
            const { data } = await userClient(token).auth.getUser();
            userId = data.user?.id ?? null;
          }

          // Plafond quotidien : 30 analyses par personne et par jour.
          const ip = request.headers.get("cf-connecting-ip") ?? "anonyme";
          const quotaKey = userId ?? `ip:${ip}`;
          const used = await countAiCallsToday("image_search", quotaKey);
          if (used >= AI_DAILY_LIMITS.image_search) {
            return Response.json(
              { ok: false, reason: "quota", limit: AI_DAILY_LIMITS.image_search },
              { status: 429 },
            );
          }

          // 1) La vision : que voit-on sur cette photo ?
          const vision = await deepseekChat({
            messages: [
              {
                role: "system",
                content: `${SYSTEM_PROMPT}\n\nCatégories autorisées : ${CATEGORIES.join(" | ")}`,
              },
              {
                role: "user",
                content: [
                  { type: "text", text: "Analyse cette photo et renvoie le JSON." },
                  { type: "image_url", image_url: { url: image } },
                ],
              },
            ],
            json: true,
            maxTokens: 500,
            timeoutMs: 30_000,
          });

          await logAiCall({
            kind: "image_search",
            userId: quotaKey,
            ok: vision.ok,
            error: vision.ok ? null : vision.error,
            ms: vision.ms,
            input: vision.ok ? vision.usage.input : 0,
            output: vision.ok ? vision.usage.output : 0,
            cached: vision.ok ? vision.usage.cached : 0,
          });

          if (!vision.ok) {
            return Response.json({ ok: false, reason: vision.error }, { status: 502 });
          }

          const parsed = parseJsonObject<VisionPayload>(vision.text);
          if (!parsed) return Response.json({ ok: false, reason: "bad_vision" }, { status: 502 });

          const estUnProduit = parsed.est_un_produit !== false;
          const produit = str(parsed.produit);
          const couleurs = arr(parsed.couleurs, 5);
          const matieres = arr(parsed.matieres, 5);
          const genre = str(parsed.genre, 12);
          const marque = str(parsed.marque_visible, 30);
          const categorieRaw = str(parsed.categorie, 40);
          // On n'accepte que les catégories réelles du catalogue.
          const categorie = CATEGORIES.find((c) => c.toLowerCase() === categorieRaw) ?? null;

          const keywords = Array.from(
            new Set([...arr(parsed.mots_cles, 14), produit, ...couleurs, ...matieres, marque, ...(genre ? [genre] : [])]),
          )
            .map((k) => k.trim().toLowerCase())
            .filter((k) => k.length > 1)
            .slice(0, 18);

          if (!estUnProduit || keywords.length === 0) {
            return Response.json({
              ok: true,
              recognized: false,
              produit,
              keywords: [],
              categorie,
              couleurs,
              matieres,
              genre,
              marque,
              products: [],
              remaining: Math.max(0, AI_DAILY_LIMITS.image_search - used - 1),
            });
          }

          // 2) La recherche : la fonction dédiée garde tes règles commerciales.
          const serviceKey = await serverEnv("SUPABASE_SERVICE_ROLE_KEY");
          let products: unknown[] = [];
          let usedFallback = false;

          if (serviceKey) {
            const admin = serviceClient(serviceKey);
            const { data, error } = await admin.rpc("search_products_ai", {
              p_keywords: keywords,
              p_category: categorie,
              p_sort: "pertinence",
              p_limit: 24,
              p_offset: 0,
            });

            if (!error) {
              products = (data as unknown[] | null) ?? [];
            } else {
              // La fonction n'est pas encore installée : recherche simple.
              usedFallback = true;
              const orFilter = keywords
                .slice(0, 6)
                .map((k) => `name.ilike.%${k.replace(/[,()]/g, "")}%`)
                .join(",");
              const { data: rows } = await admin
                .from("products")
                .select(
                  "id,name,category,price_fcfa,promo_price_fcfa,quantity,moq,city,zone,images,sold_out,dropshipping,owner_id",
                )
                .eq("published", true)
                .or(orFilter)
                .limit(24);
              products = (rows as unknown[] | null) ?? [];
            }
          }

          return Response.json({
            ok: true,
            recognized: true,
            produit,
            categorie,
            couleurs,
            matieres,
            genre,
            marque,
            keywords,
            products,
            fallback: usedFallback,
            remaining: Math.max(0, AI_DAILY_LIMITS.image_search - used - 1),
          });
        } catch (e) {
          return Response.json({ ok: false, reason: e instanceof Error ? e.message : "error" }, { status: 500 });
        }
      },
    },
  },
});
