import { serverEnv } from "@/lib/server-env";

/**
 * Client DeepSeek — CÔTÉ SERVEUR UNIQUEMENT.
 *
 * La clé vit dans un secret Cloudflare (`DEEPSEEK_API_KEY`, type Secret) : elle
 * ne doit JAMAIS être envoyée au navigateur (le dépôt est public). Toutes les
 * fonctionnalités IA passent donc par des routes serveur.
 *
 * Un seul modèle suffit : `deepseek-flash` (DeepSeek-V4.1-Flash) sait lire les
 * images, sortir du JSON strict et appeler des outils — contrairement à
 * `deepseek-v4-pro` qui ne gère pas la vision.
 *
 * Ce module n'échoue jamais : il renvoie un motif d'échec exploitable pour que
 * l'application retombe proprement sur ses fonctions habituelles.
 */

const BASE_URL = "https://api.deepseek.com";
export const AI_MODEL = "deepseek-flash";

export type AiError =
  | "not_configured"
  | "unauthorized"
  | "rate_limited"
  | "timeout"
  | "network"
  | "bad_response";

export type AiUsage = { input: number; output: number; cached: number };

export type AiResult =
  | { ok: true; text: string; usage: AiUsage; ms: number }
  | { ok: false; error: AiError; detail?: string; ms: number };

type ImagePart = { type: "image_url"; image_url: { url: string } };
type TextPart = { type: "text"; text: string };
export type AiContent = string | (TextPart | ImagePart)[];

export type AiMessage = { role: "system" | "user" | "assistant"; content: AiContent };

/** La clé DeepSeek est-elle configurée ? (sinon l'IA reste muette) */
export async function aiConfigured(): Promise<boolean> {
  return !!(await serverEnv("DEEPSEEK_API_KEY"));
}

/**
 * Appel unique et sans effet de bord.
 * `json: true` active le mode JSON natif : la réponse est un objet valide,
 * donc plus de parsing fragile côté serveur.
 *
 * `thinking` : le mode « réflexion » est ACTIVÉ PAR DÉFAUT chez DeepSeek (effort
 * élevé) — très bien pour un raisonnement complexe, mais il multiplie le temps
 * de réponse (8-9 s mesurés pour une image) alors que nos tâches sont de la
 * simple extraction d'information. On le désactive donc par défaut : même
 * résultat, beaucoup plus rapide.
 */
export async function deepseekChat(opts: {
  messages: AiMessage[];
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  /** "disabled" (défaut, rapide) ou un niveau d'effort : "low" | "high" | "max". */
  thinking?: "disabled" | "low" | "high" | "max";
}): Promise<AiResult> {
  const started = Date.now();
  const key = await serverEnv("DEEPSEEK_API_KEY");
  if (!key) return { ok: false, error: "not_configured", ms: 0 };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 20_000);
  const effort = opts.thinking ?? "disabled";

  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: opts.messages,
        temperature: opts.temperature ?? 0.2,
        max_tokens: opts.maxTokens ?? 800,
        ...(opts.json ? { response_format: { type: "json_object" } } : {}),
        ...(effort === "disabled"
          ? { thinking: { type: "disabled" } }
          : { thinking: { type: "enabled" }, reasoning_effort: effort }),
        stream: false,
      }),
      signal: controller.signal,
    });

    const ms = Date.now() - started;

    if (res.status === 401 || res.status === 403) return { ok: false, error: "unauthorized", ms };
    if (res.status === 429) return { ok: false, error: "rate_limited", ms };
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, error: "bad_response", detail: `${res.status} ${detail.slice(0, 200)}`, ms };
    }

    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_cache_hit_tokens?: number };
    };

    const text = json.choices?.[0]?.message?.content ?? "";
    if (!text) return { ok: false, error: "bad_response", detail: "réponse vide", ms };

    return {
      ok: true,
      text,
      ms,
      usage: {
        input: json.usage?.prompt_tokens ?? 0,
        output: json.usage?.completion_tokens ?? 0,
        cached: json.usage?.prompt_cache_hit_tokens ?? 0,
      },
    };
  } catch (e) {
    const ms = Date.now() - started;
    const aborted = e instanceof Error && e.name === "AbortError";
    return { ok: false, error: aborted ? "timeout" : "network", detail: e instanceof Error ? e.message : undefined, ms };
  } finally {
    clearTimeout(timer);
  }
}

/** Extraction tolérante d'un objet JSON renvoyé par le modèle. */
export function parseJsonObject<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    // Le modèle encadre parfois le JSON de texte : on récupère le 1er bloc {...}.
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}
