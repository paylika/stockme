import { useEffect, useState, type ComponentType } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  IconAdmin,
  IconBadge,
  IconBox,
  IconCheck,
  IconChevronDown,
  IconClock,
  IconCoins,
  IconFlame,
  IconGrid,
  IconHeart,
  IconHome,
  IconSell,
  IconStock,
  IconUser,
  IconWhatsApp,
} from "@/components/icons";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useSidebarInfo } from "@/hooks/useSidebarInfo";
import { useWallet } from "@/hooks/useWallet";
import { useSellerMoney } from "@/components/SellerMoneyProvider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { isAdminEmail } from "@/lib/constants";
import { formatFCFA } from "@/lib/format";
import logoUrl from "@/assets/stockme-logo.png";

const COLLAPSE_KEY = "stockme:sidebar:collapsed";
/** Pages où le solde / les produits / le badge peuvent avoir changé. */
const REFRESH_PAGES = ["/profile", "/dashboard", "/favorites"];

type NavItem = {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  match: string;
  count?: number;
  search?: Record<string, unknown>;
  /** Visiteur non connecté : on l'envoie vers la connexion, puis on le ramène ici. */
  authRedirect?: { redirect: string; mode: "login" | "signup" };
};

/**
 * Sidebar de l'ordinateur. Il porte TOUTE la navigation desktop (le Header est
 * masqué à partir de md) : identité de la boutique, recherche, argent du
 * vendeur, checklist de démarrage, puis les 3 sections Acheter / Vendre / Compte.
 * Réductible en icônes (bouton en bas ou Ctrl/Cmd + B), état mémorisé.
 */
