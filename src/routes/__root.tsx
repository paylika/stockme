import {
  Outlet,
  Link,
  createRootRoute,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { JsonLd } from "@/components/JsonLd";
import { ImageSecours } from "@/components/ImageSecours";
import { ScrollKeeper } from "@/components/ScrollKeeper";
import { SellerMoneyProvider } from "@/components/SellerMoneyProvider";
import { MetaPixel } from "@/components/MetaPixel";
import { supabase, STOCKME_SUPABASE_URL } from "@/integrations/supabase/stockme-client";
import { lazy, Suspense, useEffect } from "react";

/**
 * CHARGÉS SEULEMENT QUAND ON EN A BESOIN.
 *
 * La barre latérale du vendeur et la popup d'invitation étaient téléchargées
 * par TOUS les visiteurs, y compris un acheteur qui ouvre simplement une fiche
 * produit pour écrire au vendeur — alors qu'il n'utilisera jamais ni son
 * portefeuille ni ses statistiques. Elles partent maintenant dans un fichier à
 * part, récupéré juste après l'affichage de la page.
 *
 * C'est le principal poste du « paquet de démarrage » : moins de code à
 * télécharger, c'est moins de pages qui traînent sur un réseau mobile faible.
 */
const AppSidebar = lazy(() =>
  import("@/components/AppSidebar").then((m) => ({ default: m.AppSidebar })),
);
const WhatsAppGroupPopup = lazy(() =>
  import("@/components/WhatsAppGroupPopup").then((m) => ({ default: m.WhatsAppGroupPopup })),
);
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

export const Route = createRootRoute({
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
        /* Service d'images : il redimensionne les photos produits (300 Ko → 35 Ko).
           Sans pré-connexion, la première vignette attend un aller-retour de plus. */
        { rel: "preconnect", href: "https://wsrv.nl" },
        { rel: "dns-prefetch", href: "https://wsrv.nl" },
        { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap" },
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
      <head>
        {/* VÉRIFICATION DU DOMAINE META (Facebook / Instagram).
            ⚠️ Cette balise DOIT être dans le <head> STATIQUE rendu par le
            serveur — Meta refuse une balise ajoutée par JavaScript. Elle est
            donc écrite ici, en dur, et non dans un composant client. */}
        <meta name="facebook-domain-verification" content="niwaxido3w5wjbydc2at3vkm12jftk" />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
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
    /* Comptage des visites : rien d'urgent. On attend que le navigateur soit
       libre (invisible pour l'utilisateur) au lieu d'ajouter une requête
       pendant le chargement de la page. */
    const send = () => void supabase.rpc("log_site_visit", { p_path: pathname });
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    if (typeof w.requestIdleCallback === "function") w.requestIdleCallback(send, { timeout: 4000 });
    else window.setTimeout(send, 2500);
  }, [pathname]);

  /**
   * RÉPARATION AUTOMATIQUE APRÈS UN DÉPLOIEMENT — LE BUG LE PLUS FRÉQUENT.
   *
   * LE PROBLÈME : à chaque déploiement, les fichiers de code changent de nom
   * (ils portent une empreinte de leur contenu). Quelqu'un qui a le site ouvert
   * — ou qui navigue au mauvais moment — demande alors un fichier qui n'existe
   * plus : la page ne s'ouvre pas, la navigation casse, parfois l'écran reste
   * blanc. C'est exactement le « ça se casse souvent » rapporté par les
   * utilisateurs, et c'est le prix d'avoir déployé trop souvent dans la journée.
   *
   * LA RÉPARATION : on écoute ces erreurs précises et on RECHARGE la page une
   * fois. L'utilisateur ne voit pas l'erreur, il voit sa page s'afficher. Un
   * garde-fou de 20 secondes empêche toute boucle de rechargement.
   */
  useEffect(() => {
    const MORCEAU_MANQUANT =
      /dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Loading chunk .* failed/i;

    const reparer = () => {
      try {
        const cle = "stockme:reparation";
        const dernier = Number(window.sessionStorage.getItem(cle) ?? 0);
        if (Date.now() - dernier < 20_000) return; // déjà tenté à l'instant : on n'insiste pas
        window.sessionStorage.setItem(cle, String(Date.now()));
      } catch {
        /* stockage bloqué : on recharge quand même */
      }
      window.location.reload();
    };

    const surRejet = (e: PromiseRejectionEvent) => {
      const message = String((e.reason as { message?: string })?.message ?? e.reason ?? "");
      if (MORCEAU_MANQUANT.test(message)) {
        e.preventDefault();
        reparer();
      }
    };
    const surErreur = (e: ErrorEvent) => {
      if (MORCEAU_MANQUANT.test(String(e.message ?? ""))) reparer();
    };

    window.addEventListener("unhandledrejection", surRejet);
    window.addEventListener("error", surErreur);
    return () => {
      window.removeEventListener("unhandledrejection", surRejet);
      window.removeEventListener("error", surErreur);
    };
  }, []);

  return (
    <>
      {isAdminLayout ? (
        <Outlet />
      ) : (
        /* Un SEUL portefeuille pour tout le site : le sidebar peut donc ouvrir
           directement les pop-up Recharger / Booster, sans passer par le profil. */
        <SellerMoneyProvider>
          <SidebarProvider>
            <Suspense fallback={null}>
              <AppSidebar />
            </Suspense>
            <SidebarInset className="min-w-0">
              <Outlet />
            </SidebarInset>
          </SidebarProvider>
        </SellerMoneyProvider>
      )}
      {!isAdminLayout && (
        <Suspense fallback={null}>
          <WhatsAppGroupPopup />
        </Suspense>
      )}
      {/* Pixel Meta (Facebook / Instagram) : chargé sans ralentir le site.
          Volontairement ABSENT des pages d'administration : les visites de
          l'équipe fausseraient les statistiques des campagnes. */}
      {!isAdminLayout && <MetaPixel />}
      {/* Mémoire de défilement : le retour depuis une fiche produit ramène à la
          position exacte dans la liste, sur tout le site. */}
      {/* Filet de secours des images : une vignette ou un service d'images
          injoignable ne doit jamais laisser une photo vide. */}
      <ImageSecours />
      <ScrollKeeper />
      <JsonLd data={organizationLd()} />
      <JsonLd data={webSiteLd()} />
      <Toaster richColors position="top-right" />
    </>
  );
}
