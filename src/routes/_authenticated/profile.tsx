import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/stockme-client";
import { Header } from "@/components/Header";
import { MobileNav } from "@/components/MobileNav";
import { MobileFooter } from "@/components/MobileFooter";
import { Button } from "@/components/ui/button";
import { StatusSwitch } from "@/components/StatusSwitch";
import { VerifiedBadge, VerifiedBadgeGold } from "@/components/VerifiedBadge";
import { BoostButton, useSellerMoney } from "@/components/SellerMoneyProvider";
import { WalletCard } from "@/components/WalletCard";
import { ProfileEditDialog } from "@/components/ProfileEditDialog";
import { ShopBanner } from "@/components/ShopBanner";
import { UpgradeDialog } from "@/components/UpgradeDialog";
import { usePaymentsStatus } from "@/lib/features";
import { PAID_PLANS, PRO_AVAILABLE, FREE_PRODUCTS, VERIFICATION_BONUS_FCFA, planById, planOf, type PlanId } from "@/lib/pricing";
import { useAuth } from "@/hooks/useAuth";
import { uploadAvatar, MAX_PHOTO_SIZE } from "@/lib/image-upload";
import { requireUserId } from "@/lib/current-user";
import { formatFCFA } from "@/lib/format";
import {
  COUNTRY_FLAGS,
  VERIFIED_BADGE_PRICE_FCFA,
  countryOfCity,
} from "@/lib/constants";
import { toast } from "sonner";
import {
  BadgeCheck,
  Camera,
  Check,
  Eye,
  ExternalLink,
  CreditCard,
  Heart,
  LogOut,
  Mail,
  MapPin,
  MessageCircle,
  Package,
  Pencil,
  Phone,
  ShieldQuestion,
  Sparkles,
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
  plan?: string | null;
  banner_url?: string | null;
  banner_position?: number | null;
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
  // ?tab=promo permet d'ouvrir directement l'onglet Sponsorisation depuis le
  // sidebar (Portefeuille & pub) ou un lien externe.
  validateSearch: (s: Record<string, unknown>): { tab?: "produits" | "stats" | "promo" } => {
    const t = typeof s.tab === "string" ? s.tab : undefined;
    return { tab: t === "produits" || t === "stats" || t === "promo" ? t : undefined };
  },
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
  const { tab: tabParam } = Route.useSearch();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  // L'onglet est piloté par l'adresse (?tab=promo) : le sidebar peut donc ouvrir
  // directement la Sponsorisation, et un lien partagé garde le bon onglet.
  const tab: TabId = tabParam ?? "produits";
  const setTab = (id: TabId) => {
    navigate({ to: "/profile", search: { tab: id === "produits" ? undefined : id }, replace: true });
  };
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgradePlan, setUpgradePlan] = useState<"verifie" | "pro">("pro");
  const [editOpen, setEditOpen] = useState(false);
  const payments = usePaymentsStatus();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  // Le bloc « faire vérifier ma boutique » est DÉPLIÉ par défaut (l'offre doit
  // être vue immédiatement) tout en restant repliable d'un clic.
  const [badgeOpen, setBadgeOpen] = useState(true);
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

  // Un boost vient d'être lancé depuis le sidebar (ou la carte produit) :
  // on recharge les chiffres de la page pour rester cohérent.
  useEffect(() => {
    const onChanged = () => {
      void load();
    };
    window.addEventListener("stockme:money-changed", onChanged);
    return () => window.removeEventListener("stockme:money-changed", onChanged);
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
  // Avantages affichés = exactement ceux de la page Tarifs (source unique).
  const badgePlan = planById("verifie")!;

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

  // Les deux actions du profil : même style, même hauteur, même largeur sur
  // mobile (deux colonnes alignées sous l'avatar) — voir le rendu ci-dessous.
  const profileActions = (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-10 w-full justify-center sm:w-auto"
        onClick={() => setEditOpen(true)}
      >
        <Pencil className="mr-1.5 h-3.5 w-3.5" /> Modifier le profil
      </Button>
      {user?.id && (
        <Link
          to="/vendeur/$id"
          params={{ id: user.id }}
          className="w-full sm:w-auto"
          aria-label="Voir ma boutique publique"
        >
          <Button variant="outline" size="sm" className="h-10 w-full justify-center sm:w-auto">
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Ma boutique
          </Button>
        </Link>
      )}
    </>
  );

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* ===== Bannière de la boutique (visible pour TOUS, modifiable en PRO/vérifié) ===== */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-4xl">
          <div className="sm:px-6 sm:pt-5">
            <ShopBanner
              src={profile?.banner_url ?? null}
              position={profile?.banner_position ?? 50}
              className="h-32 sm:h-40 sm:rounded-3xl"
              overlay
            />
          </div>

          <div className="px-4 pb-6 sm:px-6">
            {/* Avatar qui chevauche la bannière + identité */}
            <div className="-mt-12 flex items-end gap-3 sm:-mt-14 sm:gap-4">
              <div className="relative shrink-0">
                <div className="grid h-24 w-24 place-items-center overflow-hidden rounded-2xl border-4 border-background bg-volt text-2xl font-bold text-volt-foreground">
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
                  className="absolute -bottom-1 -right-1 grid h-8 w-8 place-items-center rounded-full border-2 border-background bg-foreground text-background shadow-md transition hover:brightness-110 disabled:opacity-60"
                >
                  {uploadingAvatar ? (
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-background border-t-transparent" />
                  ) : (
                    <Camera className="h-3.5 w-3.5" />
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

              {/* Nom + badge, alignés sur la même ligne que l'avatar */}
              <div className="min-w-0 flex-1 pb-0.5">
                <h1 className="truncate font-display text-xl font-bold tracking-tight sm:text-2xl">{displayName}</h1>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
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
                {profile?.full_name && (
                  <p className="mt-1 truncate text-xs text-muted-foreground">{profile.full_name}</p>
                )}
                {/* Sur ordinateur, les actions restent à côté du nom */}
                <div className="mt-2.5 hidden sm:flex sm:flex-wrap sm:items-center sm:gap-2">{profileActions}</div>
              </div>
            </div>

            {/* Sur mobile, les deux boutons passent SOUS l'avatar, même largeur,
                alignés exactement sur le bord gauche de la photo de profil. */}
            <div className="mt-4 grid grid-cols-2 gap-2 sm:hidden">{profileActions}</div>
          </div>
        </div>
      </section>

      {/* ===== Statistiques + à propos + coordonnées ===== */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 py-6">
          <div className="grid max-w-md grid-cols-4 gap-4 text-center sm:text-left">
            <Stat value={online} label={online > 1 ? "Produits" : "Produit"} />
            <Stat value={stats?.total_views ?? 0} label="Vues" />
            <Stat value={stats?.total_contacts ?? 0} label="Contacts" />
            <Stat value={stats?.total_favorites ?? 0} label="Favoris" />
          </div>

          {/* ===== Coordonnées (lecture seule : tout se modifie dans la fenêtre) ===== */}
          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" />
              {profile?.city ? `${COUNTRY_FLAGS[countryOfCity(profile.city)] ?? ""} ${profile.city}` : "Ville non renseignée"}
            </span>
            {profile?.whatsapp && (
              <span className="inline-flex items-center gap-1.5">
                <MessageCircle className="h-3.5 w-3.5" /> {profile.whatsapp}
              </span>
            )}
            {/* Le téléphone n'est affiché que s'il est différent du WhatsApp :
                afficher deux fois le même numéro n'apporte rien. */}
            {profile?.phone &&
              (profile.phone.replace(/\D/g, "") !== (profile.whatsapp ?? "").replace(/\D/g, "")) && (
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5" /> {profile.phone}
                </span>
              )}
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <Mail className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{user?.email}</span>
            </span>
          </div>

          {/* ===== À propos (lecture seule) ===== */}
          {profile?.bio && (
            <div className="mt-4 text-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">À propos</p>
              <p className="mt-1 leading-relaxed text-muted-foreground">{profile.bio}</p>
            </div>
          )}

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
            <details
              open={badgeOpen}
              onToggle={(e) => setBadgeOpen(e.currentTarget.open)}
              className="mt-4 rounded-xl border border-volt/40 bg-volt/10 px-3 py-2.5"
            >
              <summary className="flex cursor-pointer list-none items-center gap-2 text-xs">
                <BadgeCheck className="h-4 w-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1 font-semibold">
                  Faites vérifier votre boutique — {formatFCFA(VERIFIED_BADGE_PRICE_FCFA)}{" "}
                  <span className="font-normal text-muted-foreground">par an</span>
                </span>
                <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">
                  {badgeOpen ? "Réduire" : "Voir"}
                </span>
              </summary>

              <div className="mt-3 space-y-3 border-t border-volt/30 pt-3">
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Le badge <strong className="text-foreground">Fournisseur vérifié</strong> s'affiche sur toutes vos
                  annonces et vous fait remonter dans la recherche. Il est valable{" "}
                  <strong className="text-foreground">12 mois</strong>.
                </p>
                <ul className="space-y-1">
                  {badgePlan.features.slice(0, 5).map((f) => (
                    <li key={f} className="flex items-start gap-1.5 text-[11px] leading-snug">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                {payments.enabled && payments.methods.includes("card") ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setUpgradePlan("verifie");
                        setUpgradeOpen(true);
                      }}
                      className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-volt px-4 text-xs font-bold text-volt-foreground transition hover:brightness-110"
                    >
                      <CreditCard className="h-4 w-4" /> Payer par carte — {formatFCFA(VERIFIED_BADGE_PRICE_FCFA)} / an
                    </button>
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      Paiement sécurisé par carte bancaire (Visa / Mastercard). Le badge s'active automatiquement,
                      sans aucune démarche à faire.
                    </p>
                  </>
                ) : (
                  <p className="rounded-lg border border-border bg-background/60 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
                    Le paiement par carte est en cours d'activation. Revenez dans quelques heures : votre badge
                    s'activera automatiquement après le paiement, sans aucune démarche.
                  </p>
                )}
              </div>
            </details>
          )}
        </div>
      </section>

      {/* ===== Espace vendeur : Produits · Statistiques · Sponsorisation ===== */}
      <div className="mx-auto max-w-4xl px-4 sm:px-6 py-6 sm:py-8">
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
              className="absolute inset-y-0 left-0 w-1/3 rounded-xl bg-volt shadow-sm transition-transform duration-300 ease-out"
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
                    active ? "text-volt-foreground" : "text-muted-foreground"
                  }`}
                >
                  {TAB_LABELS[id]}
                  {count !== null && (
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                        active ? "bg-volt-foreground/20 text-volt-foreground" : "bg-muted-foreground/15"
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
        {tab === "promo" && (
          <SponsorshipPanel plan={planOf(profile)} onUpgrade={(target) => { setUpgradePlan(target); setUpgradeOpen(true); }} />
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

      {/* Fenêtre unique de modification du profil */}
      <ProfileEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        profile={profile}
        email={user?.email}
        userId={user?.id ?? ""}
        canEditBanner={isVerified}
        onRequestUpgrade={() => {
          setEditOpen(false);
          setUpgradePlan("verifie");
          setUpgradeOpen(true);
        }}
        onSaved={load}
      />

      {/* Fenêtre d'achat : elle n'affiche QUE le parcours demandé (badge ou PRO) */}
      <UpgradeDialog
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        methods={payments.methods}
        isVerified={isVerified}
        defaultPhone={profile?.whatsapp}
        focus={upgradePlan}
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
 * Onglet « Sponsorisation » : offre en cours, solde, rechargement, mises en avant.
 * Le contenu du solde vient du contexte vendeur (il n'apparaît que si le
 * paiement est actuellement actif).
 */
function SponsorshipPanel({
  plan,
  onUpgrade,
}: {
  plan: PlanId;
  onUpgrade: (target: "verifie" | "pro") => void;
}) {
  const money = useSellerMoney();

  // Progression logique : Gratuit → Fournisseur vérifié (→ PRO quand il revient)
  const currentLabel =
    plan === "gratuit" ? "Gratuit" : plan === "verifie" ? "Fournisseur vérifié" : "StockMe PRO";
  const currentNote =
    plan === "gratuit"
      ? `${FREE_PRODUCTS} produits · 10 photos · mise en avant à 500 F/jour`
      : plan === "verifie"
      ? "Badge actif · priorité dans la recherche · 1 500 F de mise en avant offerts"
      : "Badge actif · mise en avant à 400 F/jour · statistiques avancées";

  // Tant que PRO est masqué, la seule montée possible est le badge.
  const next = plan === "gratuit" ? PAID_PLANS[0] : PRO_AVAILABLE && plan === "verifie" ? PAID_PLANS[1] : null;
  const atMax = !next && (plan === "verifie" || plan === "pro" || plan === "pro_annuel");

  return (
    <div className="mt-5 space-y-4">
      {/* Offre en cours + montée d'offre */}
      <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Mon offre</p>
            <p className="mt-0.5 text-lg font-bold tracking-tight">{currentLabel}</p>
            <p className="text-xs text-muted-foreground">{currentNote}</p>
          </div>
          {next ? (
            <Button
              variant="volt"
              className="h-11"
              onClick={() => onUpgrade(next.id === "verifie" ? "verifie" : "pro")}
            >
              <Sparkles className="mr-1.5 h-4 w-4" />
              {next.id === "verifie" ? "Faire vérifier" : "Passer à PRO"} — {formatFCFA(next.price)}
              <span className="ml-1 text-[11px] font-normal opacity-80">{next.period}</span>
            </Button>
          ) : atMax ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-1 text-[11px] font-semibold text-success">
              <Check className="h-3 w-3" /> Boutique vérifiée
            </span>
          ) : null}
        </div>

        {next && (
          <p className="mt-3 rounded-xl bg-muted/50 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
            {next.id === "verifie" ? (
              <>
                Avec <strong className="text-foreground">Fournisseur vérifié</strong> : le badge sur toutes vos annonces,
                la priorité dans la recherche, et{" "}
                <strong className="text-foreground">{formatFCFA(VERIFICATION_BONUS_FCFA)} de mise en avant offerts</strong>{" "}
                pour essayer (72 h).
                {PRO_AVAILABLE && <> Ensuite, PRO se rajoute pour {formatFCFA(2500)}/mois.</>}
              </>
            ) : (
              <>
                <strong className="text-foreground">StockMe PRO</strong> : mise en avant à 400 F/jour,{" "}
                <strong className="text-foreground">72 h de boost offertes chaque mois</strong> et statistiques avancées.
                Votre badge reste acquis tant que l'abonnement court.{" "}
              </>
            )}
            <Link to="/tarifs" className="underline underline-offset-2">
              Voir toutes les offres
            </Link>
          </p>
        )}
      </div>

      {money ? (
        <WalletCard
          wallet={money.wallet}
          loading={money.loading}
          onRecharge={money.openTopUp}
          onEditPending={(p) => money.resumePending(p)}
          onChanged={money.refresh}
        />
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-center">
          <Zap className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-2 text-sm font-semibold">Mise en avant bientôt disponible</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Le rechargement et le suivi de performance arrivent très bientôt. En attendant, vous pouvez demander une
            mise en avant par WhatsApp depuis l'accueil.
          </p>
        </div>
      )}
    </div>
  );
}
