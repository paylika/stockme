import { createFileRoute, Link, Navigate, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/stockme-client";
import { signOutSafely, ensureSession } from "@/lib/auth-session";
import { ADMIN_NAV, AdminSidebar } from "@/components/AdminSidebar";
import { buildSeoHead } from "@/lib/seo";
import logoUrl from "@/assets/stockme-logo.jpg";

export const Route = createFileRoute("/_admin")({
  beforeLoad: async ({ location }) => {
    if (typeof window === "undefined") return;
    const sessionData = await ensureSession();
    const user = sessionData?.user;
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
  /** "checking" tant qu'on ne sait pas ; évite d'afficher la console à un visiteur. */
  const [status, setStatus] = useState<"checking" | "allowed" | "denied">("checking");
  const pathname = useRouterState({ select: (r) => r.location.pathname });

  /**
   * CONTRÔLE CÔTÉ NAVIGATEUR.
   *
   * `beforeLoad` ne s'exécute pas lors d'un chargement direct de page (le
   * routeur réutilise la décision du serveur, qui ne voit pas la session).
   * Sans ce contrôle, la console d'administration s'afficherait — vide — à
   * n'importe qui ouvrant /admin dans un nouvel onglet. On vérifie donc ici,
   * une fois la page vivante.
   */
  useEffect(() => {
    let cancel = false;
    (async () => {
      const session = await ensureSession();
      if (cancel) return;
      if (!session?.user) {
        setStatus("denied");
        return;
      }
      setAdminEmail(session.user.email ?? "");
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .eq("role", "admin")
        .maybeSingle();
      if (!cancel) setStatus(data ? "allowed" : "denied");
    })();
    return () => {
      cancel = true;
    };
  }, []);

  if (status === "checking") {
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-5xl px-4 py-10">
          <div className="h-8 w-56 rounded bg-muted shimmer" />
          <p className="mt-4 text-xs text-muted-foreground">Vérification de vos droits…</p>
        </div>
      </div>
    );
  }

  if (status === "denied") return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-background">
      {/* Barre admin dédiée */}
      <header className="sticky top-0 z-40 border-b border-border bg-primary text-primary-foreground">
        <div className="mx-auto flex h-14 max-w-[1700px] items-center gap-3 px-4 sm:px-6 lg:px-8">
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
            onClick={() => signOutSafely().then(() => window.location.assign("/"))}
            className="rounded-lg bg-background/15 px-3 py-1.5 text-xs font-semibold transition hover:bg-background/25"
          >
            Déconnexion
          </button>
        </div>
      </header>

      {/* Navigation admin (mobile) */}
      <nav className="border-b border-border bg-background md:hidden">
        <div className="mx-auto max-w-[1700px] overflow-x-auto no-scrollbar px-3">
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

      {/* Console large : les tableaux admin ont besoin de place */}
      <div className="mx-auto flex max-w-[1700px]">
        {/* Sidebar admin (remplace la sidebar StockMe) */}
        <AdminSidebar />
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
