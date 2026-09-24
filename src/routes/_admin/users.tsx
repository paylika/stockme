import { createFileRoute, Link } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/stockme-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { COUNTRY_FLAGS, countryOfCity } from "@/lib/constants";
import { explainDbError } from "@/lib/db-errors";
import { formatFCFA } from "@/lib/format";
import { toast } from "sonner";
import {
  BadgeCheck,
  ChevronDown,
  Eye,
  EyeOff,
  MessageCircle,
  Package,
  Search,
  Shield,
  ShieldCheck,
  ShieldOff,
  Trash2,
  Users as UsersIcon,
  Zap,
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

type BadgeState = { verified: boolean; verified_until: string | null; shop_name: string | null };

type UserProduct = {
  id: string;
  name: string;
  category: string;
  city: string;
  price_fcfa: number;
  promo_price_fcfa: number | null;
  quantity: number;
  moq: number;
  images: string[];
  published: boolean;
  sold_out: boolean;
  dropshipping: boolean;
  created_at: string;
  views: number;
  contacts: number;
  favorites: number;
};

export const Route = createFileRoute("/_admin/users")({
  component: AdminUsersPage,
});

function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyProduct, setBusyProduct] = useState<string | null>(null);
  const [badgeBusyId, setBadgeBusyId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [productsByUser, setProductsByUser] = useState<Record<string, UserProduct[] | "loading">>({});
  const [badges, setBadges] = useState<Record<string, BadgeState>>({});
  const [monthsByUser, setMonthsByUser] = useState<Record<string, number>>({});

  const load = async () => {
    const { data } = await supabase.rpc("admin_list_users", {});
    setUsers((data as AdminUser[] | null) ?? []);
    // État du badge + nom de la boutique (l'admin peut lire les profils).
    // Le vendeur envoie le NOM DE SA BOUTIQUE sur WhatsApp : on doit pouvoir
    // le retrouver ici par une simple recherche.
    const { data: profs } = await supabase.from("profiles").select("id,verified,verified_until,shop_name");
    const map: Record<string, BadgeState> = {};
    (profs as { id: string; verified: boolean; verified_until: string | null; shop_name: string | null }[] | null)?.forEach(
      (p) => {
        map[p.id] = { verified: p.verified, verified_until: p.verified_until, shop_name: p.shop_name };
      },
    );
    setBadges(map);
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
    // Tous les produits du vendeur (publiés ou non) + leurs statistiques.
    const { data, error } = await supabase.rpc("admin_list_user_products", { p_user_id: u.id });
    if (error) {
      toast.error(explainDbError(error.message, "20260718000000_admin_products_full_access.sql"));
      setProductsByUser((prev) => ({ ...prev, [u.id]: [] }));
      return;
    }
    setProductsByUser((prev) => ({ ...prev, [u.id]: (data as UserProduct[] | null) ?? [] }));
  };

  const filtered = useMemo(() => {
    if (!users) return null;
    const term = q.trim().toLowerCase();
    if (!term) return users;
    const digits = term.replace(/\D/g, "");
    return users.filter(
      (u) =>
        u.email?.toLowerCase().includes(term) ||
        u.full_name?.toLowerCase().includes(term) ||
        // Recherche par NOM DE BOUTIQUE (celui que le vendeur envoie sur WhatsApp)
        badges[u.id]?.shop_name?.toLowerCase().includes(term) ||
        (digits.length >= 3 && (!!u.phone?.includes(digits) || !!u.whatsapp?.includes(digits))),
    );
  }, [users, q, badges]);

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

  // ===== Accès complet admin sur un produit =====
  const patchProduct = async (
    userId: string,
    p: UserProduct,
    patch: Record<string, unknown>,
    message: string,
  ) => {
    setBusyProduct(p.id);
    const { error } = await supabase.rpc("admin_update_product", { p_id: p.id, p_patch: patch });
    setBusyProduct(null);
    if (error) return toast.error(explainDbError(error.message, "20260718000000_admin_products_full_access.sql"));
    toast.success(message);
    setProductsByUser((prev) => {
      const list = prev[userId];
      if (!list || list === "loading") return prev;
      return { ...prev, [userId]: list.map((x) => (x.id === p.id ? ({ ...x, ...patch } as UserProduct) : x)) };
    });
  };

  const deleteProduct = async (userId: string, p: UserProduct) => {
    if (!confirm(`Supprimer définitivement « ${p.name} » ?\nCette action est irréversible.`)) return;
    setBusyProduct(p.id);
    const { error } = await supabase.rpc("admin_delete_product", { p_id: p.id });
    setBusyProduct(null);
    if (error) return toast.error(explainDbError(error.message, "20260718000000_admin_products_full_access.sql"));
    toast.success("Produit supprimé");
    setProductsByUser((prev) => {
      const list = prev[userId];
      if (!list || list === "loading") return prev;
      return { ...prev, [userId]: list.filter((x) => x.id !== p.id) };
    });
  };

  const admins = (filtered ?? []).filter((u) => u.is_admin);
  const verifiedCount = Object.values(badges).filter((b) => b.verified).length;

  // ===== Badge « Fournisseur vérifié » (2 000 FCFA, activation manuelle) =====
  const setVerified = async (u: AdminUser, months: number | null, on: boolean) => {
    if (!on && !confirm(`Retirer le badge « Fournisseur vérifié » de ${u.email || u.full_name} ?`)) return;
    setBadgeBusyId(u.id);
    const { error } = on
      ? await supabase.rpc("admin_set_seller_verified", { p_user_id: u.id, p_months: months })
      : await supabase.rpc("admin_unset_seller_verified", { p_user_id: u.id });
    setBadgeBusyId(null);
    if (error) return toast.error(explainDbError(error.message, "20260720000000_verified_seller_badge.sql"));
    toast.success(
      on
        ? `Badge accordé à ${u.email || u.full_name}${months ? ` (${months} mois)` : " (à vie)"}`
        : `Badge retiré à ${u.email || u.full_name}`,
    );
    load();
  };

  return (
    <div>
      <div className="flex items-center gap-2">
        <UsersIcon className="h-5 w-5 text-volt" />
        <p className="text-[11px] font-semibold tracking-[0.2em] uppercase text-muted-foreground">Utilisateurs &amp; accès</p>
      </div>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-2xl sm:text-4xl font-bold tracking-tight">Accès &amp; rôles</h1>
        <span className="text-xs text-muted-foreground">
          {users === null ? "…" : `${users.length} utilisateur(s)`} · {admins.length} admin(s) · {verifiedCount} vérifié(s)
        </span>
      </div>

      <div className="relative mt-6 max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher par nom de boutique, nom, email ou téléphone..."
          className="pl-9"
        />
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full min-w-[1020px] text-sm">
          <thead className="bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left">Nom</th>
              <th className="px-4 py-3 text-left">Email</th>
              <th className="px-4 py-3 text-left">Téléphone</th>
              <th className="px-4 py-3 text-left">Ville</th>
              <th className="px-4 py-3 text-left">Inscrit le</th>
              <th className="px-4 py-3 text-left">Accès</th>
              <th className="px-4 py-3 text-left">Badge vérifié</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {users === null ? (
              <tr><td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">Chargement…</td></tr>
            ) : filtered && filtered.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">Aucun utilisateur</td></tr>
            ) : (filtered ?? []).map((u) => (
              <Fragment key={u.id}>
                <tr className="border-t border-border hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">
                    <button
                      onClick={() => toggleExpand(u)}
                      aria-expanded={expanded === u.id}
                      title="Voir et gérer les produits de ce vendeur"
                      className="inline-flex items-start gap-1.5 text-left hover:text-primary"
                    >
                      <ChevronDown
                        className={`mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${
                          expanded === u.id ? "rotate-180" : ""
                        }`}
                      />
                      <span className="flex flex-col">
                        <span className="whitespace-nowrap font-semibold">
                          {badges[u.id]?.shop_name || u.full_name || "—"}
                        </span>
                        {badges[u.id]?.shop_name && u.full_name && (
                          <span className="whitespace-nowrap text-[11px] font-normal text-muted-foreground">
                            {u.full_name}
                          </span>
                        )}
                      </span>
                    </button>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{u.email || "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3">
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
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                    {COUNTRY_FLAGS[countryOfCity(u.city)] ?? ""} {u.city || "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
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

                  {/* Badge « Fournisseur vérifié » — 2 000 FCFA, activation manuelle */}
                  <td className="px-4 py-3">
                    {badges[u.id]?.verified ? (
                      <div className="flex flex-col items-start gap-1">
                        <VerifiedBadge compact />
                        <span className="text-[10px] text-muted-foreground">
                          {badges[u.id]?.verified_until
                            ? `Jusqu'au ${new Date(badges[u.id].verified_until as string).toLocaleDateString("fr-FR")}`
                            : "À vie"}
                        </span>
                        <button
                          type="button"
                          disabled={badgeBusyId === u.id}
                          onClick={() => setVerified(u, null, false)}
                          className="text-[11px] font-medium text-muted-foreground underline underline-offset-2 hover:text-destructive disabled:opacity-50"
                        >
                          Retirer le badge
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <select
                          value={monthsByUser[u.id] ?? 12}
                          onChange={(e) => setMonthsByUser((prev) => ({ ...prev, [u.id]: Number(e.target.value) }))}
                          aria-label="Durée du badge"
                          className="h-8 rounded-lg border border-border bg-background px-1.5 text-[11px]"
                        >
                          <option value={1}>1 mois</option>
                          <option value={3}>3 mois</option>
                          <option value={12}>12 mois</option>
                          <option value={0}>À vie</option>
                        </select>
                        <button
                          type="button"
                          disabled={badgeBusyId === u.id}
                          onClick={() => {
                            const m = monthsByUser[u.id] ?? 12;
                            setVerified(u, m === 0 ? null : m, true);
                          }}
                          className="inline-flex h-8 items-center gap-1 rounded-lg bg-primary px-2 text-[11px] font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50"
                        >
                          <BadgeCheck className="h-3 w-3" /> Vérifier
                        </button>
                      </div>
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
                    <td colSpan={8} className="px-4 py-5">
                      {(() => {
                        const list = productsByUser[u.id];
                        if (!list || list === "loading") {
                          return <p className="text-xs text-muted-foreground">Chargement des produits…</p>;
                        }
                        if (list.length === 0) {
                          return <p className="text-xs text-muted-foreground">Aucun produit pour ce vendeur.</p>;
                        }
                        const online = list.filter((p) => p.published).length;
                        return (
                          <>
                            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                              {list.length} produit{list.length > 1 ? "s" : ""} · {online} en ligne — vous pouvez tout gérer ici
                            </p>
                            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                              {list.map((p) => {
                                const promo = p.promo_price_fcfa && p.promo_price_fcfa < p.price_fcfa;
                                const busy = busyProduct === p.id;
                                return (
                                  <div key={p.id} className="rounded-xl border border-border bg-card p-3">
                                    <div className="flex gap-3">
                                      <Link
                                        to="/product/$id"
                                        params={{ id: p.id }}
                                        className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-muted"
                                      >
                                        {p.images?.[0] ? (
                                          <img src={p.images[0]} alt="" loading="lazy" className="h-full w-full object-cover" />
                                        ) : (
                                          <span className="grid h-full w-full place-items-center text-muted-foreground">
                                            <Package className="h-4 w-4" />
                                          </span>
                                        )}
                                      </Link>
                                      <div className="min-w-0 flex-1">
                                        <Link
                                          to="/product/$id"
                                          params={{ id: p.id }}
                                          className="block truncate text-sm font-semibold hover:text-primary"
                                          title={p.name}
                                        >
                                          {p.name}
                                        </Link>
                                        <p className="text-[11px] text-muted-foreground">
                                          {formatFCFA(promo ? p.promo_price_fcfa! : p.price_fcfa)}
                                          {" · "}{p.quantity} en stock{p.moq > 1 ? ` · MOQ ${p.moq}` : ""}
                                        </p>
                                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                                          {new Date(p.created_at).toLocaleDateString("fr-FR")} · {p.views} vue(s) · {p.contacts} contact(s)
                                          {p.favorites > 0 ? ` · ${p.favorites} favori(s)` : ""}
                                        </p>
                                        <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px]">
                                          <span className={`rounded-full px-1.5 py-0.5 font-semibold ${p.published ? "bg-success/15 text-success" : "bg-secondary text-muted-foreground"}`}>
                                            {p.published ? "En ligne" : "Dépublié"}
                                          </span>
                                          <span className={`rounded-full px-1.5 py-0.5 ${p.sold_out ? "bg-destructive/15 text-destructive" : "bg-secondary text-muted-foreground"}`}>
                                            {p.sold_out ? "Épuisé" : "Disponible"}
                                          </span>
                                          {p.dropshipping && (
                                            <span className="inline-flex items-center gap-0.5 rounded-full bg-volt/15 px-1.5 py-0.5 font-semibold text-volt">
                                              <Zap className="h-2.5 w-2.5" /> Dropshipping
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </div>

                                    <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-border pt-2">
                                      <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() =>
                                          patchProduct(
                                            u.id,
                                            p,
                                            { published: !p.published },
                                            p.published ? "Produit dépublié" : "Produit publié",
                                          )
                                        }
                                        className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] font-medium transition hover:bg-accent disabled:opacity-50"
                                      >
                                        {p.published ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                                        {p.published ? "Dépublier" : "Publier"}
                                      </button>
                                      <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() =>
                                          patchProduct(
                                            u.id,
                                            p,
                                            { sold_out: !p.sold_out },
                                            p.sold_out ? "Produit remis en stock" : "Produit marqué épuisé",
                                          )
                                        }
                                        className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] font-medium transition hover:bg-accent disabled:opacity-50"
                                      >
                                        <Package className="h-3 w-3" />
                                        {p.sold_out ? "Remettre en stock" : "Marquer épuisé"}
                                      </button>
                                      <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() => {
                                          const raw = prompt(`Nouveau stock pour « ${p.name} » :`, String(p.quantity));
                                          if (raw === null) return;
                                          const n = parseInt(raw, 10);
                                          if (isNaN(n) || n < 0) return toast.error("Stock invalide");
                                          patchProduct(u.id, p, { quantity: n }, "Stock mis à jour");
                                        }}
                                        className="rounded-lg border border-border px-2 py-1 text-[11px] font-medium transition hover:bg-accent disabled:opacity-50"
                                      >
                                        Stock
                                      </button>
                                      <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() => deleteProduct(u.id, p)}
                                        className="ml-auto inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground transition hover:border-destructive/50 hover:text-destructive disabled:opacity-50"
                                      >
                                        <Trash2 className="h-3 w-3" /> Supprimer
                                      </button>
                                    </div>
                                  </div>
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
