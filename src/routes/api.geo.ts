import { createFileRoute } from "@tanstack/react-router";
import { countryFromIso } from "@/lib/geo";

/**
 * Pays du visiteur, sans service externe ni permission navigateur.
 *
 * En production (Cloudflare Workers), l'en-tête `CF-IPCountry` est ajouté
 * automatiquement à chaque requête : géolocalisation par IP au niveau pays,
 * gratuite et instantanée. En développement, l'en-tête est absent → null
 * (aucun filtre n'est appliqué, comportement inchangé).
 */
export const Route = createFileRoute("/api/geo")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const iso =
          request.headers.get("cf-ipcountry") ??
          request.headers.get("x-vercel-ip-country") ??
          request.headers.get("x-country-code");

        // "XX" (inconnu) et "T1" (Tor) ne correspondent à aucun pays.
        const safeIso = iso && iso.length === 2 ? iso : null;
        const country = countryFromIso(safeIso);

        return new Response(JSON.stringify({ iso: safeIso, country }), {
          headers: {
            "content-type": "application/json",
            // Le pays d'un visiteur ne change pas : cache court côté navigateur.
            "cache-control": "private, max-age=1800",
          },
        });
      },
    },
  },
});
