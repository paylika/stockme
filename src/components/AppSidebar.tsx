import { Link, useRouterState } from "@tanstack/react-router";
import {
  IconHome,
  IconHeart,
  IconSell,
  IconStock,
  IconUser,
  IconAdmin,
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
import { useAuth } from "@/hooks/useAuth";
import { isAdminEmail } from "@/lib/constants";
import logoUrl from "@/assets/stockme-logo.png";

export function AppSidebar() {
  const { user } = useAuth();
  const pathname = useRouterState({ select: (r) => r.location.pathname });

  const items = [
    { to: "/", label: "Accueil", icon: IconHome, match: "/" },
    { to: "/dropshipping", label: "Dropshipping", icon: IconStock, match: "/dropshipping" },
    {
      to: user ? "/favorites" : "/auth",
      label: "Favoris",
      icon: IconHeart,
      search: user ? undefined : { redirect: "/favorites", mode: "signup" as const },
      match: "/favorites",
    },
    {
      to: user ? "/dashboard/new" : "/auth",
      label: "Publier",
      icon: IconSell,
      search: user ? undefined : { redirect: "/dashboard/new", mode: "signup" as const },
      match: "/dashboard/new",
    },
    {
      to: user ? "/profile" : "/auth",
      label: "Profil",
      icon: IconUser,
      search: user ? undefined : { redirect: "/profile", mode: "login" as const },
      match: "/profile",
    },
  ];

  const isActive = (m: string) =>
    pathname === m || (m !== "/" && pathname.startsWith(m));

  return (
    <Sidebar
      collapsible="none"
      className="hidden md:flex md:sticky md:top-0 md:self-start md:!h-svh md:overflow-y-auto border-r border-border bg-background"
    >
      <SidebarHeader className="border-b border-border/60 py-4">
        <Link to="/" className="flex items-center gap-2.5 px-2">
          <img src={logoUrl} alt="StockMe" className="h-9 w-9 shrink-0 rounded-xl object-contain" />
          <span className="truncate text-lg font-display font-medium tracking-tight">
            Stock<span className="font-bold">Me</span>
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-2 py-4">
        <SidebarGroup>
          <SidebarGroupLabel className="px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Navigation
          </SidebarGroupLabel>
          <SidebarGroupContent className="mt-2">
            <SidebarMenu className="gap-1">
              {items.map((it) => {
                const active = isActive(it.match);
                const Icon = it.icon;
                return (
                  <SidebarMenuItem key={it.label}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      className={[
                        "h-11 rounded-xl px-3 text-sm font-medium transition-all",
                        active
                          ? "bg-volt text-volt-foreground shadow-sm shadow-volt/30 hover:bg-volt hover:text-volt-foreground data-[active=true]:bg-volt data-[active=true]:text-volt-foreground"
                          : "text-foreground/80 hover:bg-muted hover:text-foreground",
                      ].join(" ")}
                    >
                      <Link to={it.to} search={it.search as any} className="flex items-center gap-3">
                        <Icon className="h-[18px] w-[18px] shrink-0" />
                        <span className="truncate">{it.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
              {isAdminEmail(user?.email) && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive("/admin")}
                    className={[
                      "h-11 rounded-xl px-3 text-sm font-medium transition-all",
                      isActive("/admin")
                        ? "bg-volt text-volt-foreground shadow-sm shadow-volt/30 hover:bg-volt hover:text-volt-foreground data-[active=true]:bg-volt data-[active=true]:text-volt-foreground"
                        : "text-foreground/80 hover:bg-muted hover:text-foreground",
                    ].join(" ")}
                  >
                    <Link to="/admin" className="flex items-center gap-3">
                      <IconAdmin className="h-[18px] w-[18px] shrink-0" />
                      <span className="truncate">Admin</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-border/60 p-3">
        <a
          href="https://wa.me/221786635331"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2.5 rounded-xl bg-foreground px-3 py-2.5 text-xs font-semibold text-background hover:opacity-90 transition"
        >
          <IconWhatsApp className="h-4 w-4 text-volt" />
          <span className="truncate">Besoin d'aide ? WhatsApp</span>
        </a>
      </SidebarFooter>
    </Sidebar>
  );
}
