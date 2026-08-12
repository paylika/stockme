import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/stockme-client";
import { Header } from "@/components/Header";
import { MobileNav } from "@/components/MobileNav";
import { MobileFooter } from "@/components/MobileFooter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatFCFA } from "@/lib/format";
import { Edit2, MapPin, Package, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";

type P = { id: string; name: string; price_fcfa: number; quantity: number; moq: number; city: string; category: string; images: string[] };

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const { pathname } = useLocation();
  const [items, setItems] = useState<P[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [qty, setQty] = useState<number>(0);

  const load = async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { data } = await supabase.from("products").select("id,name,price_fcfa,quantity,moq,city,category,images")
      .eq("owner_id", u.user.id).order("created_at", { ascending: false });
    setItems((data ?? []) as P[]);
  };

  useEffect(() => { load(); }, []);

  const remove = async (id: string) => {
    if (!confirm("Supprimer ce produit ?")) return;
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Produit supprimé");
    load();
  };

  const saveQty = async (id: string) => {
    const { error } = await supabase.from("products").update({ quantity: qty }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Quantité mise à jour");
    setEditing(null);
    load();
  };

  if (pathname !== "/dashboard") return <Outlet />;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium tracking-[0.18em] uppercase text-muted-foreground">Espace fournisseur</p>
            <h1 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight">Mon stock</h1>
            <p className="mt-1 text-muted-foreground">{items?.length ?? 0} produit(s) en ligne</p>
          </div>
          <Link to="/dashboard/new">
            <Button variant="volt" className="h-11"><Plus className="h-4 w-4 mr-1" /> Ajouter un produit</Button>
          </Link>
        </div>

        <div className="mt-8">
          {items === null ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-40 rounded-xl shimmer bg-muted" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="grid place-items-center py-24 text-center border border-dashed border-border rounded-2xl">
              <Package className="h-10 w-10 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">Aucun produit</h3>
              <p className="mt-1 text-sm text-muted-foreground">Listez votre premier produit pour qu'il soit visible.</p>
              <Link to="/dashboard/new" className="mt-4">
                <Button variant="volt"><Plus className="h-4 w-4 mr-1" /> Ajouter</Button>
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map((p) => (
                <div key={p.id} className="rounded-xl border border-border bg-card overflow-hidden">
                  <Link to="/product/$id" params={{ id: p.id }} className="block aspect-[4/3] bg-muted overflow-hidden">
                    {p.images[0] ? (
                      <img src={p.images[0]} alt={p.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="grid h-full place-items-center text-muted-foreground"><Package className="h-10 w-10" /></div>
                    )}
                  </Link>
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold line-clamp-1">{p.name}</h3>
                      <button onClick={() => remove(p.id)} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <MapPin className="h-3 w-3" /> {p.city} · {p.category}
                    </p>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="font-bold">{formatFCFA(p.price_fcfa)}</span>
                      {editing === p.id ? (
                        <div className="flex items-center gap-1">
                          <Input type="number" value={qty} onChange={(e) => setQty(parseInt(e.target.value) || 0)} className="h-8 w-20" />
                          <button onClick={() => saveQty(p.id)} className="grid h-8 w-8 place-items-center rounded-md bg-volt text-volt-foreground"><Save className="h-3.5 w-3.5" /></button>
                          <button onClick={() => setEditing(null)} className="grid h-8 w-8 place-items-center rounded-md border border-border"><X className="h-3.5 w-3.5" /></button>
                        </div>
                      ) : (
                        <button onClick={() => { setEditing(p.id); setQty(p.quantity); }}
                          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                          Stock: <span className="font-semibold text-foreground">{p.quantity}</span>
                          <Edit2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <MobileFooter />
      <MobileNav />
    </div>
  );
}
