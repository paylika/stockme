import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  AreaChart,
  Area,
  Cell,
} from "recharts";
import { supabase } from "@/integrations/supabase/stockme-client";
import { Header } from "@/components/Header";
import { MobileNav } from "@/components/MobileNav";
import { countryOfCity, COUNTRY_FLAGS } from "@/lib/constants";
import { formatFCFA } from "@/lib/format";
import {
  IconUsers,
  IconStock,
  IconCoins,
  IconFlame,
  IconGlobe,
  IconPin,
  IconTrend,
  IconClock,
  IconAdmin,
} from "@/components/icons";

type Profile = {
  id: string;
  full_name: string | null;
  phone: string | null;
  whatsapp: string | null;
  city: string | null;
  role: string;
  created_at: string;
};

type Product = {
  id: string;
  name: string;
  category: string;
  price_fcfa: number;
  promo_price_fcfa: number | null;
  quantity: number;
  moq: number;
  city: string | null;
  zone: string | null;
  owner_id: string;
  created_at: string;
};

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async ({ location }) => {
    if (typeof window === "undefined") return;
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;
    if (!user) {
      const redirectTo = `${location.pathname}${location.searchStr}${location.hash}`;
      throw redirect({ to: "/auth", search: { redirect: redirectTo, mode: "login" } });
    }
    const { data: adminRole, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (error || !adminRole) throw redirect({ to: "/" });
  },
  component: Admin,
});

const PALETTE = ["#1F3D8F", "#F0A836", "#2E63C9", "#E4852B", "#5B8DEF", "#C56A1E", "#8AB0F5", "#A8560F"];

