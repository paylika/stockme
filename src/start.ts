import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

/**
 * Pages PUBLIQUES : leur HTML est identique pour tout le monde (la session vit
 * dans le navigateur, pas dans un cookie — le serveur ne voit donc aucun
 * utilisateur). On autorise donc la mise en cache sur le bord du réseau
 * (Cloudflare) : la page peut être servie en ~50 ms au lieu de refaire tout le
 * rendu serveur à chaque visite.
 *
 * Les pages privées (profil, tableau de bord, admin, demandes d'un compte…)
 * ne sont JAMAIS mises en cache ici.
 */
const CACHEABLE =
  /^\/($|browse|tarifs|dropshipping|recherche-image|legal\/|product\/|vendeur\/|demandes$|demandes\/[0-9a-fA-F-]{36}$)/;

const cacheMiddleware = createMiddleware().server(async ({ next, request }) => {
  const result = await next();
  const response = result.response;
  try {
    if (request.method !== "GET" || response.status !== 200) return result;
    const path = new URL(request.url).pathname;
    if (!CACHEABLE.test(path)) return result;
    if (response.headers.has("cache-control")) return result;
    if (!(response.headers.get("content-type") ?? "").includes("text/html")) return result;

    const headers = new Headers(response.headers);
    // 1 minute fraîche, puis revalidée en arrière-plan pendant 5 minutes.
    headers.set("cache-control", "public, max-age=0, s-maxage=60, stale-while-revalidate=300");
    return new Response(response.body, { status: response.status, headers });
  } catch {
    return result;
  }
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [errorMiddleware, cacheMiddleware],
}));
