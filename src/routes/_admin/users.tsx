import { createFileRoute, Link } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/stockme-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { COUNTRY_FLAGS, countryOfCity } from "@/lib/constants";
import { formatFCFA } from "@/lib/format";
import { toast } from "sonner";
import {
  ChevronDown,
  MessageCircle,
  Package,
  Search,
  Shield,
  ShieldCheck,
  ShieldOff,
  Users as UsersIcon,
} from "lucide-react";

type AdminUser = {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  whatsapp: string | null;
  city: string | null;
  role: string | null;
  created_at: string;
  is_admin: boolean;
};

type UserProduct = {
  id: string;
  name: string;
  price_fcfa: number;
  promo_price_fcfa: number | null;
  quantity: number;
  images: string[];
  published: boolean;
  sold_out: boolean;
  created_at: string;
};

export const Route = createFileRoute("/_admin/users")({
  component: AdminUsersPage,
});

function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [productsByUser, setProductsByUser] = useState<Record<string, UserProduct[] | "loading">>({});

  const load = async () => {
    const { data } = await supabase.rpc("admin_list_users", {});
    setUsers((data as AdminUser[] | null) ?? []);
  };

  useEffect(() => {
    load();
  }, []);

  const toggleExpand = async (u: AdminUser) => {
    if (expanded === u.id) {
      setExpanded(null);
      return;
    }
    setExpanded(u.id);
    if (productsByUser[u.id]) return;
    setProductsByUser((prev) => ({ ...prev, [u.id]: "loading" }));
    const { data } = await supabase
      .from("products")
      .select("id,name,price_fcfa,promo_price_fcfa,quantity,images,published,sold_out,created_at")
      .eq("owner_id", u.id)
      .order("created_at", { ascending: false });
    setProductsByUser((prev) => ({ ...prev, [u.id]: (data as UserProduct[] | null) ?? [] }));
  };

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
              <th className="text-left px-4 py-3 hidden md:table-cell">Téléphone</th>
              <th className="text-left px-4 py-3 hidden lg:table-cell">Ville</th>
              <th className="text-left px-4 py-3 hidden md:table-cell">Inscrit le</th>
              <th className="text-left px-4 py-3">Accès</th>
              <th className="text-right px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {users === null ? (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">Chargement…</td></tr>
            ) : filtered && filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">Aucun utilisateur</td></tr>
            ) : (filtered ?? []).map((u) => (
              <Fragment key={u.id}>
                <tr className="border-t border-border hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">
                    <button
                      onClick={() => toggleExpand(u)}
                      aria-expanded={expanded === u.id}
                      title="Voir les produits publiés"
                      className="inline-flex items-center gap-1.5 text-left hover:text-primary"
                    >
                      <ChevronDown
                        className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${
                          expanded === u.id ? "rotate-180" : ""
                        }`}
                      />
                      <span className="truncate">{u.full_name || "—"}</span>
                    </button>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground truncate max-w-[220px]">{u.email || "—"}</td>
                  <td className="px-4 py-3 hidden md:table-cell whitespace-nowrap">
                    {u.phone || u.whatsapp ? (
                      <div className="flex flex-col gap-0.5 text-xs">
                        {u.phone && <span className="text-muted-foreground">{u.phone}</span>}
                        {u.whatsapp && (
                          <a
                            href={`https://wa.me/${u.whatsapp.replace(/\D/g, "")}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-medium text-volt underline underline-offset-2"
                          >
                            <MessageCircle className="h-3 w-3" /> {u.whatsapp}
                          </a>
                        )}
                      </div>
                    ) : "—"}
                  </td>
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
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => toggleExpand(u)}
                        className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium transition hover:bg-accent"
                      >
                        <Package className="h-3.5 w-3.5" /> Produits
                      </button>
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
                    </div>
                  </td>
                </tr>

                {expanded === u.id && (
                  <tr className="border-t border-border bg-muted/20">
                    <td colSpan={7} className="px-4 py-4">
                      {(() => {
                        const list = productsByUser[u.id];
                        if (!list || list === "loading") {
                          return <p className="text-xs text-muted-foreground">Chargement des produits…</p>;
                        }
                        if (list.length === 0) {
                          return <p className="text-xs text-muted-foreground">Aucun produit publié.</p>;
                        }
                        return (
                          <>
                            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                              {list.length} produit{list.length > 1 ? "s" : ""} publié{list.length > 1 ? "s" : ""}
                            </p>
                            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                              {list.map((p) => {
                                const promo = p.promo_price_fcfa && p.promo_price_fcfa < p.price_fcfa;
                                return (
                                  <Link
                                    key={p.id}
                                    to="/product/$id"
                                    params={{ id: p.id }}
                                    className="flex items-center gap-3 rounded-xl border border-border bg-card p-2 transition hover:border-foreground/30"
                                  >
                                    {p.images?.[0] ? (
                                      <img src={p.images[0]} alt="" loading="lazy" className="h-11 w-11 shrink-0 rounded-lg object-cover" />
                                    ) : (
                                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                                        <Package className="h-4 w-4" />
                                      </span>
                                    )}
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate text-xs font-semibold">{p.name}</p>
                                      <p className="text-[11px] text-muted-foreground">
                                        {formatFCFA(promo ? p.promo_price_fcfa! : p.price_fcfa)} · {p.quantity} en stock
                                      </p>
                                      <div className="mt-1 flex items-center gap-1.5 text-[10px]">
                                        <span className="text-muted-foreground">
                                          {new Date(p.created_at).toLocaleDateString("fr-FR")}
                                        </span>
                                        {!p.published && <span className="rounded-full bg-secondary px-1.5 py-0.5">Dépublié</span>}
                                        {p.sold_out && <span className="rounded-full bg-destructive/15 px-1.5 py-0.5 text-destructive">Épuisé</span>}
                                      </div>
                                    </div>
                                  </Link>
                                );
                              })}
                            </div>
                          </>
                        );
                      })()}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