export function AppSidebar() {
  const { user } = useAuth();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const navigate = useNavigate();

  const [collapsed, setCollapsed] = useState(false);
  const [checkOpen, setCheckOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const { info, refresh } = useSidebarInfo(!!user);
  const money = useSellerMoney();
  const { wallet: walletFallback, refresh: refreshWallet } = useWallet(!!user);
  // Un seul portefeuille pour tout le site (fourni par la racine) ; on retombe
  // sur une lecture locale si le fournisseur n'est pas encore monté.
  const wallet = money?.wallet ?? walletFallback;
  const refreshMoney = money?.refresh ?? refreshWallet;

  const isAdmin = isAdminEmail(user?.email);
  const balance = wallet?.balance_fcfa ?? 0;
  const activeBoosts = (wallet?.boosts ?? []).filter((b) => b.status === "active").length;
  const pendingCount = (wallet?.pending ?? []).length;
  // On ne montre l'argent qu'à quelqu'un qui vend déjà (sinon c'est du bruit :
  // un simple acheteur verrait « 0 FCFA » à chaque page).
  const isSeller = (info?.products ?? 0) > 0 || balance > 0 || activeBoosts > 0 || pendingCount > 0;

  // Mode réduit : mémorisé, et bascule au clavier (Ctrl/Cmd + B).
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      /* navigation privée */
    }
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleCollapsed();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleCollapsed = () =>
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        /* sans effet */
      }
      return next;
    });

  // On rafraîchit les chiffres en arrivant sur une page où ils ont pu bouger.
  useEffect(() => {
    if (!user) return;
    if (!REFRESH_PAGES.some((p) => pathname.startsWith(p))) return;
    refresh();
    refreshMoney();
  }, [pathname, user, refresh, refreshMoney]);

  const isActive = (m: string) => pathname === m || (m !== "/" && pathname.startsWith(m));

  // ---------- Les 3 sections ----------
  const buyItems: NavItem[] = [
    { to: "/", label: "Accueil", icon: IconHome, match: "/" },
    { to: "/browse", label: "Parcourir le stock", icon: IconGrid, match: "/browse" },
    { to: "/dropshipping", label: "Dropshipping", icon: IconStock, match: "/dropshipping" },
    {
      to: user ? "/favorites" : "/auth",
      label: "Favoris",
      icon: IconHeart,
      match: "/favorites",
      count: info?.favorites || undefined,
      authRedirect: user ? undefined : { redirect: "/favorites", mode: "signup" },
    },
  ];

  const sellItems: NavItem[] = [
    {
      to: user ? "/dashboard" : "/auth",
      label: "Mon stock",
      icon: IconBox,
      match: "/dashboard",
      count: info?.products || undefined,
      authRedirect: user ? undefined : { redirect: "/dashboard", mode: "signup" },
    },
    {
      to: user ? "/profile" : "/auth",
      label: "Portefeuille & pub",
      icon: IconCoins,
      match: "__wallet__",
      count: activeBoosts || undefined,
      search: user ? { tab: "promo" } : undefined,
      authRedirect: user ? undefined : { redirect: "/profile", mode: "signup" },
    },
  ];

  const accountItems: NavItem[] = [
    {
      to: user ? "/profile" : "/auth",
      label: "Profil",
      icon: IconUser,
      match: "/profile",
      authRedirect: user ? undefined : { redirect: "/profile", mode: "login" },
    },
  ];

  // ---------- Checklist de démarrage (disparaît quand tout est fait) ----------
  const steps = [
    { label: "Photo de profil", done: !!info?.avatarUrl, to: "/profile", search: undefined },
    { label: "Numéro WhatsApp", done: !!info?.hasWhatsapp, to: "/profile/edit", search: undefined },
    { label: "Publier un produit", done: (info?.products ?? 0) > 0, to: "/dashboard/new", search: undefined },
    {
      label: "Obtenir le badge vérifié",
      done: !!info?.verified,
      to: "/profile",
      search: undefined,
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const progress = Math.round((doneCount / steps.length) * 100);
  const showChecklist = !!user && !!info && doneCount < steps.length;

  const initials = (info?.shopName || user?.email || "S").trim().slice(0, 2).toUpperCase();

  return (
    <Sidebar
      collapsible="none"
      className={[
        // no-scrollbar : la barre de défilement disparaît. Le contenu est
        // compacté pour tenir à l'écran sans avoir à défiler.
        "hidden md:flex md:sticky md:top-0 md:self-start md:!h-svh md:overflow-y-auto no-scrollbar",
        "border-r border-border bg-background transition-[width] duration-200 ease-linear",
        collapsed ? "md:w-[4.75rem]" : "",
      ].join(" ")}
    >
      {/* ============ En-tête : marque + compte (compact) ============ */}
      <SidebarHeader className="border-b border-border/60 px-3 py-2.5">
        <Link
          to="/"
          className={`flex items-center gap-2 ${collapsed ? "justify-center px-0" : ""}`}
          title="StockMe — Accueil"
        >
          <img src={logoUrl} alt="StockMe" className="h-8 w-8 shrink-0 rounded-lg object-contain" />
          {!collapsed && (
            <span className="truncate text-base font-display font-medium tracking-tight">
              Stock<span className="font-bold">Me</span>
            </span>
          )}
        </Link>

        {/* Identité de la boutique — le nom mène à la boutique publique */}
        {user && (
          <div className={`mt-2 ${collapsed ? "flex justify-center" : ""}`}>
            <div className="flex items-center gap-2">
              <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-volt text-xs font-bold text-volt-foreground">
                {info?.avatarUrl ? (
                  <img src={info.avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  initials
                )}
              </span>
              {!collapsed && (
                <div className="min-w-0 flex-1">
                  <Link
                    to="/vendeur/$id"
                    params={{ id: user.id }}
                    title="Voir ma boutique publique"
                    className="block truncate text-[13px] font-semibold leading-tight hover:text-primary"
                  >
                    {info?.shopName ?? "Ma boutique"}
                  </Link>
                  <span
                    className={`mt-0.5 inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-[9px] font-bold uppercase tracking-wide ${
                      info?.verified
                        ? "border-primary/25 bg-primary/10 text-primary"
                        : "border-border bg-muted text-muted-foreground"
                    }`}
                  >
                    {info?.verified && <IconBadge className="h-2.5 w-2.5" />}
                    {info?.verified ? (info.lifetime ? "Vérifié à vie" : "Vérifié") : "Compte gratuit"}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Visiteur non connecté */}
        {!user && !collapsed && (
          <div className="mt-3 space-y-2 px-2">
            <Link to="/auth" search={{ mode: "signup" } as never} className="block">
              <Button variant="volt" className="h-10 w-full text-xs font-bold">
                Créer mon compte gratuit
              </Button>
            </Link>
            <Link to="/auth" search={{ mode: "login" } as never} className="block">
              <Button variant="outline" className="h-10 w-full text-xs font-semibold">
                Se connecter
              </Button>
            </Link>
          </div>
        )}
      </SidebarHeader>

      <SidebarContent className="px-2 py-2">
        {/* ============ Mon argent : compact, une information et deux actions ============ */}
        {user && wallet && isSeller && !collapsed && (
          <div className="mb-3 rounded-2xl border border-border bg-muted/40 px-3 py-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Solde</span>
              <span className="truncate text-base font-bold tracking-tight">{formatFCFA(balance)}</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => (money ? money.openTopUp() : navigate({ to: "/profile", search: { tab: "promo" } }))}
                className="inline-flex h-8 items-center justify-center gap-1 rounded-lg bg-foreground text-[11px] font-bold text-background transition hover:opacity-90"
              >
                <IconCoins className="h-3.5 w-3.5" /> Recharger
              </button>
              <button
                type="button"
                onClick={() => (money ? setPickerOpen(true) : navigate({ to: "/profile", search: { tab: "promo" } }))}
                className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-border text-[11px] font-bold transition hover:bg-background"
              >
                <IconFlame className="h-3.5 w-3.5 text-volt" /> Booster
              </button>
            </div>
            {/* Une seule ligne d'état : en cours, à reprendre, ou rien. */}
            {pendingCount > 0 ? (
              <button
                type="button"
                onClick={() => money?.resumePending({ amount_fcfa: wallet?.pending?.[0]?.amount_fcfa ?? 1000 })}
                className="mt-1.5 flex w-full items-center gap-1.5 text-left text-[11px] font-semibold text-volt"
              >
                <IconClock className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">
                  {pendingCount} paiement{pendingCount > 1 ? "s" : ""} à reprendre
                </span>
              </button>
            ) : (
              <p className="mt-1.5 truncate text-[11px] text-muted-foreground">
                {activeBoosts > 0
                  ? `${activeBoosts} mise${activeBoosts > 1 ? "s" : ""} en avant active${activeBoosts > 1 ? "s" : ""}`
                  : "Aucune mise en avant en cours"}
              </p>
            )}
          </div>
        )}

        {/* ============ ACHETER ============ */}
        <SidebarGroup className="p-0">
          {!collapsed && (
            <SidebarGroupLabel className="px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Acheter
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent className="mt-1">
            <SidebarMenu className="gap-1">
              {buyItems.map((it) => (
                <NavRow key={it.label} item={it} active={isActive(it.match)} collapsed={collapsed} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* ============ VENDRE ============ */}
        <SidebarGroup className="mt-3 p-0">
          {!collapsed && (
            <SidebarGroupLabel className="px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Vendre
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent className="mt-1">
            <SidebarMenu className="gap-1">
              {/* Publier : la vraie action, en plein orange (l'orange est réservé aux actions) */}
              <SidebarMenuItem>
                <Link
                  to={user ? "/dashboard/new" : "/auth"}
                  search={(user ? undefined : { redirect: "/dashboard/new", mode: "signup" }) as never}
                  title="Publier un produit"
                  className={`flex h-10 items-center gap-3 rounded-xl bg-volt font-bold text-volt-foreground shadow-sm shadow-volt/30 transition hover:brightness-110 ${
                    collapsed ? "justify-center px-0" : "px-3"
                  }`}
                >
                  <IconSell className="h-[18px] w-[18px] shrink-0" />
                  {!collapsed && <span className="truncate text-sm">Publier un produit</span>}
                </Link>
              </SidebarMenuItem>
              {sellItems.map((it) => (
                <NavRow
                  key={it.label}
                  item={it}
                  active={isActive(it.match) || (it.match === "__wallet__" && isActive("/profile"))}
                  collapsed={collapsed}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* ============ COMPTE ============ */}
        <SidebarGroup className="mt-3 p-0">
          {!collapsed && (
            <SidebarGroupLabel className="px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Compte
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent className="mt-1">
            <SidebarMenu className="gap-1">
              {accountItems.map((it) => (
                <NavRow key={it.label} item={it} active={isActive(it.match)} collapsed={collapsed} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* ============ Checklist de démarrage : une seule ligne, dépliable ============ */}
        {showChecklist && !collapsed && (
          <div className="mt-auto pt-3">
            <button
              type="button"
              onClick={() => setCheckOpen((v) => !v)}
              className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-[11px] text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <span className="relative grid h-4 w-4 shrink-0 place-items-center">
                <svg viewBox="0 0 36 36" className="h-4 w-4 -rotate-90">
                  <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="6" />
                  <circle
                    cx="18"
                    cy="18"
                    r="15"
                    fill="none"
                    stroke="var(--volt)"
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeDasharray={`${(progress / 100) * 94.2} 94.2`}
                  />
                </svg>
              </span>
              <span className="min-w-0 flex-1 truncate">Complétez votre boutique</span>
              <span className="shrink-0 font-bold text-volt">{doneCount}/{steps.length}</span>
            </button>

            {checkOpen && (
              <ul className="mt-1.5 space-y-1.5 px-2 pb-1">
                {steps.map((s) => (
                  <li key={s.label}>
                    {s.done ? (
                      <span className="flex items-center gap-2 text-[11px] text-muted-foreground line-through">
                        <IconCheck className="h-3.5 w-3.5 shrink-0 text-success" /> {s.label}
                      </span>
                    ) : (
                      <Link
                        to={s.to as never}
                        className="flex items-center gap-2 text-[11px] font-medium hover:text-volt"
                      >
                        <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-muted-foreground/50" />
                        {s.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </SidebarContent>

      {/* ============ Pied : admin, réduire, support ============ */}
      <SidebarFooter className="border-t border-border/60 px-3 py-2">
        {/* L'admin est un contexte à part : discret, en bas, sans titre de section. */}
        {isAdmin && !collapsed && (
          <Link
            to="/admin"
            className="mb-1 flex items-center gap-2 rounded-xl px-2 py-1.5 text-[11px] font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <IconAdmin className="h-4 w-4 shrink-0" />
            <span className="truncate">Administration</span>
          </Link>
        )}
        {isAdmin && collapsed && (
          <Link
            to="/admin"
            title="Administration"
            className="mb-1 flex justify-center rounded-xl py-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <IconAdmin className="h-4 w-4" />
          </Link>
        )}

        <div className={`flex items-center gap-1 ${collapsed ? "flex-col" : "justify-between"}`}>
          <button
            type="button"
            onClick={toggleCollapsed}
            title={collapsed ? "Agrandir le menu (Ctrl+B)" : "Réduire le menu (Ctrl+B)"}
            aria-label={collapsed ? "Agrandir le menu" : "Réduire le menu"}
            className={`flex items-center gap-2 rounded-xl py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground ${
              collapsed ? "justify-center px-0" : "px-2"
            }`}
          >
            <IconChevronDown className={`h-4 w-4 shrink-0 transition ${collapsed ? "-rotate-90" : "rotate-90"}`} />
            {!collapsed && <span>Réduire</span>}
          </button>

          <a
            href="https://wa.me/221786635331"
            target="_blank"
            rel="noopener noreferrer"
            title="Aide & support WhatsApp"
            className={`flex items-center gap-2 rounded-xl py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground ${
              collapsed ? "justify-center px-0" : "px-2"
            }`}
          >
            <IconWhatsApp className="h-4 w-4 shrink-0 text-volt" />
            {!collapsed && <span className="truncate">Aide</span>}
          </a>
        </div>
      </SidebarFooter>

      {/* ============ Choix du produit à mettre en avant (pop-up direct) ============ */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-h-[85svh] w-[calc(100%-1.5rem)] max-w-md overflow-y-auto rounded-2xl p-5">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-left">
              <IconFlame className="h-5 w-5 text-volt" /> Quel produit mettre en avant ?
            </DialogTitle>
            <DialogDescription className="text-left">
              Choisissez le produit à faire remonter en tête du catalogue. Vous réglez au jour, depuis votre solde de{" "}
              {formatFCFA(balance)}.
            </DialogDescription>
          </DialogHeader>

          {(info?.items ?? []).length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
              Vous n'avez aucun produit publié pour le moment.
              <Link to="/dashboard/new" className="mt-2 block font-semibold text-volt underline underline-offset-2">
                Publier un produit
              </Link>
            </div>
          ) : (
            <ul className="space-y-2">
              {(info?.items ?? []).map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setPickerOpen(false);
                      money?.openBoost({ id: p.id, name: p.name });
                    }}
                    className="flex w-full items-center gap-3 rounded-xl border border-border p-2 text-left transition hover:border-volt hover:bg-volt/5"
                  >
                    {p.image ? (
                      <img src={p.image} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" />
                    ) : (
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                        <IconBox className="h-5 w-5" />
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{p.name}</span>
                    <span className="shrink-0 text-[11px] font-bold text-volt">Booster</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </Sidebar>
  );
}

/** Une ligne de navigation, avec compteur optionnel et état actif allégé. */
function NavRow({ item, active, collapsed }: { item: NavItem; active: boolean; collapsed: boolean }) {
  const Icon = item.icon;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={active}
        tooltip={collapsed ? item.label : undefined}
        className={[
          "relative h-10 rounded-xl text-sm font-medium transition-all",
          collapsed ? "justify-center px-0" : "px-3",
          active
            ? "bg-muted font-semibold text-foreground before:absolute before:left-0 before:top-1/2 before:h-6 before:w-1 before:-translate-y-1/2 before:rounded-full before:bg-volt"
            : "text-foreground/80 hover:bg-muted hover:text-foreground",
        ].join(" ")}
      >
        <Link
          to={item.to as never}
          search={item.search as never}
          title={item.label}
          className="flex items-center gap-3"
        >
          <Icon className="h-[18px] w-[18px] shrink-0" />
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {typeof item.count === "number" && (
                <span className="shrink-0 rounded-full bg-muted-foreground/15 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                  {item.count}
                </span>
              )}
            </>
          )}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