function Admin() {
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    (async () => {
      const [{ data: profs }, { data: prods }] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at", { ascending: false }),
        supabase
          .from("products")
          .select("id,name,category,price_fcfa,promo_price_fcfa,quantity,moq,city,zone,owner_id,created_at")
          .order("created_at", { ascending: false }),
      ]);
      setProfiles((profs ?? []) as Profile[]);
      setProducts((prods ?? []) as Product[]);
    })();
  }, []);

  const loading = profiles === null || products === null;
  const profs = profiles ?? [];
  const prods = products ?? [];

  const ownerName = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of profs) m.set(p.id, p.full_name || "—");
    return m;
  }, [profs]);

  const stats = useMemo(() => {
    const now = Date.now();
    const weekAgo = now - 7 * 864e5;
    const stockValue = prods.reduce(
      (s, p) => s + (p.promo_price_fcfa && p.promo_price_fcfa < p.price_fcfa ? p.promo_price_fcfa : p.price_fcfa) * (p.quantity || 0),
      0,
    );
    const activePromos = prods.filter((p) => p.promo_price_fcfa && p.promo_price_fcfa < p.price_fcfa).length;
    const countries = new Set<string>();
    const cities = new Set<string>();
    for (const p of prods) {
      if (p.city) cities.add(p.city);
      countries.add(countryOfCity(p.city));
    }
    for (const u of profs) {
      if (u.city) cities.add(u.city);
      countries.add(countryOfCity(u.city));
    }
    const newUsers = profs.filter((u) => new Date(u.created_at).getTime() > weekAgo).length;
    const newProducts = prods.filter((p) => new Date(p.created_at).getTime() > weekAgo).length;
    return {
      users: profs.length,
      products: prods.length,
      stockValue,
      activePromos,
      countries: countries.size,
      cities: cities.size,
      newUsers,
      newProducts,
    };
  }, [profs, prods]);

  const byCategory = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of prods) m.set(p.category, (m.get(p.category) ?? 0) + 1);
    return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [prods]);

  const byCountry = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of prods) {
      const c = countryOfCity(p.city);
      m.set(c, (m.get(c) ?? 0) + 1);
    }
    return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [prods]);

  const topCities = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of prods) if (p.city) m.set(p.city, (m.get(p.city) ?? 0) + 1);
    return [...m.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [prods]);

  const signups = useMemo(() => {
    // 8 dernières semaines
    const weeks: { name: string; value: number }[] = [];
    const now = new Date();
    for (let i = 7; i >= 0; i--) {
      const end = new Date(now.getTime() - i * 7 * 864e5);
      const start = end.getTime() - 7 * 864e5;
      const count = profs.filter((u) => {
        const t = new Date(u.created_at).getTime();
        return t > start && t <= end.getTime();
      }).length;
      weeks.push({ name: `S-${i}`, value: count });
    }
    return weeks;
  }, [profs]);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6 sm:py-10 pb-24 md:pb-10">
        {/* En-tête */}
        <div className="flex items-center gap-2">
          <IconAdmin className="h-5 w-5 text-volt" />
          <p className="text-[11px] font-semibold tracking-[0.2em] uppercase text-muted-foreground">Administration</p>
        </div>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <h1 className="font-display text-2xl sm:text-4xl font-bold tracking-tight">Pilotage StockMe</h1>
          <span className="text-xs text-muted-foreground">
            Mise à jour {new Date().toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}
          </span>
        </div>

        {/* KPIs */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <Kpi icon={IconUsers} label="Utilisateurs" value={loading ? "…" : stats.users} accent="primary" hint={loading ? "" : `+${stats.newUsers} cette semaine`} />
          <Kpi icon={IconStock} label="Produits" value={loading ? "…" : stats.products} accent="primary" hint={loading ? "" : `+${stats.newProducts} cette semaine`} />
          <Kpi icon={IconCoins} label="Valeur du stock" value={loading ? "…" : formatFCFA(stats.stockValue)} accent="volt" small />
          <Kpi icon={IconFlame} label="Promos actives" value={loading ? "…" : stats.activePromos} accent="volt" />
          <Kpi icon={IconGlobe} label="Pays couverts" value={loading ? "…" : stats.countries} accent="primary" />
          <Kpi icon={IconPin} label="Villes couvertes" value={loading ? "…" : stats.cities} accent="primary" />
          <Kpi icon={IconTrend} label="Nouveaux (7j)" value={loading ? "…" : stats.newUsers + stats.newProducts} accent="volt" hint="users + produits" />
          <Kpi icon={IconClock} label="Panier moyen" value={loading || stats.products === 0 ? "…" : formatFCFA(Math.round(stats.stockValue / Math.max(1, stats.products)))} accent="volt" small />
        </div>

        {/* Graphiques */}
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <ChartCard title="Produits par catégorie" icon={IconStock}>
            {mounted && byCategory.length > 0 && (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={byCategory} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={60} stroke="var(--muted-foreground)" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                  <Tooltip content={<TipBox />} cursor={{ fill: "color-mix(in oklab, var(--primary) 8%, transparent)" }} />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {byCategory.map((_, i) => (
                      <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard title="Répartition internationale" icon={IconGlobe}>
            {mounted && byCountry.length > 0 && (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart layout="vertical" data={byCountry} margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={90} stroke="var(--muted-foreground)" />
                  <Tooltip content={<TipBox />} cursor={{ fill: "color-mix(in oklab, var(--primary) 8%, transparent)" }} />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]} fill="#1F3D8F" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard title="Top villes" icon={IconPin}>
            {mounted && topCities.length > 0 && (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={topCities} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={56} stroke="var(--muted-foreground)" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                  <Tooltip content={<TipBox />} cursor={{ fill: "color-mix(in oklab, var(--volt) 12%, transparent)" }} />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]} fill="#F0A836" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard title="Inscriptions (8 semaines)" icon={IconTrend}>
            {mounted && (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={signups} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradSignup" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#1F3D8F" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#1F3D8F" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                  <Tooltip content={<TipBox />} />
                  <Area type="monotone" dataKey="value" stroke="#1F3D8F" strokeWidth={2} fill="url(#gradSignup)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>

        {/* Derniers produits */}
        <SectionTitle>Derniers produits</SectionTitle>
        <div className="mt-4 rounded-2xl border border-border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3">Produit</th>
                <th className="text-left px-4 py-3 hidden sm:table-cell">Catégorie</th>
                <th className="text-right px-4 py-3">Prix</th>
                <th className="text-right px-4 py-3 hidden sm:table-cell">Stock</th>
                <th className="text-left px-4 py-3 hidden md:table-cell">Ville</th>
                <th className="text-left px-4 py-3 hidden lg:table-cell">Vendeur</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">Chargement…</td></tr>
              ) : prods.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">Aucun produit</td></tr>
              ) : prods.slice(0, 12).map((p) => {
                const hasPromo = p.promo_price_fcfa && p.promo_price_fcfa < p.price_fcfa;
                return (
                  <tr key={p.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium max-w-[220px] truncate">
                      <Link to="/product/$id" params={{ id: p.id }} className="hover:text-primary">{p.name}</Link>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground">{p.category}</td>
                    <td className="px-4 py-3 text-right font-semibold whitespace-nowrap">
                      {formatFCFA(hasPromo ? p.promo_price_fcfa! : p.price_fcfa)}
                      {hasPromo && <span className="ml-1 text-[10px] font-bold text-volt">PROMO</span>}
                    </td>
                    <td className="px-4 py-3 text-right hidden sm:table-cell text-muted-foreground">{p.quantity}</td>
                    <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">{p.zone || p.city || "—"}</td>
                    <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground truncate max-w-[160px]">{ownerName.get(p.owner_id) || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Utilisateurs */}
        <SectionTitle>Utilisateurs inscrits ({loading ? "…" : profs.length})</SectionTitle>
        <div className="mt-4 rounded-2xl border border-border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3">Nom</th>
                <th className="text-left px-4 py-3 hidden sm:table-cell">Pays</th>
                <th className="text-left px-4 py-3 hidden sm:table-cell">Ville</th>
                <th className="text-left px-4 py-3">WhatsApp</th>
                <th className="text-left px-4 py-3 hidden md:table-cell">Rôle</th>
                <th className="text-left px-4 py-3 hidden md:table-cell">Inscrit le</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">Chargement…</td></tr>
              ) : profs.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">Aucun utilisateur</td></tr>
              ) : profs.map((p) => (
                <tr key={p.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{p.full_name || "—"}</td>
                  <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground whitespace-nowrap">
                    {COUNTRY_FLAGS[countryOfCity(p.city)] ?? ""} {countryOfCity(p.city)}
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground">{p.city || "—"}</td>
                  <td className="px-4 py-3">
                    {p.whatsapp ? (
                      <a href={`https://wa.me/${p.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="text-volt underline underline-offset-2 font-medium whitespace-nowrap">{p.whatsapp}</a>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs capitalize">{p.role}</span>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-muted-foreground text-xs whitespace-nowrap">
                    {new Date(p.created_at).toLocaleDateString("fr-FR")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Link to="/" className="mt-8 inline-block text-sm text-muted-foreground hover:text-foreground underline underline-offset-2">← Retour à l'accueil</Link>
      </div>
      <MobileNav />
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  accent,
  hint,
  small,
}: {
  icon: (p: any) => JSX.Element;
  label: string;
  value: number | string;
  accent: "primary" | "volt";
  hint?: string;
  small?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">{label}</span>
        <span
          className={`grid h-8 w-8 place-items-center rounded-lg ${
            accent === "volt" ? "bg-volt/15 text-volt" : "bg-primary/10 text-primary"
          }`}
        >
          <Icon className="h-[18px] w-[18px]" />
        </span>
      </div>
      <div className={`mt-2 font-bold tracking-tight ${small ? "text-lg sm:text-xl" : "text-2xl sm:text-3xl"}`}>{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function ChartCard({ title, icon: Icon, children }: { title: string; icon: (p: any) => JSX.Element; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-10 text-lg sm:text-xl font-semibold tracking-tight">{children}</h2>;
}

function TipBox({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="font-medium">{label}</div>
      <div className="text-muted-foreground">{payload[0].value} produit(s)</div>
    </div>
  );
}
