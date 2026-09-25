import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Megaphone, Package, TrendingUp, Users } from "lucide-react";

export const ADMIN_NAV = [
  { to: "/admin", label: "Pilotage", icon: LayoutDashboard, match: "/admin" },
  { to: "/revenue", label: "Revenus", icon: TrendingUp, match: "/revenue" },
  { to: "/products", label: "Produits", icon: Package, match: "/products" },
  { to: "/ads", label: "Annonces", icon: Megaphone, match: "/ads" },
  { to: "/users", label: "Utilisateurs & accès", icon: Users, match: "/users" },
] as const;

export function AdminSidebar() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });

  return (
    <aside className="hidden md:block w-60 shrink-0 border-r border-border bg-background py-6">
      <div className="space-y-1 px-3">
        {ADMIN_NAV.map((it) => {
          const active = pathname === it.match || pathname.startsWith(it.match + "/");
          const Icon = it.icon;
          return (
            <Link
              key={it.to}
              to={it.to}
              className={[
                "flex items-center gap-3 h-11 rounded-xl px-3 text-sm font-medium transition",
                active
                  ? "bg-volt text-volt-foreground shadow-sm shadow-volt/30"
                  : "text-foreground/80 hover:bg-muted hover:text-foreground",
              ].join(" ")}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" />
              <span>{it.label}</span>
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
