import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/stockme-client";
import { Header } from "@/components/Header";
import { MobileNav } from "@/components/MobileNav";
import { MobileFooter } from "@/components/MobileFooter";
import { Button } from "@/components/ui/button";
import { StatusSwitch } from "@/components/StatusSwitch";
import { useAuth } from "@/hooks/useAuth";
import { formatFCFA } from "@/lib/format";
import { COUNTRY_FLAGS, countryOfCity } from "@/lib/constants";
import { toast } from "sonner";
import {
  CheckCircle2,
  Eye,
  LogOut,
  Mail,
  MapPin,
  MessageCircle,
  Package,
  Pencil,
  Phone,
  Trash2,
  Zap,
} from "lucide-react";

type Profile = {
  full_name: string | null;
  shop_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  city: string | null;
  whatsapp: string | null;
  phone: string | null;
  role: string;
};

type Product = {
  id: string;
  name: string;
  price_fcfa: number;
  promo_price_fcfa: number | null;
  quantity: number;
  moq: number;
  category: string;
  images: string[];
  published: boolean;
  sold_out: boolean;
  dropshipping: boolean;
};

type Stats = {
  total_products: number;
  total_views: number;
  total_contacts: number;
  total_favorites: number;
};

export const Route = createFileRoute("/_authenticated/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const [{ data: prof }, { data: prods }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", u.user.id).maybeSingle(),
      supabase
        .from("products")
        .select("id,name,price_fcfa,promo_price_fcfa,quantity,moq,category,images,published,sold_out,dropshipping")
        .eq("owner_id", u.user.id)
        .order("created_at", { ascending: false }),
    ]);
    setProfile((prof as Profile | null) ?? null);
    setProducts((prods as Product[] | null) ?? []);
    supabase.rpc("get_seller_stats", { p_seller_id: u.user.id }).then(({ data }) =>
      setStats((data as Stats | null) ?? null),
    );
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const toggle = async (p: Product, field: "published" | "sold_out" | "dropshipping", val: boolean) => {
    const payload =
      field === "published" ? { published: val } : field === "sold_out" ? { sold_out: val } : { dropshipping: val };
    setSavingId(p.id);
    const { error } = await supabase.from("products").update(payload).eq("id", p.id);
    if (error) {
      setSavingId(null);
      return toast.error(error.message);
    }
    toast.success(
      field === "published"
        ? val
          ? "Produit en ligne — visible par les acheteurs"
          : "Produit masqué du catalogue"
        : field === "sold_out"
        ? val
          ? "Produit marqué épuisé"
          : "Produit marqué disponible"
        : val
        ? "Dropshipping activé"
        : "Vente en gros activée",
    );
    await load();
    setSavingId(null);
  };

  const remove = async (p: Product) => {
    if (!confirm(`Supprimer « ${p.name} » ?`)) return;
    const { error } = await supabase.from("products").delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Produit supprimé");
    load();
  };

  const logout = async () => {
    await supabase.auth.signOut();
    toast.success("Déconnecté");
    navigate({ to: "/" });
  };

  const displayName = profile?.shop_name || profile?.full_name || user?.email || "Mon profil";
  const initials = (displayName || "U").split(/\s+/).map((s) => s[0]).join("").slice(0, 2).toUpperCase();
  const city = profile?.city;
  const online = (products ?? []).filter((p) => p.published).length;

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="mx-auto max-w-4xl px-4 py-10">
          <div className="flex items-center gap-5">
            <div className="h-24 w-24 rounded-full shimmer bg-muted" />
            <div className="space-y-3">
              <div className="h-6 w-48 shimmer bg-muted rounded" />
              <div className="h-4 w-32 shimmer bg-muted rounded" />
            </div>
          </div>
        </div>
        <MobileFooter />
        <MobileNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* ===== En-tête façon Instagram ===== */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 py-8">
          <div className="flex flex-col sm:flex-row sm:items-center gap-6">
            <div className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-full bg-volt text-2xl font-bold text-volt-foreground">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <span>{initials}</span>
              )}
            </div>

            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="font-display text-2xl font-bold tracking-tight truncate">{displayName}</h1>
                <Link to="/profile/edit">
                  <Button variant="outline" size="sm">Modifier le profil</Button>
                </Link>
              </div>

              <div className="mt-4 grid max-w-md grid-cols-4 gap-4 text-center sm:text-left">
                <Stat value={online} label="Produits" />
                <Stat value={stats?.total_views ?? 0} label="Vues" />
                <Stat value={stats?.total_contacts ?? 0} label="Contacts" />
                <Stat value={stats?.total_favorites ?? 0} label="Favoris" />
              </div>
            </div>
          </div>

          {/* Bio */}
          <div className="mt-6 space-y-1.5 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-semibold">{profile?.full_name || "Vendeur"}</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-volt/15 px-2 py-0.5 text-[11px] font-semibold text-volt">
                <CheckCircle2 className="h-3 w-3" /> Vérifié
              </span>
            </div>
            {profile?.bio && <p className="whitespace-pre-line text-muted-foreground leading-relaxed">{profile.bio}</p>}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-muted-foreground">
              {city && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" /> {COUNTRY_FLAGS[countryOfCity(city)] ?? ""} {city}
                </span>
              )}
              {profile?.whatsapp && (
                <span className="inline-flex items-center gap-1.5">
                  <MessageCircle className="h-3.5 w-3.5" /> {profile.whatsapp}
                </span>
              )}
              {profile?.phone && (
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5" /> {profile.phone}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" /> {user?.email}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ===== Produits (Mon stock déplacé ici) ===== */}
      <div className="mx-auto max-w-4xl px-4 sm:px-6 py-6 sm:py-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg sm:text-xl font-bold tracking-tight">Mes produits ({products?.length ?? 0})</h2>
          <Link to="/dashboard/new">
            <Button variant="volt" size="sm"><Package className="mr-1 h-4 w-4" /> Ajouter</Button>
          </Link>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Activez ou désactivez chaque réglage d'un simple appui : la ligne entière est cliquable.
        </p>

        {products === null ? (
          <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-56 rounded-2xl shimmer bg-muted" />)}
          </div>
        ) : products.length === 0 ? (
          <div className="mt-5 grid place-items-center py-16 text-center border border-dashed border-border rounded-3xl bg-muted/30">
            <Package className="h-10 w-10 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-semibold">Aucun produit</h3>
            <p className="mt-1 text-sm text-muted-foreground">Listez votre premier produit pour le vendre en gros ou en dropshipping.</p>
            <Link to="/dashboard/new" className="mt-4"><Button variant="volt">Ajouter un produit</Button></Link>
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-3">
            {products.map((p) => {
              const hasPromo = p.promo_price_fcfa && p.promo_price_fcfa < p.price_fcfa;
              const saving = savingId === p.id;
              return (
                <div key={p.id} className="flex gap-3 rounded-2xl border border-border bg-card p-3 shadow-sm">
                  <Link
                    to="/product/$id"
                    params={{ id: p.id }}
                    className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-muted sm:h-28 sm:w-28"
                  >
                    {p.images[0] ? (
                      <img src={p.images[0]} alt={p.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="grid h-full place-items-center text-muted-foreground"><Package className="h-8 w-8" /></div>
                    )}
                    {p.dropshipping && (
                      <span className="absolute inset-x-0 bottom-0 bg-background/90 py-0.5 text-center text-[10px] font-semibold text-volt">
                        Dropshipping
                      </span>
                    )}
                  </Link>

                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div className="min-w-0">
                      <p className="line-clamp-1 text-sm font-semibold">{p.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatFCFA(hasPromo ? p.promo_price_fcfa! : p.price_fcfa)}
                        {" · "}Stock {p.quantity}
                        {p.moq > 1 ? ` · MOQ ${p.moq}` : ""}
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <StatusSwitch
                        label="En ligne"
                        hint={p.published ? "Visible par les acheteurs" : "Masqué du catalogue"}
                        checked={p.published}
                        disabled={saving}
                        icon={Eye}
                        actionLabel={p.published ? "Masquer ce produit du catalogue" : "Mettre ce produit en ligne"}
                        onChange={(v) => toggle(p, "published", v)}
                      />
                      <StatusSwitch
                        label="Disponible"
                        hint={p.sold_out ? "Marqué épuisé" : "En stock"}
                        checked={!p.sold_out}
                        disabled={saving}
                        icon={Package}
                        actionLabel={p.sold_out ? "Marquer ce produit comme disponible" : "Marquer ce produit comme épuisé"}
                        onChange={(v) => toggle(p, "sold_out", !v)}
                      />
                      <StatusSwitch
                        label="Dropshipping"
                        hint={p.dropshipping ? "Livraison sur commande" : "Vente en gros (lots)"}
                        checked={p.dropshipping}
                        disabled={saving}
                        tone="volt"
                        icon={Zap}
                        actionLabel={p.dropshipping ? "Repasser en vente en gros" : "Passer ce produit en dropshipping"}
                        onChange={(v) => toggle(p, "dropshipping", v)}
                      />
                    </div>

                    <div className="mt-auto flex items-center justify-between border-t border-border pt-2">
                      <Link
                        to="/dashboard/edit/$id"
                        params={{ id: p.id }}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold hover:text-primary"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Modifier
                      </Link>
                      <button
                        onClick={() => remove(p)}
                        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive"
                        aria-label="Supprimer le produit"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Supprimer
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Logout */}
        <div className="mt-8 border-t border-dashed border-border pt-6">
          <button
            onClick={logout}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm font-medium text-muted-foreground hover:border-destructive/50 hover:text-destructive"
          >
            <LogOut className="h-4 w-4" /> Se déconnecter
          </button>
        </div>
      </div>

      <MobileFooter />
      <MobileNav />
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div className="text-lg font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
