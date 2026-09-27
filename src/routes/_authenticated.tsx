import { createFileRoute, Navigate, Outlet, redirect, useLocation } from "@tanstack/react-router";
import { ensureSession } from "@/lib/auth-session";
import { useAuth } from "@/hooks/useAuth";
import { buildSeoHead } from "@/lib/seo";

/**
 * GARDE D'ACCÈS — DEUX NIVEAUX, ET C'EST INDISPENSABLE.
 *
 * NIVEAU 1 — `beforeLoad` : couvre les navigations faites DANS le site
 * (on clique sur « Mon profil » depuis la page d'accueil). C'est là qu'on peut
 * vérifier la session avant même d'afficher la page.
 *
 * NIVEAU 2 — le composant ci-dessous : couvre les chargements DIRECTS de page
 * (ouvrir un lien, recharger, revenir sur l'onglet). Dans ce cas, le routeur
 * réutilise la décision prise par le serveur — où `window` n'existe pas et où
 * la session est invisible — donc `beforeLoad` ne protège RIEN.
 *
 * C'ÉTAIT LA CAUSE DU « LE PROFIL SAUTE » SUR MOBILE : sur téléphone, le
 * navigateur recharge la page en permanence (changement d'application, mémoire
 * saturée). À chaque rechargement, la page protégée s'affichait VIDE — sans
 * données, comme si le compte était déconnecté — au lieu de renvoyer vers la
 * connexion. Sur ordinateur, l'onglet reste ouvert et la navigation interne
 * passait par le niveau 1 : d'où l'impression que « ça ne le fait que sur
 * mobile ». Le niveau 2 corrige exactement cela.
 */
export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ location }) => {
    // Rendu serveur : on ne peut pas conclure (la session vit dans le
    // navigateur). Le niveau 2 prend le relais dès que la page est vivante.
    if (typeof window === "undefined") return;
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
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user, loading } = useAuth();
  const location = useLocation();

  // Tant que la session n'est pas lue, on ne montre PAS la page vide : c'est
  // cet écran vide qui donnait l'impression d'avoir été déconnecté.
  if (loading) return <SessionLoading />;

  // Aucune session : direction la connexion, avec le retour prévu.
  if (!user) {
    const redirectTo = `${location.pathname}${location.searchStr}${location.hash}`;
    return (
      <Navigate
        to="/auth"
        search={{ redirect: redirectTo, mode: redirectTo === "/dashboard/new" ? "signup" : "login" }}
        replace
      />
    );
  }

  return <Outlet />;
}

function SessionLoading() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="h-8 w-48 rounded bg-muted shimmer" />
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="h-28 rounded-2xl bg-muted shimmer" />
          <div className="h-28 rounded-2xl bg-muted shimmer" />
        </div>
        <p className="mt-4 text-xs text-muted-foreground">Vérification de votre connexion…</p>
      </div>
    </div>
  );
}
