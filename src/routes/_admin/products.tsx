import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/stockme-client";
import { Button } from "@/components/ui/button";
import { formatFCFA } from "@/lib/format";
import { toast } from "sonner";
import { Eye, EyeOff, Package, Trash2 } from "lucide-react";

type AdminProduct = {
  id: string;
  name: string;
  category: string;
  price_fcfa: number;
  promo_price_fcfa: number | null;
  quantity: number;
  moq: number;
  city: string | null;
  owner_id: string;
  published: boolean;
  sold_out: boolean;
  created_at: string;
};

export const Route = createFileRoute("/_admin/products")({
  component: AdminProductsPage,
});

function AdminProductsPage() {
  const [products, setProducts] = useState<AdminProduct[] | null>(null);
  const [owners, setOwners] = useState<Record<string, string>>({});

  const load = async () => {
    const { data: prods } = await supabase
      .from("products")
      .select("id,name,category,price_fcfa,promo_price_fcfa,quantity,moq,city,owner_id,published,sold_out,created_at")
      .order("created_at", { ascending: false });
    const list = (prods ?? []) as AdminProduct[];
    setProducts(list);
    const ids = [...new Set(list.map((p) => p.owner_id))];
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id,full_name").in("id", ids);
      const m: Record<string, string> = {};
      for (const p of (profs ?? []) as { id: string; full_name: string | null }[]) m[p.id] = p.full_name || "—";
      setOwners(m);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const toggle = async (p: AdminProduct, field: "published" | "sold_out", value: boolean) => {
    const payload = field === "published" ? { published: value } : { sold_out: value };
    const { error } = await supabase.from("products").update(payload).eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success(field === "published" ? (value ? "Produit publié" : "Produit dépublié") : value ? "Marqué épuisé" : "Disponible");
    load();
  };

  const remove = async (p: AdminProduct) => {
    if (!confirm(`Supprimer « ${p.name} » ?`)) return;
    const { error } = await supabase.from("products").delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Produit supprimé");
    load();
  };

  const stats = useMemo(() => {
    const list = products ?? [];
    return {
      total: list.length,
      published: list.filter((p) => p.published).length,
      unpublished: list.filter((p) => !p.published).length,
      soldOut: list.filter((p) => p.sold_out).length,
    };
  }, [products]);

  return (
    <div>
      <div className="flex items-center gap-2">
        <Package className="h-5 w-5 text-volt" />
        <p className="text-[11px] font-semibold tracking-[0.2em] uppercase text-muted-foreground">Produits</p>
      </div>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-2xl sm:text-4xl font-bold tracking-tight">Pilotage des annonces</h1>
        <span className="text-xs text-muted-foreground">
          {stats.total} produits · {stats.published} en ligne · {stats.unpublished} dépubliés · {stats.soldOut} épuisés
        </span>
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3">Produit</th>
              <th className="text-left px-4 py-3 hidden sm:table-cell">Vendeur</th>
              <th className="text-left px-4 py-3 hidden lg:table-cell">Catégorie</th>
              <th className="text-right px-4 py-3">Prix</th>
              <th className="text-right px-4 py-3 hidden sm:table-cell">Stock</th>
              <th className="text-left px-4 py-3">Statut</th>
              <th className="text-right px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {products === null ? (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">Chargement…</td></tr>
            ) : products.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">Aucun produit</td></tr>
            ) : products.map((p) => {
              const hasPromo = p.promo_price_fcfa && p.promo_price_fcfa < p.price_fcfa;
              return (
                <tr key={p.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium max-w-[220px] truncate">
                    <Link to="/product/$id" params={{ id: p.id }} className="hover:text-primary">{p.name}</Link>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground truncate max-w-[150px]">{owners[p.owner_id] || "—"}</td>
                  <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground">{p.category}</td>
                  <td className="px-4 py-3 text-right font-semibold whitespace-nowrap">
                    {formatFCFA(hasPromo ? p.promo_price_fcfa! : p.price_fcfa)}
                    {hasPromo && <span className="ml-1 text-[10px] font-bold text-volt">PROMO</span>}
                  </td>
                  <td className="px-4 py-3 text-right hidden sm:table-cell text-muted-foreground">{p.quantity}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {p.sold_out ? (
                      <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-semibold text-destructive">Épuisé</span>
                    ) : p.published ? (
                      <span className="rounded-full bg-volt/15 px-2 py-0.5 text-[11px] font-semibold text-volt">En ligne</span>
                    ) : (
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px]">Dépublié</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => toggle(p, "published", !p.published)}
                        className="grid h-8 w-8 place-items-center rounded-md border border-border hover:bg-accent"
                        title={p.published ? "Dépublier" : "Publier"}
                      >
                        {p.published ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                      <button
                        onClick={() => toggle(p, "sold_out", !p.sold_out)}
                        className="grid h-8 w-8 place-items-center rounded-md border border-border hover:bg-accent"
                        title={p.sold_out ? "Remettre en stock" : "Marquer épuisé"}
                      >
                        <Package className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => remove(p)}
                        className="grid h-8 w-8 place-items-center rounded-md border border-border text-muted-foreground hover:border-destructive/50 hover:text-destructive"
                        title="Supprimer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 text-xs text-muted-foreground">
        Attention : dépublié = invisible pour les acheteurs ; épuisé = visible mais contact désactivé.
      </div>
    </div>
  );
}
