import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/stockme-client";
import { Header } from "@/components/Header";
import { MobileNav } from "@/components/MobileNav";
import { MobileFooter } from "@/components/MobileFooter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusSwitch } from "@/components/StatusSwitch";
import { ProChip, VerifiedBadge, VerifiedBadgeGold, VerifiedMark } from "@/components/VerifiedBadge";
import { BoostButton, useSellerMoney } from "@/components/SellerMoneyProvider";
import { BoostLauncher } from "@/components/BoostLauncher";
import { BoostManager } from "@/components/BoostManager";
import { AdStats } from "@/components/AdStats";
import { WalletCard } from "@/components/WalletCard";
import { ProfileEditDialog } from "@/components/ProfileEditDialog";
import { ShopBanner } from "@/components/ShopBanner";
import { UpgradeDialog } from "@/components/UpgradeDialog";
import { VerifiedPaymentDialog } from "@/components/VerifiedPaymentDialog";
import { usePaymentsStatus } from "@/lib/features";
import { PRO_MONTHLY_BOOST_CREDIT, isProActive, planById, planOf, type PlanId } from "@/lib/pricing";
import { useAuth } from "@/hooks/useAuth";
import { uploadAvatar, MAX_PHOTO_SIZE } from "@/lib/image-upload";
import { useSellerDashboard } from "@/hooks/useSellerDashboard";
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
  Gift,
  Heart,
  Lock,
  LogOut,
  Mail,
  MapPin,
  MessageCircle,
  Package,
  Pencil,
  Phone,
  Rocket,
  Search,
  ShieldQuestion,
  Sparkles,
  Trash2,
  X,
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
  validateSearch: (s: Record<string, unknown>): { tab?: "produits" | "stats" | "promo" | "wallet" } => {
    const t = typeof s.tab === "string" ? s.tab : undefined;
    return { tab: t === "produits" || t === "stats" || t === "promo" || t === "wallet" ? t : undefined };
  },
  component: ProfilePage,
});

type TabId = "produits" | "stats" | "promo" | "wallet";

/**
 * 4 ONGLETS, UN SUJET PAR ONGLET (avant, tout était mélangé dans « Sponsorisé ») :
 *   Produits      → mes articles (avec la recherche)
 *   Stats         → les résultats, produit par produit
 *   Sponsorisé    → mes annonces : ce qui tourne, ce qui est en pause, les actions
 *   Portefeuille  → l'argent : solde, recharge, mouvements, à quoi ça sert
 */
const TAB_IDS: TabId[] = ["produits", "stats", "promo", "wallet"];
const TAB_LABELS: Record<TabId, string> = {
  produits: "Produits",
  stats: "Stats",
  promo: "Sponsorisé",
  wallet: "Portefeuille",
};

function ProfilePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { tab: tabParam } = Route.useSearch();
  /**
   * VITESSE : le profil, les produits et les statistiques viennent du paquet
   * unique `seller_dashboard` (voir useSellerDashboard). Cette page ne fait
   * donc PLUS AUCUNE requête de chargement : elle lit ce qui est déjà en
   * mémoire, et `load()` ne sert plus qu'à rafraîchir après une action.
   */
  const { data: dashboard, loading: dashLoading, refresh: refreshDashboard } = useSellerDashboard(!!user);
  const profile = (dashboard?.profile ?? null) as Profile | null;
  const products = (dashboard?.products ?? null) as Product[] | null;
  const stats = (dashboard?.stats ?? null) as Stats | null;
  const loading = dashLoading && !dashboard;
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
  /** Recherche dans MES produits (le vendeur en a parfois 50 : défiler est long). */
  const [productQuery, setProductQuery] = useState("");
  /** Barre d'onglets : sert de point d'ancrage au changement d'onglet. */
  const tabsRef = useRef<HTMLDivElement>(null);

  /**
   * CHANGEMENT D'ONGLET : on se replace au DÉBUT DU CONTENU DE L'ONGLET,
   * jamais en haut de la page. Avant, le site remontait tout en haut (ou laissait
   * une position incohérente) : à chaque changement d'onglet, il fallait
   * redescendre à la main. Ici on ancre la barre d'onglets en haut de l'écran :
   * l'utilisateur voit immédiatement le début de ce qu'il vient d'ouvrir.
   */
  const skipTabScroll = useRef(true);
  useEffect(() => {
    if (skipTabScroll.current) {
      skipTabScroll.current = false;
      return;
    }
    const el = tabsRef.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 72; // 72 px = barre du haut
    window.scrollTo({ top: Math.max(0, top), behavior: "auto" });
  }, [tab]);
  // Achat du badge : Wave / Orange Money par WhatsApp, activation manuelle.
  const [badgePayOpen, setBadgePayOpen] = useState(false);
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

  /** Rafraîchit tout l'espace vendeur en UN appel (profil, produits, stats, solde). */
  const load = async () => {
    await refreshDashboard();
  };

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
  /**
   * PRO actif = abonnement payé (échéance non dépassée). C'est lui qui ouvre
   * les statistiques détaillées et les publications illimitées. Un compte
   * simplement VÉRIFIÉ n'y a pas accès — c'est une raison de passer Pro.
   */
  const isPro = isProActive(profile);
  /**
   * Filtre local de MES produits : nom, catégorie ou ville.
   * Un vendeur avec 30 produits ne doit pas faire défiler 10 écrans pour
   * retrouver un article — il tape deux lettres et le voilà.
   */
  const filteredProducts = (products ?? []).filter((p) => {
    const q = productQuery.trim().toLowerCase();
    if (!q) return true;
    return p.name.toLowerCase().includes(q) || (p.category ?? "").toLowerCase().includes(q);
  });
  // Avantages affichés = exactement ceux de la page Tarifs (source unique).
  const badgePlan = planById("verifie")!;
  // Portefeuille global : sert à rappeler le cadeau de bienvenue non utilisé.
  const money = useSellerMoney();
  const unusedBalance = money?.balance ?? 0;
  const hasActiveBoost = (money?.wallet?.boosts ?? []).some((b) => b.status === "active");

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
            {/* Avatar + identité.
                MOBILE : avatar SOUS la bannière, puis nom + badge — sinon le nom
                et le badge passaient derrière la bannière (le badge semblait
                masqué).
                ORDINATEUR : chevauchement élégant, côte à côte. */}
            <div className="sm:-mt-14 sm:flex sm:items-end sm:gap-4">
              <div className="relative mt-3 w-fit sm:mt-0 sm:shrink-0">
                <div className="grid h-20 w-20 place-items-center overflow-hidden rounded-2xl border-4 border-background bg-volt text-xl font-bold text-volt-foreground sm:h-24 sm:w-24 sm:text-2xl">
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

              {/* Nom + badge, alignés sur la même ligne que l'avatar.
                  Le sceau (rosace + coche) est collé au nom : il se voit sur
                  TOUS les écrans, mobile compris — un badge caché ne rassure
                  personne. */}
              <div className="mt-3 min-w-0 sm:mt-0 sm:flex-1 sm:pb-0.5">
                <div className="flex items-center gap-1.5">
                  <h1 className="truncate font-display text-xl font-bold tracking-tight sm:text-2xl">{displayName}</h1>
                  {isVerified && <VerifiedMark size={19} tone={isLifetime ? "gold" : "blue"} />}
                  {isPro && <ProChip />}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {isVerified ? (
                    isLifetime ? (
                      <VerifiedBadgeGold />
                    ) : (
                      <VerifiedBadge />
                    )
                  ) : (
                    /* Une pastille CLIQUABLE : le vendeur qui voit « non vérifiée »
                       doit pouvoir agir tout de suite, surtout sur mobile. */
                    <button
                      type="button"
                      onClick={() => {
                        setUpgradePlan("verifie");
                        setUpgradeOpen(true);
                      }}
                      className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary transition hover:bg-primary/15"
                    >
                      <ShieldQuestion className="h-3 w-3" /> Non vérifiée — obtenir le badge
                    </button>
                  )}
                  {isPro && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-volt/15 px-2 py-0.5 text-[11px] font-bold text-foreground">
                      <Rocket className="h-3 w-3 text-volt" /> Vendeur Pro actif
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
            {/* Les favoris ont quitté le menu (trop chargé) : ils vivent ici. */}
            <Link
              to="/favorites"
              className="inline-flex items-center gap-1.5 font-semibold text-foreground underline underline-offset-2 hover:text-primary"
            >
              <Heart className="h-3.5 w-3.5" /> Mes favoris
            </Link>
            <Link
              to="/demandes"
              className="inline-flex items-center gap-1.5 font-semibold text-foreground underline underline-offset-2 hover:text-primary"
            >
              <Sparkles className="h-3.5 w-3.5" /> Mes demandes
            </Link>
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
            <>
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

              {/* Le badge n'apporte PAS de visites à lui seul : on rappelle au
                  vendeur vérifié qu'il a de quoi lancer une mise en avant.
                  Sans ce rappel, il paie et ne voit « rien ». */}
              {unusedBalance > 0 && !hasActiveBoost && (
                <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-volt/40 bg-volt/10 px-3 py-2.5">
                  <Gift className="h-4 w-4 shrink-0 text-volt" />
                  <span className="min-w-0 flex-1 text-xs leading-relaxed">
                    <strong className="text-foreground">{formatFCFA(unusedBalance)} de mise en avant non utilisés</strong>
                    {" · "}
                    <span className="text-muted-foreground">
                      tant que vous ne lancez rien, votre solde ne vous apporte aucune visite.
                    </span>
                  </span>
                  <Link to="/profile" search={{ tab: "promo" }} className="shrink-0">
                    <Button variant="volt" size="sm" className="h-9">
                      <Rocket className="mr-1.5 h-3.5 w-3.5" /> Booster
                    </Button>
                  </Link>
                </div>
              )}
            </>
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
                <button
                  type="button"
                  onClick={() => setBadgePayOpen(true)}
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-volt px-4 text-xs font-bold text-volt-foreground transition hover:brightness-110"
                >
                  <MessageCircle className="h-4 w-4" /> Payer par WhatsApp — {formatFCFA(VERIFIED_BADGE_PRICE_FCFA)} / an
                </button>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Paiement par <strong className="text-foreground">Wave</strong> ou{" "}
                  <strong className="text-foreground">Orange Money</strong> au{" "}
                  <strong className="text-foreground">+221 78 663 53 31</strong>, puis vous envoyez la capture sur
                  WhatsApp. Le badge est activé par notre équipe{" "}
                  <strong className="text-foreground">sous 24 h</strong> après réception.
                </p>
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
        <div ref={tabsRef} className="mt-4 scroll-mt-20 rounded-2xl border border-border bg-muted/60 p-1">
          <div className="relative grid grid-cols-4">
            <span
              aria-hidden
              className="absolute inset-y-0 left-0 w-1/4 rounded-xl bg-volt shadow-sm transition-transform duration-300 ease-out"
              style={{ transform: `translateX(${TAB_IDS.indexOf(tab) * 100}%)` }}
            />
            {TAB_IDS.map((id) => {
              const active = tab === id;
              const count =
                id === "produits"
                  ? products?.length ?? 0
                  : id === "promo"
                    ? (money?.wallet?.boosts ?? []).filter((b) => b.status === "active").length
                    : null;
              return (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  aria-selected={active}
                  role="tab"
                  className={`relative z-10 flex items-center justify-center gap-1 rounded-xl px-1 py-2.5 text-[10px] font-semibold transition-colors sm:px-2 sm:text-sm ${
                    active ? "text-volt-foreground" : "text-muted-foreground"
                  }`}
                >
                  <span className="truncate">{TAB_LABELS[id]}</span>
                  {id === "stats" && !isPro && <Lock className="h-3 w-3 shrink-0 opacity-60" />}
                  {count !== null && count > 0 && (
                    <span
                      className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] ${
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
            {/* MISE EN AVANT — le levier qui rapporte, expliqué en une ligne et
                accessible sans chercher : 7 jours = 7 000 F (1 000 F/jour). */}
            <button
              type="button"
              onClick={() => setTab("promo")}
              className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-volt/50 bg-volt/10 p-3 text-left transition hover:border-volt"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-volt text-volt-foreground">
                <Rocket className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold">Mettre un produit en tête de l'accueil</span>
                <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                  {formatFCFA(1000)} pour 1 jour. Plus vous prenez de jours, moins la journée coûte (900 F dès 11 jours,
                  800 F dès 21 jours). Vous suivez les vues et les contacts reçus.
                </span>
              </span>
              <span className="shrink-0 text-xs font-bold text-volt">Booster →</span>
            </button>

            {/* RECHERCHE : avec 20, 50 ou 100 produits, faire défiler pour en
                trouver un devient interminable. Le vendeur tape 2 lettres et
                tombe directement dessus. */}
            {(products?.length ?? 0) > 0 && (
              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={productQuery}
                    onChange={(e) => setProductQuery(e.target.value)}
                    placeholder="Rechercher dans mes produits (nom ou catégorie)"
                    className="h-11 pl-9"
                    inputMode="search"
                  />
                  {productQuery && (
                    <button
                      type="button"
                      aria-label="Effacer la recherche"
                      onClick={() => setProductQuery("")}
                      className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-muted"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                {productQuery && (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {filteredProducts.length} résultat{filteredProducts.length > 1 ? "s" : ""}
                  </span>
                )}
              </div>
            )}

            <p className="mt-3 text-xs text-muted-foreground">
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
            ) : filteredProducts.length === 0 ? (
              <div className="mt-5 grid place-items-center rounded-2xl border border-dashed border-border py-12 text-center">
                <Search className="h-8 w-8 text-muted-foreground" />
                <p className="mt-3 text-sm font-semibold">Aucun produit ne correspond à « {productQuery} »</p>
                <Button variant="outline" className="mt-3 h-10" onClick={() => setProductQuery("")}>
                  Voir tous mes produits
                </Button>
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                {filteredProducts.map((p) => {
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

        {/* ---------- Statistiques : RÉSERVÉ AUX VENDEURS PRO ----------
            Le vendeur vérifié (badge seul) voit ce qu'il gagnerait : une
            explication courte et un seul bouton. Pas de mur muet. */}
        {tab === "stats" && (
          <div className="mt-5">
            {isPro ? (
              <AdStats wallet={money?.wallet ?? null} loading={money?.loading ?? false} sellerStats={stats} />
            ) : (
              <div className="overflow-hidden rounded-2xl border border-volt/50 bg-volt/10">
                <div className="p-4 sm:p-5">
                  <div className="flex items-start gap-3">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-volt text-volt-foreground">
                      <Lock className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold">Les statistiques sont réservées aux Vendeurs Pro</p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        Vous voyez aujourd'hui vos vues, vos contacts et vos favoris. Avec Vendeur Pro vous voyez{" "}
                        <strong className="text-foreground">quel produit rapporte</strong>, la tendance des 14 derniers
                        jours et <strong className="text-foreground">le coût réel d'un contact</strong> — pour arrêter
                        de payer une mise en avant qui ne rapporte rien.
                      </p>
                      <ul className="mt-2 space-y-1 text-[11px]">
                        <li className="flex items-start gap-1.5">
                          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-volt" />
                          <span>Statistiques par produit : vues, clics, taux de contact, coût par contact</span>
                        </li>
                        <li className="flex items-start gap-1.5">
                          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-volt" />
                          <span>Tendance sur 14 jours et pays des acheteurs qui vous écrivent</span>
                        </li>
                        <li className="flex items-start gap-1.5">
                          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-volt" />
                          <span>
                            {formatFCFA(PRO_MONTHLY_BOOST_CREDIT)} de mise en avant versés chaque mois + publications
                            illimitées
                          </span>
                        </li>
                      </ul>
                      <div className="mt-3 grid gap-2 sm:flex sm:flex-wrap">
                        {/* Pleine largeur sur mobile, libellé sur 2 lignes : le
                            texte ne doit JAMAIS sortir du bouton. */}
                        <Button
                          variant="volt"
                          className="h-auto min-h-11 w-full whitespace-normal px-3 py-2 text-left leading-tight sm:w-auto"
                          onClick={() => {
                            setUpgradePlan("pro");
                            setUpgradeOpen(true);
                          }}
                        >
                          <Rocket className="h-4 w-4 shrink-0" />
                          <span className="flex min-w-0 flex-col">
                            <span className="text-sm font-bold">Passer Vendeur Pro</span>
                            <span className="text-[11px] font-semibold opacity-90">
                              {formatFCFA(planById("pro")?.price ?? 2900)} / mois
                            </span>
                          </span>
                        </Button>
                        <Link to="/tarifs" className="block">
                          <Button variant="outline" className="h-11 w-full sm:w-auto">
                            Voir ce que ça change
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        {/* ---------- Sponsorisation : mes annonces (créer, piloter) ---------- */}
        {tab === "promo" && <SponsorshipPanel plan={planOf(profile)} products={products} />}

        {/* ---------- Portefeuille : l'argent ---------- */}
        {tab === "wallet" && (
          <div className="mt-5">
            {money ? (
              <WalletCard
                wallet={money.wallet}
                loading={money.loading}
                onRecharge={money.openTopUp}
                onEditPending={(p) => money.resumePending(p)}
                onChanged={money.refresh}
                plan={planOf(profile)}
                proUntil={profile?.verified_until ?? null}
                onPro={() => {
                  setUpgradePlan("pro");
                  setUpgradeOpen(true);
                }}
              />
            ) : (
              <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-center">
                <p className="text-sm font-semibold">Rechargement bientôt disponible</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Écrivez-nous sur WhatsApp : nous activons votre solde à la main.
                </p>
              </div>
            )}
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
        shopName={profile?.shop_name}
        contactName={profile?.full_name}
      />

      {/* Badge : paiement Wave / Orange Money, preuve envoyée sur WhatsApp,
          activation manuelle par l'équipe StockMe. */}
      <VerifiedPaymentDialog
        open={badgePayOpen}
        onOpenChange={setBadgePayOpen}
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
 * Onglet « Sponsorisation » : c'est ici qu'on met un produit en avant.
 *
 * Tout se fait sur place (produit → durée → paiement ou activation) : le
 * vendeur n'a jamais à changer de page ni à chercher un bouton. Le badge, lui,
 * se prend en haut de la page (bloc « Faites vérifier votre boutique »), donc on
 * ne le repropose pas ici.
 */
function SponsorshipPanel({ plan, products }: { plan: PlanId; products: Product[] | null }) {
  const money = useSellerMoney();
  // `plan` et `products` restent dans la signature : l'onglet Produits s'en sert
  // pour le bandeau « Booster », et le plan sert au libellé de l'offre.
  void products;

  return (
    <div className="mt-5 space-y-4">
      {money ? (
        /* L'onglet Sponsorisation ne sert QU'À regarder ses annonces et agir
           vite : créer une annonce se fait depuis l'onglet Produits (bouton
           Booster), l'argent et les chiffres ont leurs propres onglets. */
        <BoostManager
          wallet={money.wallet}
          loading={money.loading}
          onRecharge={money.openTopUp}
          onExtend={(p) => money.openBoost(p)}
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
