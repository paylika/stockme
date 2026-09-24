import { createFileRoute, Link, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/stockme-client";
import { ADMIN_NAV, AdminSidebar } from "@/components/AdminSidebar";
import { buildSeoHead } from "@/lib/seo";
import logoUrl from "@/assets/stockme-logo.png";

export const Route = createFileRoute("/_admin")({
  beforeLoad: async ({ location }) => {
    if (typeof window === "undefined") return;
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;
    if (!user) {
      throw redirect({ to: "/auth", search: { redirect: location.pathname, mode: "login" } });
    }
    const { data: adminRole, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (error || !adminRole) throw redirect({ to: "/" });
  },
  head: () => {
    const { meta } = buildSeoHead({ noindex: true, title: "Administration — StockMe" });
    return { meta, links: [] };
  },
  component: AdminLayout,
});

function AdminLayout() {
  const [adminEmail, setAdminEmail] = useState("");
  const pathname = useRouterState({ select: (r) => r.location.pathname });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAdminEmail(data.session?.user?.email ?? ""));
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Barre admin dédiée */}
      <header className="sticky top-0 z-40 border-b border-border bg-primary text-primary-foreground">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <Link to="/admin" className="flex items-center gap-2">
            <img src={logoUrl} alt="StockMe" className="h-8 w-8 rounded-lg bg-background/10 object-contain p-0.5" />
            <span className="font-display text-base font-semibold tracking-tight">
              Stock<span className="font-bold">Me</span>
            </span>
          </Link>
          <span className="ml-1 hidden rounded-full bg-background/15 px-2.5 py-1 text-[11px] font-semibold sm:inline">
            Console admin
          </span>
          <div className="flex-1" />
          {adminEmail && (
            <span className="hidden max-w-[180px] truncate text-xs text-primary-foreground/70 md:inline">{adminEmail}</span>
          )}
          <Link
            to="/"
            className="rounded-lg bg-background/15 px-3 py-1.5 text-xs font-semibold transition hover:bg-background/25"
          >
            Voir le site
          </Link>
          <button
            onClick={() => supabase.auth.signOut().then(() => window.location.assign("/"))}
            className="rounded-lg bg-background/15 px-3 py-1.5 text-xs font-semibold transition hover:bg-background/25"
          >
            Déconnexion
          </button>
        </div>
      </header>

      {/* Navigation admin (mobile) */}
      <nav className="border-b border-border bg-background md:hidden">
        <div className="mx-auto max-w-7xl overflow-x-auto no-scrollbar px-3">
          <div className="flex items-center gap-1 py-2">
            {ADMIN_NAV.map((it) => {
              const active = pathname === it.match || pathname.startsWith(it.match + "/");
              const Icon = it.icon;
              return (
                <Link
                  key={it.to}
                  to={it.to}
                  className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition ${
                    active ? "bg-volt text-volt-foreground shadow-sm shadow-volt/30" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="whitespace-nowrap">{it.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </nav>

      <div className="mx-auto flex max-w-7xl">
        {/* Sidebar admin (remplace la sidebar StockMe) */}
        <AdminSidebar />
        <main className="flex-1 min-w-0 px-4 sm:px-6 py-6 sm:py-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
