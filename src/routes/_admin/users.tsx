import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/stockme-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { COUNTRY_FLAGS, countryOfCity } from "@/lib/constants";
import { toast } from "sonner";
import { Search, Shield, ShieldCheck, ShieldOff, Users as UsersIcon } from "lucide-react";

type AdminUser = {
  id: string;
  email: string | null;
  full_name: string | null;
  city: string | null;
  role: string | null;
  created_at: string;
  is_admin: boolean;
};

export const Route = createFileRoute("/_admin/users")({
  component: AdminUsersPage,
});

function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    const { data } = await supabase.rpc("admin_list_users", {});
    setUsers((data as AdminUser[] | null) ?? []);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    if (!users) return null;
    const term = q.trim().toLowerCase();
    if (!term) return users;
    return users.filter(
      (u) =>
        u.email?.toLowerCase().includes(term) ||
        u.full_name?.toLowerCase().includes(term),
    );
  }, [users, q]);

  const setRole = async (u: AdminUser, makeAdmin: boolean) => {
    setBusyId(u.id);
    const { error } = await supabase.rpc("set_user_role", {
      p_user_id: u.id,
      p_role: makeAdmin ? "admin" : "user",
    });
    setBusyId(null);
    if (error) return toast.error(error.message);
    toast.success(makeAdmin ? `Admin accordé à ${u.email || u.full_name}` : `Accès admin retiré de ${u.email || u.full_name}`);
    load();
  };

  const admins = (filtered ?? []).filter((u) => u.is_admin);

  return (
    <div>
      <div className="flex items-center gap-2">
        <UsersIcon className="h-5 w-5 text-volt" />
        <p className="text-[11px] font-semibold tracking-[0.2em] uppercase text-muted-foreground">Utilisateurs &amp; accès</p>
      </div>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-2xl sm:text-4xl font-bold tracking-tight">Accès &amp; rôles</h1>
        <span className="text-xs text-muted-foreground">
          {users === null ? "…" : `${users.length} utilisateur(s)`} · {admins.length} admin(s)
        </span>
      </div>

      <div className="mt-6 relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher par email ou nom..."
          className="pl-9"
        />
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3">Nom</th>
              <th className="text-left px-4 py-3 hidden sm:table-cell">Email</th>
              <th className="text-left px-4 py-3 hidden lg:table-cell">Ville</th>
              <th className="text-left px-4 py-3 hidden md:table-cell">Inscrit le</th>
              <th className="text-left px-4 py-3">Accès</th>
              <th className="text-right px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {users === null ? (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">Chargement…</td></tr>
            ) : filtered && filtered.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">Aucun utilisateur</td></tr>
            ) : (filtered ?? []).map((u) => (
              <tr key={u.id} className="border-t border-border hover:bg-muted/30">
                <td className="px-4 py-3 font-medium">{u.full_name || "—"}</td>
                <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground truncate max-w-[220px]">{u.email || "—"}</td>
                <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground whitespace-nowrap">
                  {COUNTRY_FLAGS[countryOfCity(u.city)] ?? ""} {u.city || "—"}
                </td>
                <td className="px-4 py-3 hidden md:table-cell text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(u.created_at).toLocaleDateString("fr-FR")}
                </td>
                <td className="px-4 py-3">
                  {u.is_admin ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-volt/15 px-2 py-0.5 text-xs font-semibold text-volt">
                      <ShieldCheck className="h-3 w-3" /> Admin
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs">
                      <Shield className="h-3 w-3" /> Utilisateur
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {u.is_admin ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setRole(u, false)}
                      disabled={busyId === u.id}
                      className="text-destructive hover:border-destructive/50"
                    >
                      <ShieldOff className="mr-1 h-3.5 w-3.5" /> Retirer l'accès
                    </Button>
                  ) : (
                    <Button variant="volt" size="sm" onClick={() => setRole(u, true)} disabled={busyId === u.id}>
                      <ShieldCheck className="mr-1 h-3.5 w-3.5" /> Donner accès admin
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
