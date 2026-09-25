import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/stockme-client";
import { Header } from "@/components/Header";
import { MobileNav } from "@/components/MobileNav";
import { MobileFooter } from "@/components/MobileFooter";
import { Button } from "@/components/ui/button";
import { StatusSwitch } from "@/components/StatusSwitch";
import { VerifiedBadge, VerifiedBadgeGold } from "@/components/VerifiedBadge";
import { VerifiedPaymentDialog } from "@/components/VerifiedPaymentDialog";
import { BoostButton, SellerMoneyProvider, useSellerMoney } from "@/components/SellerMoneyProvider";
import { WalletCard } from "@/components/WalletCard";
import { EditableField } from "@/components/EditableField";
import { useAuth } from "@/hooks/useAuth";
import { uploadAvatar, MAX_PHOTO_SIZE } from "@/lib/image-upload";
import { requireUserId } from "@/lib/current-user";
import { formatFCFA } from "@/lib/format";
import {
  COUNTRY_FLAGS,
  SERVICE_WHATSAPP_DISPLAY,
  VERIFIED_BADGE_PRICE_FCFA,
  WEST_AFRICA_CITIES,
  countryOfCity,
} from "@/lib/constants";
import { toast } from "sonner";
import {
  BadgeCheck,
  Camera,
  Eye,
  ExternalLink,
  Heart,
  LogOut,
  Mail,
  MapPin,
  MessageCircle,
  Package,
  Pencil,
  Phone,
  ShieldQuestion,
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
  verified: boolean;
  verified_until: string | null;
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
  stock_value?: number;
  countries?: { country: string | null; value: number }[];
};

export const Route = createFileRoute("/_authenticated/profile")({
  component: ProfilePage,
});

type TabId = "produits" | "stats" | "promo";

/** Libellés courts : les 3 onglets tiennent sur la largeur d'un téléphone. */
const TAB_IDS: TabId[] = ["produits", "stats", "promo"];
const TAB_LABELS: Record<TabId, string> = {
  produits: "Produits",
  stats: "Stats",
  promo: "Sponsorisé",
};

function ProfilePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabId>("produits");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Photo de profil : envoi immédiat depuis cette page (pas besoin de passer par « Modifier le profil »).
  const onAvatarPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type && !file.type.startsWith("image/")) {
      toast.error("Choisissez une image (JPG ou PNG).");
      return;
    }
    if (file.size > MAX_PHOTO_SIZE) {
      toast.error("Image trop lourde (max 15 Mo).");
      return;
    }
    setUploadingAvatar(true);
    try {
      const userId = await requireUserId("Reconnectez-vous pour changer votre photo.");
      const url = await uploadAvatar(file, userId, profile?.avatar_url ?? undefined);
      const { error } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", userId);
      if (error) throw new Error(error.message);
      toast.success("Photo de profil mise à jour !");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Envoi impossible, réessayez.");
    } finally {
      setUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  };

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
  const isVerified = !!profile?.verified && (!profile.verified_until || new Date(profile.verified_until) > new Date());
  const isLifetime = isVerified && !profile?.verified_until;

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
            <div className="relative shrink-0">
              <div className="grid h-24 w-24 place-items-center overflow-hidden rounded-full bg-volt text-2xl font-bold text-volt-foreground">
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt={displayName} className="h-full w-full object-cover" />
                ) : (
                  <span>{initials}</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={uploadingAvatar}
                aria-label={profile?.avatar_url ? "Changer ma photo de profil" : "Ajouter ma photo de profil"}
                title={profile?.avatar_url ? "Changer ma photo de profil" : "Ajouter ma photo de profil"}
                className="absolute -bottom-1 -right-1 grid h-9 w-9 place-items-center rounded-full border-2 border-background bg-foreground text-background shadow-md transition hover:brightness-110 disabled:opacity-60"
              >
                {uploadingAvatar ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent" />
                ) : (
                  <Camera className="h-4 w-4" />
                )}
              </button>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onAvatarPick}
              />
            </div>

            <div className="min-w-0 flex-1">
              {/* Nom de la boutique (modifiable) + badge */}
              <div className="flex flex-wrap items-center gap-2">
                <EditableField
                  field="shop_name"
                  value={profile?.shop_name}
                  placeholder="Ajouter le nom de ma boutique"
                  ariaLabel="nom de la boutique"
                  maxLength={60}
                  onSaved={load}
                  className="font-display text-2xl font-bold tracking-tight"
                />
                {isVerified ? (
                  isLifetime ? (
                    <VerifiedBadgeGold />
                  ) : (
                    <VerifiedBadge />
                  )
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    <ShieldQuestion className="h-3 w-3" /> Non vérifiée
                  </span>
                )}
              </div>

              {/* Nom du responsable (modifiable) */}
              <div className="mt-1 text-sm text-muted-foreground">
                <EditableField
                  field="full_name"
                  value={profile?.full_name}
                  placeholder="Ajouter mon nom"
                  ariaLabel="nom du responsable"
                  maxLength={60}
                  onSaved={load}
                />
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Link to="/profile/edit">
                  <Button variant="outline" size="sm">Formulaire complet</Button>
                </Link>
                {user?.id && (
                  <Link to="/vendeur/$id" params={{ id: user.id }}>
                    <Button variant="ghost" size="sm">
                      <ExternalLink className="mr-1 h-3.5 w-3.5" /> Ma boutique publique
                    </Button>
                  </Link>
                )}
              </div>

              {!profile?.avatar_url && (
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  className="mt-2 text-xs font-medium text-volt underline underline-offset-2"
                >
                  Ajoutez votre photo de profil — les acheteurs y font plus confiance.
                </button>
              )}

              <div className="mt-4 grid max-w-md grid-cols-4 gap-4 text-center sm:text-left">
                <Stat value={online} label="Produits" />
                <Stat value={stats?.total_views ?? 0} label="Vues" />
                <Stat value={stats?.total_contacts ?? 0} label="Contacts" />
                <Stat value={stats?.total_favorites ?? 0} label="Favoris" />
              </div>
            </div>
          </div>

          {/* ===== À propos (bio) — modifiable ===== */}
          <div className="mt-6 text-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">À propos</p>
            <div className="mt-2 flex items-start gap-2">
              <EditableField
                field="bio"
                value={profile?.bio}
                placeholder="Décrivez votre activité : ce que vous vendez, vos délais de livraison, vos conditions de gros…"
                ariaLabel="description de la boutique"
                multiline
                maxLength={600}
                onSaved={load}
                className="flex-1 leading-relaxed text-muted-foreground"
                inputClassName="text-sm"
              />
            </div>
          </div>

          {/* ===== Coordonnées — toutes modifiables sauf l'e-mail ===== */}
          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
            <EditableField
              field="city"
              value={profile?.city}
              placeholder="Ajouter ma ville"
              ariaLabel="ville"
              icon={MapPin}
              listId="profile-cities"
              render={(v) => `${COUNTRY_FLAGS[countryOfCity(v)] ?? ""} ${v}`}
              onSaved={load}
            />
            <EditableField
              field="whatsapp"
              value={profile?.whatsapp}
              placeholder="Ajouter mon WhatsApp"
              ariaLabel="numéro WhatsApp"
              type="tel"
              icon={MessageCircle}
              onSaved={load}
            />
            <EditableField
              field="phone"
              value={profile?.phone}
              placeholder="Ajouter mon téléphone"
              ariaLabel="numéro de téléphone"
              type="tel"
              icon={Phone}
              onSaved={load}
            />
            <span className="inline-flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5" />
              {user?.email}
              <span className="text-[10px] uppercase tracking-wider">compte</span>
            </span>
          </div>

          <datalist id="profile-cities">
            {WEST_AFRICA_CITIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>

          {/* ===== Badge « Fournisseur vérifié » — version compacte ===== */}
          {isVerified ? (
            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-primary/25 bg-primary/5 px-3 py-2.5 text-xs">
              <BadgeCheck className="h-4 w-4 shrink-0 text-primary" />
              <span className="min-w-0 flex-1">
                <strong className="text-foreground">Boutique vérifiée</strong>
                {" · "}
                {isLifetime
                  ? "badge permanent"
                  : `valable jusqu'au ${new Date(profile!.verified_until as string).toLocaleDateString("fr-FR")}`}
                {" · "}
                <span className="text-muted-foreground">affiché sur vos fiches et votre boutique</span>
              </span>
            </div>
          ) : (
            <details className="mt-4 rounded-xl border border-volt/40 bg-volt/10 px-3 py-2.5">
              <summary className="flex cursor-pointer list-none items-center gap-2 text-xs">
                <BadgeCheck className="h-4 w-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1 font-semibold">
                  Faites vérifier votre boutique — {VERIFIED_BADGE_PRICE_FCFA.toLocaleString("fr-FR")} FCFA
                </span>
                <span className="shrink-0 rounded-full bg-volt px-2.5 py-1 text-[11px] font-bold text-volt-foreground">
                  Vérifier
                </span>
              </summary>

              <div className="mt-3 space-y-2 border-t border-volt/30 pt-3">
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Le badge <strong className="text-foreground">Fournisseur vérifié</strong> rassure les acheteurs et
                  s'affiche sur toutes vos cartes produit. Nous contrôlons votre numéro WhatsApp et votre activité.
                </p>
                <ol className="space-y-0.5 text-[11px] text-muted-foreground">
                  <li>1. Payez {VERIFIED_BADGE_PRICE_FCFA.toLocaleString("fr-FR")} FCFA (Wave / Orange Money) au {SERVICE_WHATSAPP_DISPLAY}</li>
                  <li>2. Envoyez la capture sur WhatsApp</li>
                  <li>3. Badge activé après vérification</li>
                </ol>
                <button
                  type="button"
                  onClick={() => setPayOpen(true)}
                  className="inline-flex h-10 items-center gap-2 rounded-full bg-volt px-4 text-xs font-bold text-volt-foreground transition hover:brightness-110"
                >
                  <MessageCircle className="h-3.5 w-3.5" /> Payer {VERIFIED_BADGE_PRICE_FCFA.toLocaleString("fr-FR")} FCFA
                </button>
              </div>
            </details>
          )}
        </div>
      </section>

      {/* ===== Espace vendeur : Produits · Statistiques · Sponsorisation ===== */}
      <div className="mx-auto max-w-4xl px-4 sm:px-6 py-6 sm:py-8">
        <SellerMoneyProvider defaultPhone={profile?.whatsapp} onChanged={load}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg sm:text-xl font-bold tracking-tight">Mon espace vendeur</h2>
          <Link to="/dashboard/new">
            <Button variant="volt" size="sm"><Package className="mr-1 h-4 w-4" /> Ajouter</Button>
          </Link>
        </div>

        {/* Onglets : indicateur coulissant, largeur égale, aucun débordement sur mobile */}
        <div className="mt-4 rounded-2xl border border-border bg-muted/60 p-1">
          <div className="relative grid grid-cols-3">
            <span
              aria-hidden
              className="absolute inset-y-0 left-0 w-1/3 rounded-xl bg-background shadow-sm transition-transform duration-300 ease-out"
              style={{ transform: `translateX(${TAB_IDS.indexOf(tab) * 100}%)` }}
            />
            {TAB_IDS.map((id) => {
              const active = tab === id;
              const count = id === "produits" ? products?.length ?? 0 : null;
              return (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  aria-selected={active}
                  role="tab"
                  className={`relative z-10 flex items-center justify-center gap-1 rounded-xl px-2 py-2.5 text-[11px] font-semibold transition-colors sm:text-sm ${
                    active ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {TAB_LABELS[id]}
                  {count !== null && (
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                        active ? "bg-volt/20 text-foreground" : "bg-muted-foreground/15"
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ---------- Produits ---------- */}
        {tab === "produits" && (
          <>
            <p className="mt-4 text-xs text-muted-foreground">
              Activez ou désactivez chaque réglage d'un simple appui : la ligne entière est cliquable.
            </p>

            {products === null ? (
              <div className="mt-5 grid grid-cols-1 gap-3">
                {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-64 rounded-2xl shimmer bg-muted" />)}
              </div>
            ) : products.length === 0 ? (
              <div className="mt-5 grid place-items-center rounded-3xl border border-dashed border-border bg-muted/30 py-16 text-center">
                <Package className="h-10 w-10 text-muted-foreground" />
                <h3 className="mt-4 text-lg font-semibold">Aucun produit</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Listez votre premier produit pour le vendre en gros ou en dropshipping.
                </p>
                <Link to="/dashboard/new" className="mt-4"><Button variant="volt">Ajouter un produit</Button></Link>
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                {products.map((p) => {
                  const hasPromo = p.promo_price_fcfa && p.promo_price_fcfa < p.price_fcfa;
                  const saving = savingId === p.id;
                  return (
                    <div key={p.id} className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                      {/* Photo du produit en grand */}
                      <Link
                        to="/product/$id"
                        params={{ id: p.id }}
                        className="relative block aspect-[16/10] w-full overflow-hidden bg-muted"
                      >
                        {p.images[0] ? (
                          <img src={p.images[0]} alt={p.name} className="h-full w-full object-cover" />
                        ) : (
                          <div className="grid h-full place-items-center text-muted-foreground">
                            <Package className="h-9 w-9" />
                          </div>
                        )}
                        <span className="absolute left-2 top-2 rounded-full bg-background/95 px-2.5 py-1 text-[11px] font-bold backdrop-blur">
                          {formatFCFA(hasPromo ? (p.promo_price_fcfa as number) : p.price_fcfa)}
                        </span>
                        {p.dropshipping && (
                          <span className="absolute right-2 top-2 rounded-full bg-foreground/90 px-2.5 py-1 text-[11px] font-semibold text-background backdrop-blur">
                            Dropshipping
                          </span>
                        )}
                      </Link>

                      <div className="space-y-2.5 p-3.5">
                        <div className="min-w-0">
                          <p className="line-clamp-1 text-base font-semibold">{p.name}</p>
                          <p className="text-xs text-muted-foreground">
                            Stock {p.quantity}
                            {p.moq > 1 ? ` · MOQ ${p.moq}` : ""}
                            {p.category ? ` · ${p.category}` : ""}
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

                    <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-2.5">
                      <div className="flex items-center gap-2">
                        <Link
                          to="/dashboard/edit/$id"
                          params={{ id: p.id }}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold hover:text-primary"
                        >
                          <Pencil className="h-3.5 w-3.5" /> Modifier
                        </Link>
                        <BoostButton productId={p.id} productName={p.name} />
                      </div>
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
          </>
        )}

        {/* ---------- Statistiques ---------- */}
        {tab === "stats" && (
          <div className="mt-5 space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label="Produits en ligne" value={online} icon={Package} />
              <StatCard label="Vues totales" value={stats?.total_views ?? 0} icon={Eye} />
              <StatCard label="Contacts reçus" value={stats?.total_contacts ?? 0} icon={MessageCircle} />
              <StatCard label="Favoris" value={stats?.total_favorites ?? 0} icon={Heart} />
            </div>

            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Taux de contact (contacts ÷ vues)
              </p>
              <p className="mt-1 text-2xl font-bold tracking-tight">
                {(stats?.total_views ?? 0) > 0
                  ? `${Math.round(((stats?.total_contacts ?? 0) / (stats?.total_views ?? 1)) * 100)} %`
                  : "—"}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Au-dessus de 5 %, vos fiches convertissent bien : gardez des photos nettes et un prix clair.
              </p>
            </div>

            {stats?.countries && stats.countries.length > 0 && (
              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  D'où viennent vos acheteurs
                </p>
                <ul className="mt-3 space-y-2">
                  {stats.countries.slice(0, 8).map((c) => {
                    const total = (stats.countries ?? []).reduce((s, x) => s + x.value, 0) || 1;
                    const pct = Math.round((c.value / total) * 100);
                    return (
                      <li key={c.country ?? "?"}>
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium">
                            {COUNTRY_FLAGS[c.country ?? ""] ?? ""} {c.country || "Non identifié"}
                          </span>
                          <span className="text-muted-foreground">
                            {c.value} vue{c.value > 1 ? "s" : ""} · {pct} %
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-volt" style={{ width: `${pct}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {stats?.stock_value ? (
              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Valeur de votre stock en ligne
                </p>
                <p className="mt-1 text-2xl font-bold tracking-tight">{formatFCFA(stats.stock_value)}</p>
              </div>
            ) : null}
          </div>
        )}

        {/* ---------- Sponsorisation ---------- */}
        {tab === "promo" && <SponsorshipPanel />}

        </SellerMoneyProvider>

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

      {/* Pop-up de paiement : on confirme l'envoi de l'argent AVANT WhatsApp */}
      <VerifiedPaymentDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        shopName={profile?.shop_name}
        contactName={profile?.full_name}
      />
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

/** Carte d'indicateur utilisée dans l'onglet Statistiques. */
function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3.5">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] sm:text-[11px]">{label}</span>
      </div>
      <p className="mt-1.5 text-2xl font-bold tracking-tight">{value.toLocaleString("fr-FR")}</p>
    </div>
  );
}

/**
 * Onglet « Sponsorisation » : solde, rechargement, mises en avant.
 * Le contenu vient du contexte vendeur (il n'apparaît que si le paiement est
 * réellement actif).
 */
function SponsorshipPanel() {
  const money = useSellerMoney();

  if (!money) {
    return (
      <div className="mt-5 rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center">
        <Zap className="mx-auto h-7 w-7 text-muted-foreground" />
        <h3 className="mt-3 font-semibold">Sponsorisation bientôt disponible</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          La mise en avant payante de vos produits arrive très bientôt sur StockMe.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-5">
      <WalletCard
        wallet={money.wallet}
        loading={money.loading}
        onRecharge={money.openTopUp}
        onChanged={money.refresh}
      />
    </div>
  );
}
