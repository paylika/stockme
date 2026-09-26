import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => ((m as { default?: ServerEntry }).default ?? (m as unknown as ServerEntry)),
    );
  }
  return serverEntryPromise;
}

function brandedErrorResponse(): Response {
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isCatastrophicSsrErrorBody(body: string, responseStatus: number): boolean {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return false;
  }

  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    return false;
  }

  const fields = payload as Record<string, unknown>;
  const expectedKeys = new Set(["message", "status", "unhandled"]);
  if (!Object.keys(fields).every((key) => expectedKeys.has(key))) {
    return false;
  }

  return (
    fields.unhandled === true &&
    fields.message === "HTTPError" &&
    (fields.status === undefined || fields.status === responseStatus)
  );
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isCatastrophicSsrErrorBody(body, response.status)) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return brandedErrorResponse();
}

/**
 * PAGES PUBLIQUES : mises en cache PAR LE WORKER.
 *
 * POURQUOI ICI ET PAS DANS UNE CACHE RULE : Cloudflare ne stocke pas les
 * réponses produites par un Worker (la Cache Rule créée dans le tableau de bord
 * n'a donc aucun effet — vérifié : aucun en-tête `cf-cache-status`). La seule
 * façon d'obtenir un vrai cache de bord est l'API `caches.default`, utilisée
 * ci-dessous.
 *
 * POURQUOI C'EST SANS RISQUE : ces pages renvoient exactement le même HTML pour
 * tout le monde (la session est dans le navigateur, pas dans un cookie — le
 * serveur ne connaît aucun utilisateur). Les pages privées ne sont jamais
 * concernées : voir CACHEABLE.
 */
const CACHEABLE =
  /^\/($|browse|tarifs|dropshipping|recherche-image|legal\/|product\/|vendeur\/|demandes$|demandes\/[0-9a-fA-F-]{36}$)/;

/** Durée de conservation au bord du réseau (secondes). */
const EDGE_TTL = 60;

type WorkerCache = { match: (r: Request) => Promise<Response | undefined>; put: (r: Request, res: Response) => Promise<void> };

function edgeCache(): WorkerCache | null {
  try {
    const c = (globalThis as unknown as { caches?: { default?: WorkerCache } }).caches;
    return c?.default ?? null;
  } catch {
    return null;
  }
}

function isCacheablePage(request: Request): boolean {
  if (request.method !== "GET") return false;
  try {
    const url = new URL(request.url);
    // On ne cache jamais un appel d'API, ni une navigation préchargée.
    if (!CACHEABLE.test(url.pathname)) return false;
    return true;
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    const waitUntil = (ctx as { waitUntil?: (p: Promise<unknown>) => void } | undefined)?.waitUntil;
    const cache = edgeCache();
    const cacheable = !!cache && isCacheablePage(request);

    // 1) Déjà en cache ? On répond immédiatement (~50 ms au lieu de ~1 500 ms).
    if (cacheable && cache) {
      try {
        const hit = await cache.match(request);
        if (hit) return hit;
      } catch {
        /* cache indisponible : on continue normalement */
      }
    }

    try {
      const handler = await getServerEntry();
      const response = await normalizeCatastrophicSsrResponse(await handler.fetch(request, env, ctx));

      // 2) On range la page en cache pour les visiteurs suivants.
      if (cacheable && cache && response.status === 200) {
        const type = response.headers.get("content-type") ?? "";
        if (type.includes("text/html") && !response.headers.has("set-cookie")) {
          const headers = new Headers(response.headers);
          headers.set("cache-control", `public, max-age=0, s-maxage=${EDGE_TTL}`);
          headers.set("x-stockme-cache", "miss");
          const body = response.clone().body;
          if (body && waitUntil) {
            waitUntil(
              cache
                .put(
                  request,
                  new Response(body, {
                    status: 200,
                    headers: { "content-type": type, "cache-control": `public, max-age=0, s-maxage=${EDGE_TTL}` },
                  }),
                )
                .catch(() => undefined),
            );
          }
          return new Response(response.body, { status: response.status, headers });
        }
      }
      return response;
    } catch (error) {
      console.error(error);
      return brandedErrorResponse();
    }
  },
};
