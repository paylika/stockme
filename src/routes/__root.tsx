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
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#0f172a" },
      { title: "StockMe — Trouvez et écoulez du stock" },
      { name: "description", content: "La plateforme qui connecte e-commerçants pour trouver et écouler du stock rapidement. Contact direct WhatsApp." },
      { property: "og:title", content: "StockMe — Trouvez et écoulez du stock" },
      { property: "og:description", content: "La plateforme qui connecte e-commerçants pour trouver et écouler du stock rapidement. Contact direct WhatsApp." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "StockMe — Trouvez et écoulez du stock" },
      { name: "twitter:description", content: "La plateforme qui connecte e-commerçants pour trouver et écouler du stock rapidement. Contact direct WhatsApp." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/3222f741-6e0f-4629-be4e-f7edebd9e5fb/id-preview-9fa2ac45--9b779be2-ba90-44e1-bd94-3f69841c7713.lovable.app-1778311385306.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/3222f741-6e0f-4629-be4e-f7edebd9e5fb/id-preview-9fa2ac45--9b779be2-ba90-44e1-bd94-3f69841c7713.lovable.app-1778311385306.png" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Instrument+Serif&family=Inter:wght@400;500;600;700&display=swap" },
      { rel: "stylesheet", href: appCss },
    ],
  }),
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
  const isAdminLayout = routeMatches.some(
    (m) => m.route?.id === "/_admin" || m.route?.id?.startsWith("/_admin/"),
  );

  return (
    <QueryClientProvider client={queryClient}>
      {isAdminLayout ? (
        <Outlet />
      ) : (
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset className="min-w-0">
            <Outlet />
          </SidebarInset>
        </SidebarProvider>
      )}
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  );
}
