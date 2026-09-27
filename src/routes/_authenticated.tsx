import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { ensureSession } from "@/lib/auth-session";
import { buildSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_authenticated")({
  /**
   * GARDE D'ACCÈS — à ne pas durcir sans raison.
   *
   * Avant, cette garde appelait `getSession()` ET `getUser()` : dès que le
   * réseau du téléphone vacillait (ou que l'application revenait au premier
   * plan avec un jeton à rafraîchir), les deux répondaient « rien » et
   * l'utilisateur était renvoyé à la page de connexion alors qu'il était
   * toujours connecté. C'est exactement le « ça se déconnecte tout seul ».
   *
   * `ensureSession()` lit d'abord la session du navigateur (sans réseau) et
   * tente de la récupérer si elle a disparu. On ne redirige donc que lorsqu'il
   * n'y a VRAIMENT plus de session.
   */
  beforeLoad: async ({ location }) => {
    if (typeof window === "undefined") return; // rendu serveur : jamais de redirection
    const session = await ensureSession();
    if (session) return;
    const redirectTo = `${location.pathname}${location.searchStr}${location.hash}`;
    throw redirect({
      to: "/auth",
      search: { redirect: redirectTo, mode: redirectTo === "/dashboard/new" ? "signup" : "login" },
    });
  },
  head: () => {
    const { meta } = buildSeoHead({ noindex: true, title: "Mon espace — StockMe" });
    return { meta, links: [] };
  },
  component: () => <Outlet />,
});
