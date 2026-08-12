import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/stockme-client";
import { Header } from "@/components/Header";
import { MobileNav } from "@/components/MobileNav";
import { ShieldAlert, Users, Package } from "lucide-react";

type Profile = {
  id: string; full_name: string | null; phone: string | null;
  whatsapp: string | null; city: string | null; role: string; created_at: string;
};

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async ({ location }) => {
    if (typeof window === "undefined") return;

    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;

    if (!user) {
      const redirectTo = `${location.pathname}${location.searchStr}${location.hash}`;
      throw redirect({ to: "/auth", search: { redirect: redirectTo, mode: "login" } });
    }

    const { data: adminRole, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (error || !adminRole) throw redirect({ to: "/" });
  },
  component: Admin,
});

function Admin() {
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [productCount, setProductCount] = useState<number>(0);

  useEffect(() => {
    (async () => {
      const [{ data: profs }, { count }] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at", { ascending: false }),
        supabase.from("products").select("*", { count: "exact", head: true }),
      ]);
      setProfiles((profs ?? []) as Profile[]);
      setProductCount(count ?? 0);
    })();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6 sm:py-10">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-volt" />
          <p className="text-xs font-medium tracking-[0.18em] uppercase text-muted-foreground">Administration</p>
        </div>
        <h1 className="mt-2 text-2xl sm:text-4xl font-bold tracking-tight">Tableau de bord admin</h1>

        <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-5">
          <Stat icon={Users} label="Utilisateurs" value={profiles?.length ?? "..."} />
          <Stat icon={Package} label="Produits" value={productCount} />
        </div>

        <h2 className="mt-10 text-lg sm:text-xl font-semibold">Utilisateurs inscrits</h2>
        <div className="mt-4 rounded-xl border border-border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3">Nom</th>
                <th className="text-left px-4 py-3 hidden sm:table-cell">Ville</th>
                <th className="text-left px-4 py-3">WhatsApp</th>
                <th className="text-left px-4 py-3 hidden md:table-cell">Rôle</th>
                <th className="text-left px-4 py-3 hidden md:table-cell">Inscrit le</th>
              </tr>
            </thead>
            <tbody>
              {profiles === null ? (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">Chargement...</td></tr>
              ) : profiles.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">Aucun utilisateur</td></tr>
              ) : profiles.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="px-4 py-3 font-medium">{p.full_name || "—"}</td>
                  <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground">{p.city || "—"}</td>
                  <td className="px-4 py-3">
                    {p.whatsapp ? (
                      <a href={`https://wa.me/${p.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="text-volt underline underline-offset-2 font-medium">{p.whatsapp}</a>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs">{p.role}</span>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-muted-foreground text-xs">
                    {new Date(p.created_at).toLocaleDateString("fr-FR")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Link to="/" className="mt-6 inline-block text-sm text-muted-foreground hover:text-foreground underline underline-offset-2">← Retour à l'accueil</Link>
      </div>
      <MobileNav />
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: any; label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium tracking-wider uppercase text-muted-foreground">{label}</span>
        <Icon className="h-4 w-4 text-volt" />
      </div>
      <div className="mt-2 text-2xl sm:text-3xl font-bold">{value}</div>
    </div>
  );
}
