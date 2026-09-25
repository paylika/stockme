import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/stockme-client";
import { Button } from "@/components/ui/button";
import { formatFCFA } from "@/lib/format";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2, Package, Sparkles, Trash2 } from "lucide-react";

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
  images: string[];
};

export const Route = createFileRoute("/_admin/products")({
  component: AdminProductsPage,
});

function AdminProductsPage() {
  const [products, setProducts] = useState<AdminProduct[] | null>(null);
  const [owners, setOwners] = useState<Record<string, string>>({});
  /** Suivi de l'enrichissement IA du catalogue (mots-clés de recherche). */
  const [aiTotal, setAiTotal] = useState(0);
  const [aiDone, setAiDone] = useState(0);
  const [aiRunning, setAiRunning] = useState(false);

  const load = async () => {
    const { data: prods } = await supabase
      .from("products")
      .select("id,name,category,price_fcfa,promo_price_fcfa,quantity,moq,city,owner_id,published,sold_out,created_at,images,ai_enriched_at")
      .order("created_at", { ascending: false });
    const list = (prods ?? []) as (AdminProduct & { ai_enriched_at: string | null })[];
    setProducts(list);
    setAiDone(list.filter((p) => p.ai_enriched_at).length);
    setAiTotal(list.length);
    const ids = [...new Set(list.map((p) => p.owner_id))];
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id,full_name").in("id", ids);
      const m: Record<string, string> = {};
      for (const p of (profs ?? []) as { id: string; full_name: string | null }[]) m[p.id] = p.full_name || "—";
      setOwners(m);
    }
  };

  /**
   * Enrichit les fiches avec l'IA : chaque produit reçoit les mots-clés qu'un
   * acheteur taperait vraiment (synonymes, matière, couleur, usage). C'est ce
   * qui rend la recherche par texte ET la recherche par image efficaces.
   */
  const enrichAll = async () => {
    if (!products) return;
    const todo = products.filter((p) => !(p as { ai_enriched_at?: string | null }).ai_enriched_at).map((p) => p.id);
    if (todo.length === 0) {
      toast.success("Toutes les fiches sont déjà enrichies.");
      return;
    }

    setAiRunning(true);
    const { data: session } = await supabase.auth.getSession();
    const token = session.session?.access_token;
    let done = 0;
    let failed = 0;
    let tokensIn = 0;
    let tokensOut = 0;

    try {
      // Par petits lots : on évite les délais trop longs et on voit la progression.
      for (let i = 0; i < todo.length; i += 10) {
        const batch = todo.slice(i, i + 10);
        const res = await fetch("/api/ai/enrich", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ product_ids: batch }),
        });
        const json = (await res.json()) as {
          enriched?: number;
          requested?: number;
          usage?: { input: number; output: number };
          error?: string;
        };
        if (!res.ok) {
          failed += batch.length;
          if (json.error) toast.error(json.error);
        } else {
          done += json.enriched ?? 0;
          failed += (json.requested ?? batch.length) - (json.enriched ?? 0);
          tokensIn += json.usage?.input ?? 0;
          tokensOut += json.usage?.output ?? 0;
        }
        setAiDone((prev) => prev + (json.enriched ?? 0));
      }

      // Coût indicatif : tarif deepseek-flash (heures pleines) ≈ 0,30 $/M entrée
      // et 1,20 $/M sortie → on affiche l'estimation pour information.
      const costUsd = (tokensIn / 1_000_000) * 0.3 + (tokensOut / 1_000_000) * 1.2;
      toast.success(
        `${done} fiche${done > 1 ? "s" : ""} enrichie${done > 1 ? "s" : ""}${failed > 0 ? ` · ${failed} en échec` : ""} · ≈ ${costUsd.toFixed(3)} $ d'IA`,
        { duration: 8000 },
      );
      load();
    } catch {
      toast.error("L'enrichissement s'est interrompu. Relancez : il reprend où il s'est arrêté.");
    } finally {
      setAiRunning(false);
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

      {/* IA : enrichir les fiches pour que la recherche (texte et image) trouve tout */}
      <div className="mt-5 flex flex-wrap items-center gap-4 rounded-2xl border border-volt/40 bg-volt/5 p-4">
        <Sparkles className="h-6 w-6 shrink-0 text-volt" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">Recherche intelligente : enrichir les fiches</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            L'IA ajoute à chaque produit les mots-clés qu'un acheteur taperait vraiment (synonymes, matière, couleur,
            usage). C'est ce qui fait que la recherche par texte <strong className="text-foreground">et</strong> la
            recherche par image trouvent le bon produit. Une fiche enrichie coûte environ 0,0003 $.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <div className="h-1.5 w-40 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-volt transition-[width] duration-500"
                style={{ width: `${aiTotal > 0 ? Math.round((aiDone / aiTotal) * 100) : 0}%` }}
              />
            </div>
            <span className="text-[11px] font-semibold">
              {aiDone}/{aiTotal} fiches enrichies
            </span>
          </div>
        </div>
        <Button
          variant="volt"
          className="h-11"
          disabled={aiRunning || products === null || aiDone >= aiTotal}
          onClick={enrichAll}
        >
          {aiRunning ? (
            <>
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Enrichissement… {aiDone}/{aiTotal}
            </>
          ) : products === null ? (
            <>Chargement…</>
          ) : aiDone >= aiTotal ? (
            <>Toutes les fiches sont enrichies ✓</>
          ) : (
            <>
              <Sparkles className="mr-1.5 h-4 w-4" /> Enrichir les {aiTotal - aiDone} fiches restantes
            </>
          )}
        </Button>
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
              <th className="text-left px-4 py-3 hidden md:table-cell">Publié le</th>
              <th className="text-left px-4 py-3">Statut</th>
              <th className="text-right px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {products === null ? (
              <tr><td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">Chargement…</td></tr>
            ) : products.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">Aucun produit</td></tr>
            ) : products.map((p) => {
              const hasPromo = p.promo_price_fcfa && p.promo_price_fcfa < p.price_fcfa;
              return (
                <tr key={p.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium max-w-[240px]">
                    <div className="flex items-center gap-3">
                      {p.images?.[0] ? (
                        <img
                          src={p.images[0]}
                          alt=""
                          loading="lazy"
                          className="h-11 w-11 shrink-0 rounded-lg border border-border object-cover"
                        />
                      ) : (
                        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                          <Package className="h-4 w-4" />
                        </span>
                      )}
                      <Link to="/product/$id" params={{ id: p.id }} className="truncate hover:text-primary">
                        {p.name}
                      </Link>
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground truncate max-w-[150px]">{owners[p.owner_id] || "—"}</td>
                  <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground">{p.category}</td>
                  <td className="px-4 py-3 text-right font-semibold whitespace-nowrap">
                    {formatFCFA(hasPromo ? p.promo_price_fcfa! : p.price_fcfa)}
                    {hasPromo && <span className="ml-1 text-[10px] font-bold text-volt">PROMO</span>}
                  </td>
                  <td className="px-4 py-3 text-right hidden sm:table-cell text-muted-foreground">{p.quantity}</td>
                  <td className="px-4 py-3 hidden md:table-cell text-muted-foreground text-xs whitespace-nowrap">
                    {new Date(p.created_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                  </td>
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
