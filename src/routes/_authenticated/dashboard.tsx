import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/stockme-client";
import { Header } from "@/components/Header";
import { MobileNav } from "@/components/MobileNav";
import { MobileFooter } from "@/components/MobileFooter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatFCFA } from "@/lib/format";
import { AlertTriangle, BadgeCheck, Camera, Edit2, MapPin, Package, Pencil, Plus, Save, Trash2, UserRound, X } from "lucide-react";
import { StatusSwitch } from "@/components/StatusSwitch";
import { BoostButton, SellerMoneyProvider } from "@/components/SellerMoneyProvider";
import { toast } from "sonner";

type P = {
  id: string;
  name: string;
  price_fcfa: number;
  quantity: number;
  moq: number;
  city: string;
  category: string;
  images: string[];
  published: boolean;
  sold_out: boolean;
  dropshipping: boolean;
};

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const { pathname } = useLocation();
  const [items, setItems] = useState<P[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [qty, setQty] = useState<number>(0);
  const [seller, setSeller] = useState<{ shop_name: string | null; full_name: string | null; avatar_url: string | null; verified: boolean; verified_until: string | null } | null>(null);

  const load = async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const [{ data }, { data: prof }] = await Promise.all([
      supabase
        .from("products")
        .select("id,name,price_fcfa,quantity,moq,city,category,images,published,sold_out,dropshipping")
        .eq("owner_id", u.user.id)
        .order("created_at", { ascending: false }),
      supabase.from("profiles").select("shop_name,full_name,avatar_url,verified,verified_until").eq("id", u.user.id).maybeSingle(),
    ]);
    setItems((data ?? []) as P[]);
    setSeller(
      (prof as { shop_name: string | null; full_name: string | null; avatar_url: string | null; verified: boolean; verified_until: string | null } | null) ??
        null,
    );
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

  const togglePublished = async (p: P, val: boolean) => {
    const { error } = await supabase.from("products").update({ published: val }).eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success(val ? "Produit publié" : "Produit dépublié");
    load();
  };

  const toggleSoldOut = async (p: P, val: boolean) => {
    const { error } = await supabase.from("products").update({ sold_out: val }).eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success(val ? "Marqué épuisé" : "Disponible à la vente");
    load();
  };

  const toggleDropshipping = async (p: P, val: boolean) => {
    const { error } = await supabase.from("products").update({ dropshipping: val }).eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success(val ? "Produit en dropshipping (livraison sur commande)" : "Produit en vente en gros");
    load();
  };

  if (pathname !== "/dashboard") return <Outlet />;

  const sellerName = seller?.shop_name || seller?.full_name || "Ma boutique";
  const initials = sellerName.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const isVerified =
    !!seller?.verified && (!seller.verified_until || new Date(seller.verified_until) > new Date());

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-center gap-4">
            {/* Photo de profil du vendeur dans son espace */}
            <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full bg-volt text-lg font-bold text-volt-foreground">
              {seller?.avatar_url ? (
                <img src={seller.avatar_url} alt={seller.shop_name || seller.full_name || "Ma boutique"} className="h-full w-full object-cover" />
              ) : (
                <span>{initials}</span>
              )}
            </div>
            <div>
              <p className="text-xs font-medium tracking-[0.18em] uppercase text-muted-foreground">Espace fournisseur</p>
              <h1 className="mt-1 text-3xl sm:text-4xl font-bold tracking-tight">{sellerName}</h1>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                <span>{items?.length ?? 0} produit(s) en ligne</span>
                <Link to="/profile" className="inline-flex items-center gap-1 hover:text-foreground">
                  <UserRound className="h-3.5 w-3.5" /> Mon profil
                </Link>
                <Link to="/profile/edit" className="inline-flex items-center gap-1 hover:text-foreground">
                  <Camera className="h-3.5 w-3.5" /> {seller?.avatar_url ? "Changer ma photo" : "Ajouter ma photo"}
                </Link>
              </p>
            </div>
          </div>
          <Link to="/dashboard/new">
            <Button variant="volt" className="h-11"><Plus className="h-4 w-4 mr-1" /> Ajouter un produit</Button>
          </Link>
        </div>

        {/* Nudge : la vérification est le principal levier de confiance */}
        {seller && !isVerified && (
          <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-volt/40 bg-volt/10 p-4">
            <BadgeCheck className="h-6 w-6 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">Votre boutique n'est pas encore vérifiée</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                Le badge <strong className="text-foreground">Fournisseur vérifié</strong> s'affiche sur toutes vos
                cartes produit et vous fait <strong className="text-foreground">remonter dans la recherche</strong>.
                Sans lui : 2 photos par produit et 10 produits publiés maximum. Vérifié : 5 photos, publications
                illimitées.
              </p>
            </div>
            <Link to="/profile">
              <Button variant="volt" className="h-11">
                Vérifier ma boutique — 2 000 FCFA
              </Button>
            </Link>
          </div>
        )}

        <SellerMoneyProvider defaultPhone={null} onChanged={load}>

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
                <div key={p.id} className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
                  <Link to="/product/$id" params={{ id: p.id }} className="block aspect-[4/3] bg-muted overflow-hidden">
                    {p.images[0] ? (
                      <img src={p.images[0]} alt={p.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="grid h-full place-items-center text-muted-foreground"><Package className="h-10 w-10" /></div>
                    )}
                  </Link>
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <h3 className="font-semibold line-clamp-1">{p.name}</h3>
                        <Link
                          to="/dashboard/edit/$id"
                          params={{ id: p.id }}
                          className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-foreground/40"
                          aria-label="Modifier"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                      <button onClick={() => remove(p.id)} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <MapPin className="h-3 w-3" /> {p.city} · {p.category}
                    </p>
                    {(!p.images || p.images.length === 0) && (
                      <Link
                        to="/dashboard/edit/$id"
                        params={{ id: p.id }}
                        className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-volt/15 px-2.5 py-1 text-[11px] font-semibold text-volt"
                      >
                        <AlertTriangle className="h-3 w-3" /> Photo manquante — ajoutez-en une
                      </Link>
                    )}
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

                    {/* Statut + actions rapides */}
                    <div className="mt-3 space-y-1.5 border-t border-border pt-3">
                      <StatusSwitch
                        label="En ligne"
                        hint={p.published ? "Visible par les acheteurs" : "Masqué du catalogue"}
                        checked={p.published}
                        onChange={(v) => togglePublished(p, v)}
                        actionLabel={p.published ? "Masquer ce produit du catalogue" : "Mettre ce produit en ligne"}
                      />
                      <StatusSwitch
                        label="Disponible"
                        hint={p.sold_out ? "Marqué épuisé" : "En stock"}
                        checked={!p.sold_out}
                        onChange={(v) => toggleSoldOut(p, !v)}
                        actionLabel={p.sold_out ? "Marquer ce produit comme disponible" : "Marquer ce produit comme épuisé"}
                      />
                      <StatusSwitch
                        label="Dropshipping"
                        hint={p.dropshipping ? "Livraison sur commande" : "Vente en gros (lots)"}
                        checked={p.dropshipping}
                        tone="volt"
                        onChange={(v) => toggleDropshipping(p, v)}
                        actionLabel={p.dropshipping ? "Repasser en vente en gros" : "Passer ce produit en dropshipping"}
                      />
                      <Link
                        to="/dashboard/edit/$id"
                        params={{ id: p.id }}
                        className="mt-1 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-border text-[13px] font-semibold hover:bg-accent"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Modifier le produit
                      </Link>
                      <div className="flex justify-center pt-1">
                        <BoostButton productId={p.id} productName={p.name} />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        </SellerMoneyProvider>
      </div>
      <MobileFooter />
      <MobileNav />
    </div>
  );
}
