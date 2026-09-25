import { createFileRoute } from "@tanstack/react-router";
import { aiConfigured, deepseekChat, AI_MODEL } from "@/lib/ai/deepseek.server";
import { logAiCall } from "@/lib/ai/log.server";

/**
 * GET /api/ai/status
 *   → { configured, model }
 *   → avec ?ping=1 : fait un vrai appel minuscule et renvoie latence + tokens.
 *
 * C'est le test « la clé DeepSeek fonctionne vraiment » : une seule requête,
 * aucune donnée sensible, et le résultat est journalisé.
 */
export const Route = createFileRoute("/api/ai/status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const configured = await aiConfigured();
        const url = new URL(request.url);

        if (url.searchParams.get("ping") !== "1") {
          return Response.json({ configured, model: AI_MODEL });
        }

        const res = await deepseekChat({
          messages: [
            { role: "system", content: "Tu réponds en JSON strict." },
            { role: "user", content: 'Réponds exactement {"ok":true}' },
          ],
          json: true,
          maxTokens: 20,
          timeoutMs: 15_000,
        });

        await logAiCall({
          kind: "ping",
          ok: res.ok,
          error: res.ok ? null : res.error,
          ms: res.ms,
          input: res.ok ? res.usage.input : 0,
          output: res.ok ? res.usage.output : 0,
          cached: res.ok ? res.usage.cached : 0,
        });

        return Response.json({
          configured,
          model: AI_MODEL,
          ping: res.ok ? { ok: true, ms: res.ms, usage: res.usage } : { ok: false, error: res.error },
        });
      },
    },
  },
});
