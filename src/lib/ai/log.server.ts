import { serverEnv } from "@/lib/server-env";
import { serviceClient } from "@/lib/payments/supabase-server";

/**
 * Journal des appels IA : coût, latence, résultat.
 * Sert aussi de compteur anti-abus (quotas par utilisateur et par jour).
 *
 * Tout est « best effort » : si la table n'existe pas encore (SQL non collé),
 * on n'échoue jamais — une fonctionnalité ne doit pas casser pour un log.
 */
export type AiCallKind = "enrich" | "search" | "image_search" | "support" | "ping";

export async function logAiCall(entry: {
  kind: AiCallKind;
  userId?: string | null;
  ok: boolean;
  error?: string | null;
  ms: number;
  input?: number;
  output?: number;
  cached?: number;
  detail?: string | null;
}): Promise<void> {
  try {
    const serviceKey = await serverEnv("SUPABASE_SERVICE_ROLE_KEY");
    if (!serviceKey) return;
    const supabase = serviceClient(serviceKey);
    await supabase.from("ai_calls").insert({
      kind: entry.kind,
      user_id: entry.userId ?? null,
      ok: entry.ok,
      error: entry.error ?? null,
      latency_ms: entry.ms,
      input_tokens: entry.input ?? 0,
      output_tokens: entry.output ?? 0,
      cached_tokens: entry.cached ?? 0,
      detail: entry.detail ?? null,
    });
  } catch {
    /* le journal ne doit jamais casser une fonctionnalité */
  }
}

/** Nombre d'appels d'un type donné aujourd'hui (UTC) pour un utilisateur. */
export async function countAiCallsToday(kind: AiCallKind, userId: string): Promise<number> {
  try {
    const serviceKey = await serverEnv("SUPABASE_SERVICE_ROLE_KEY");
    if (!serviceKey) return 0;
    const supabase = serviceClient(serviceKey);
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    const { count } = await supabase
      .from("ai_calls")
      .select("id", { count: "exact", head: true })
      .eq("kind", kind)
      .eq("user_id", userId)
      .gte("created_at", since.toISOString());
    return count ?? 0;
  } catch {
    return 0;
  }
}

/** Plafonds quotidiens par utilisateur (protège la facture). */
export const AI_DAILY_LIMITS: Record<AiCallKind, number> = {
  enrich: 300,
  search: 400,
  image_search: 30,
  support: 60,
  ping: 50,
};
