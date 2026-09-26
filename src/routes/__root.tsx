import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { JsonLd } from "@/components/JsonLd";
import { WhatsAppGroupPopup } from "@/components/WhatsAppGroupPopup";
import { ScrollKeeper } from "@/components/ScrollKeeper";
import { SellerMoneyProvider } from "@/components/SellerMoneyProvider";
import { supabase, STOCKME_SUPABASE_URL } from "@/integrations/supabase/stockme-client";
import { useEffect } from "react";
import {
  buildSeoHead,
  defaultImage,
  defaultTitle,
  defaultDescription,
  organizationLd,
  webSiteLd,
} from "@/lib/seo";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold tracking-tight">404</h1>
        <p className="mt-3 text-muted-foreground">Cette page n'existe pas.</p>
        <div className="mt-6">
          <Link to="/" className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Retour à l'accueil
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">Une erreur est survenue</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <div className="mt-6 flex justify-center gap-2">
          <button onClick={() => { router.invalidate(); reset(); }}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Réessayer
          </button>
          <a href="/" className="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent">Accueil</a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => {
    const { meta, links } = buildSeoHead({
      title: defaultTitle,
      description: defaultDescription,
      image: defaultImage,
      path: "/",
    });
    return {
      meta: [
        { charSet: "utf-8" },
        {
          name: "viewport",
          /* maximum-scale=1 : empêche le zoom AUTOMATIQUE (champ de saisie,
             contenu large) et le zoom conservé d'une page à l'autre. Le
             pincement à deux doigts reste possible (iOS l'ignore volontairement
             pour l'accessibilité), mais plus aucune page ne s'ouvre agrandie. */
          content: "width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover",
        },
        ...meta,
      ],
      links: [
        { rel: "preconnect", href: "https://fonts.googleapis.com" },
        { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
        /* Les photos produits ET l'API vivent chez Supabase : sans ce
           pré-connexion, le navigateur paie un aller-retour DNS + TLS complet
           avant d'afficher la première image. */
        { rel: "preconnect", href: STOCKME_SUPABASE_URL },
        { rel: "dns-prefetch", href: STOCKME_SUPABASE_URL },
        { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Instrument+Serif&family=Inter:wght@400;500;600;700&display=swap" },
        { rel: "stylesheet", href: appCss },
        ...links,
      ],
    };
  },
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head><HeadContent /></head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  // En mode admin, on ne montre pas la sidebar StockMe (l'admin a sa propre sidebar).
  const routeMatches = useRouterState({ select: (r) => r.matches });
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const isAdminLayout = routeMatches.some((m) => {
    // `routeId` est la propriété publique et fiable (contrairement à `route`,
    // absent de certains matches pendant le rendu serveur).
    const rid = (m as { routeId?: string }).routeId ?? "";
    return rid === "/_admin" || rid.startsWith("/_admin/");
  });

  // Comptage des visites (pages publiques uniquement, 1× par page et par session)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const isPublic =
      pathname === "/" ||
      pathname.startsWith("/browse") ||
      pathname.startsWith("/dropshipping") ||
      pathname.startsWith("/product") ||
      pathname.startsWith("/legal");
    if (!isPublic) return;
    const key = `stockme:visited:${pathname}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    supabase.rpc("log_site_visit", { p_path: pathname }).then(() => {});
  }, [pathname]);

  return (
    <QueryClientProvider client={queryClient}>
      {isAdminLayout ? (
        <Outlet />
      ) : (
        /* Un SEUL portefeuille pour tout le site : le sidebar peut donc ouvrir
           directement les pop-up Recharger / Booster, sans passer par le profil. */
        <SellerMoneyProvider>
          <SidebarProvider>
            <AppSidebar />
            <SidebarInset className="min-w-0">
              <Outlet />
            </SidebarInset>
          </SidebarProvider>
        </SellerMoneyProvider>
      )}
      {!isAdminLayout && <WhatsAppGroupPopup />}
      {/* Mémoire de défilement : le retour depuis une fiche produit ramène à la
          position exacte dans la liste, sur tout le site. */}
      <ScrollKeeper />
      <JsonLd data={organizationLd()} />
      <JsonLd data={webSiteLd()} />
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  );
}
