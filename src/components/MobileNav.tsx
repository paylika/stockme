import { Link, useLocation } from "@tanstack/react-router";
import { IconHome, IconHeart, IconSell, IconUser, IconStock } from "@/components/icons";
import { Lock, MessageCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useMobileAction } from "@/lib/mobile-action";

export function MobileNav() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  // Sur une fiche produit, le bouton central devient l'action d'achat :
  // la navigation reste entièrement visible (on ne masque plus la barre).
  const action = useMobileAction();

  // Same 5 icons whether logged in or not.
  // Unauthenticated taps go through /auth with a redirect back.
  const items = [
    { to: "/", label: "Accueil", icon: IconHome, public: true },
    { to: "/dropshipping", label: "Dropshipping", icon: IconStock, activeMatch: "/dropshipping" },
    {
      to: user ? "/dashboard/new" : "/auth",
      label: "Publier",
      icon: IconSell,
      primary: true,
      search: user ? undefined : { redirect: "/dashboard/new", mode: "signup" },
      activeMatch: "/dashboard/new",
    },
    {
      to: user ? "/favorites" : "/auth",
      label: "Favoris",
      icon: IconHeart,
      search: user ? undefined : { redirect: "/favorites", mode: "signup" },
      activeMatch: "/favorites",
    },
    {
      to: user ? "/profile" : "/auth",
      label: "Profil",
      icon: IconUser,
      search: user ? undefined : { redirect: "/profile", mode: "login" },
      activeMatch: "/profile",
    },
  ];

  return (
    <>
      <div className="h-20 md:hidden" aria-hidden />
      {/* Fond opaque : `backdrop-filter` sur une barre fixe scintille sur iOS
          pendant le défilement (la barre « casse »). */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background pb-[env(safe-area-inset-bottom)] md:hidden">
        <div className="grid grid-cols-5 max-w-md mx-auto">
          {items.map((it, idx) => {
            const Icon = it.icon;
            const matchPath = (it as any).activeMatch ?? it.to;
            const active =
              pathname === matchPath ||
              (matchPath !== "/" && pathname.startsWith(matchPath));
            if ((it as any).primary) {
              // Action d'achat prioritaire sur une fiche produit
              if (action) {
                const external = action.href.startsWith("http");
                const inner = (
                  <>
                    <span className="grid h-12 w-12 place-items-center rounded-full bg-volt text-volt-foreground shadow-lg shadow-volt/40">
                      {action.icon === "login" ? (
                        <Lock className="h-5 w-5" strokeWidth={2.25} />
                      ) : (
                        <MessageCircle className="h-5 w-5" strokeWidth={2.25} />
                      )}
                    </span>
                    <span className="mt-0.5 text-[10px] font-bold">{action.label}</span>
                  </>
                );

                return external ? (
                  <a
                    key={idx}
                    href={action.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={action.ariaLabel}
                    className="flex flex-col items-center justify-center py-2 -mt-5"
                  >
                    {inner}
                  </a>
                ) : (
                  <a
                    key={idx}
                    href={action.href}
                    aria-label={action.ariaLabel}
                    className="flex flex-col items-center justify-center py-2 -mt-5"
                  >
                    {inner}
                  </a>
                );
              }

              return (
                <Link
                  key={idx}
                  to={it.to}
                  search={(it as any).search}
                  className="flex flex-col items-center justify-center py-2 -mt-5"
                >
                  <span className="grid h-12 w-12 place-items-center rounded-full bg-volt text-volt-foreground shadow-lg shadow-volt/40">
                    <Icon className="h-5 w-5" strokeWidth={2.25} />
                  </span>
                  <span className="mt-0.5 text-[10px] font-medium">{it.label}</span>
                </Link>
              );
            }
            return (
              <Link
                key={idx}
                to={it.to}
                search={(it as any).search}
                className={`flex flex-col items-center justify-center py-2 text-[10px] font-medium transition-colors ${
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <span
                  className={`grid h-7 w-7 place-items-center rounded-full transition-all ${
                    active ? "bg-volt/15 text-volt" : ""
                  }`}
                >
                  <Icon className="h-5 w-5" strokeWidth={active ? 2.15 : 1.75} />
                </span>
                <span className="mt-0.5">{it.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
