import { Link, useLocation } from "@tanstack/react-router";
import { Home, Heart, PlusCircle, User as UserIcon, Package } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export function MobileNav() {
  const { user } = useAuth();
  const { pathname } = useLocation();

  // Same 5 icons whether logged in or not.
  // Unauthenticated taps go through /auth with a redirect back.
  const items = [
    { to: "/", label: "Accueil", icon: Home, public: true },
    {
      to: user ? "/favorites" : "/auth",
      label: "Favoris",
      icon: Heart,
      search: user ? undefined : { redirect: "/favorites", mode: "signup" },
      activeMatch: "/favorites",
    },
    {
      to: user ? "/dashboard/new" : "/auth",
      label: "Vendre",
      icon: PlusCircle,
      primary: true,
      search: user ? undefined : { redirect: "/dashboard/new", mode: "signup" },
      activeMatch: "/dashboard/new",
    },
    {
      to: user ? "/dashboard" : "/auth",
      label: "Mon stock",
      icon: Package,
      search: user ? undefined : { redirect: "/dashboard", mode: "signup" },
      activeMatch: "/dashboard",
    },
    {
      to: user ? "/profile" : "/auth",
      label: "Profil",
      icon: UserIcon,
      search: user ? undefined : { redirect: "/profile", mode: "login" },
      activeMatch: "/profile",
    },
  ];

  return (
    <>
      <div className="h-20 md:hidden" aria-hidden />
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background/95 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-5 max-w-md mx-auto">
          {items.map((it, idx) => {
            const Icon = it.icon;
            const matchPath = (it as any).activeMatch ?? it.to;
            const active =
              pathname === matchPath ||
              (matchPath !== "/" && pathname.startsWith(matchPath));
            if ((it as any).primary) {
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
                className={`flex flex-col items-center justify-center py-2 text-[10px] font-medium ${
                  active ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                <Icon
                  className={`h-5 w-5 ${active ? "text-volt" : ""}`}
                  strokeWidth={1.75}
                />
                <span className="mt-0.5">{it.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
