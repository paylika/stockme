import { createFileRoute } from "@tanstack/react-router";
import { supabase, STOCKME_SUPABASE_URL } from "@/integrations/supabase/stockme-client";
import { SITE_URL } from "@/lib/seo";

/**
 * /sitemap.xml — plan du site DYNAMIQUE.
 *
 * Avant, c'était un fichier figé avec 6 adresses : Google ne pouvait donc PAS
 * découvrir les 456 fiches produits ni les boutiques — la plus grosse perte de
 * trafic gratuit du site. On les liste maintenant, plus les demandes d'achat
 * (chaque demande est une page unique qui répond à une recherche précise).
 *
 * Les adresses privées (/dashboard, /profile, /auth…) restent exclues : voir
 * public/robots.txt.
 */
export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const urls: { loc: string; changefreq: string; priority: string; lastmod?: string }[] = [
          { loc: `${SITE_URL}/`, changefreq: "daily", priority: "1.0" },
          { loc: `${SITE_URL}/browse`, changefreq: "daily", priority: "0.9" },
          { loc: `${SITE_URL}/demandes`, changefreq: "daily", priority: "0.8" },
          { loc: `${SITE_URL}/dropshipping`, changefreq: "weekly", priority: "0.7" },
          { loc: `${SITE_URL}/tarifs`, changefreq: "weekly", priority: "0.7" },
          { loc: `${SITE_URL}/recherche-image`, changefreq: "monthly", priority: "0.5" },
        ];

        try {
          // Produits publiés (les plus récents d'abord, 3000 maximum).
          const { data: products } = await supabase
            .from("products")
            .select("id,created_at")
            .eq("published", true)
            .order("created_at", { ascending: false })
            .limit(3000);

          for (const p of (products as { id: string; created_at: string }[] | null) ?? []) {
            urls.push({
              loc: `${SITE_URL}/product/${p.id}`,
              changefreq: "weekly",
              priority: "0.8",
              lastmod: p.created_at?.slice(0, 10),
            });
          }

          // Boutiques publiques : uniquement celles qui ont des produits en ligne.
          const { data: sellers } = await supabase
            .from("products")
            .select("owner_id")
            .eq("published", true)
            .limit(3000);

          const owners = Array.from(
            new Set(((sellers as { owner_id: string }[] | null) ?? []).map((s) => s.owner_id)),
          );
          for (const id of owners) {
            urls.push({ loc: `${SITE_URL}/vendeur/${id}`, changefreq: "weekly", priority: "0.6" });
          }

          // Demandes d'achat encore ouvertes (contenu unique, très ciblé).
          const { data: requests } = await supabase
            .rpc("get_buying_requests", { p_limit: 60 });

          for (const r of ((requests as { id: string; created_at?: string }[] | null) ?? [])) {
            urls.push({
              loc: `${SITE_URL}/demandes/${r.id}`,
              changefreq: "daily",
              priority: "0.5",
              lastmod: r.created_at?.slice(0, 10),
            });
          }
        } catch {
          // Base indisponible : on renvoie au moins les pages fixes (jamais 500,
          // sinon Google désindexe le plan du site).
        }

        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) =>
      `  <url>\n    <loc>${u.loc}</loc>\n${
        u.lastmod ? `    <lastmod>${u.lastmod}</lastmod>\n` : ""
      }    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`,
  )
  .join("\n")}
</urlset>
`;

        return new Response(xml, {
          headers: {
            "content-type": "application/xml; charset=utf-8",
            // Cache court : le plan doit rester frais, mais ne pas marteler la base.
            "cache-control": "public, max-age=1800",
            "x-stockme-supabase": STOCKME_SUPABASE_URL,
          },
        });
      },
    },
  },
});
