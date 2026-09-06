import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/stockme-client";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { MobileNav } from "@/components/MobileNav";
import { MobileFooter } from "@/components/MobileFooter";
import { CATEGORIES, WEST_AFRICA_LOCATIONS } from "@/lib/constants";
import { formatFCFA } from "@/lib/format";
import {
  IconPin as MapPin,
  IconBox as Package,
  IconSearch as Search,
  IconClose as X,
  IconArrow as ArrowRight,
  IconWhatsApp as MessageCircle,
  IconShield as ShieldCheck,
  IconBadge as BadgeCheck,
  IconStore as Store,
  IconFlame as Flame,
  IconChevronDown as ChevronDown,
} from "@/components/icons";

type Filters = { country?: string; city?: string; category?: string; q?: string };

export const Route = createFileRoute("/")({
  validateSearch: (s: Record<string, unknown>): Filters => ({
    country: typeof s.country === "string" ? s.country : undefined,
    city: typeof s.city === "string" ? s.city : undefined,
    category: typeof s.category === "string" ? s.category : undefined,
    q: typeof s.q === "string" ? s.q : undefined,
  }),
  head: () => ({
    meta: [
      { title: "StockMe — Écoulez et trouvez du stock en Afrique de l'Ouest" },
      {
        name: "description",
        content:
          "La marketplace B2B de l'Afrique de l'Ouest. Écoulez votre stock dormant, trouvez des produits près de chez vous, contact direct WhatsApp.",
      },
    ],
  }),
  component: Index,
});

type Product = {
  id: string;
  name: string;
  category: string;
  price_fcfa: number;
  promo_price_fcfa: number | null;
  quantity: number;
  moq: number;
  city: string;
  zone: string | null;
  images: string[];
  sold_out: boolean;
};



function Index() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/" });
  const [items, setItems] = useState<Product[] | null>(null);
  const [q, setQ] = useState(search.q ?? "");

  useEffect(() => {
    setQ(search.q ?? "");
  }, [search.q]);

  useEffect(() => {
    let cancel = false;
    setItems(null);
    (async () => {
      let query = supabase
        .from("products")
        .select("id,name,category,price_fcfa,promo_price_fcfa,quantity,moq,city,zone,images,sold_out")
        .eq("published", true)
        .order("created_at", { ascending: false })
        .limit(60);
      if (search.city) {
        query = query.eq("city", search.city);
      } else if (search.country && WEST_AFRICA_LOCATIONS[search.country]) {
        query = query.in("city", WEST_AFRICA_LOCATIONS[search.country]);
      }
      if (search.category) query = query.eq("category", search.category);
      if (search.q) query = query.ilike("name", `%${search.q}%`);
      const { data } = await query;
      if (!cancel) setItems((data as Product[] | null) ?? []);
    })();
    return () => {
      cancel = true;
    };
  }, [search.country, search.city, search.category, search.q]);


  const update = (patch: Partial<Filters>) =>
    navigate({ search: (prev: Filters) => ({ ...prev, ...patch }) });
  const clearAll = () => navigate({ search: {} });
  const hasFilters = !!(search.country || search.city || search.category || search.q);

  const promos = useMemo(
    () => (items ?? []).filter((p) => p.promo_price_fcfa && p.promo_price_fcfa < p.price_fcfa).slice(0, 6),
    [items],
  );

  const countries = useMemo(() => Object.keys(WEST_AFRICA_LOCATIONS).sort((a, b) => a.localeCompare(b, "fr")), []);
  const availableCities = useMemo(() => {
    if (search.country && WEST_AFRICA_LOCATIONS[search.country]) {
      return [...WEST_AFRICA_LOCATIONS[search.country]].sort((a, b) => a.localeCompare(b, "fr"));
    }
    return Object.values(WEST_AFRICA_LOCATIONS).flat().sort((a, b) => a.localeCompare(b, "fr"));
  }, [search.country]);

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <Header />

      {/* ============ COMPACT HERO ============ */}
      <section className="relative border-b border-border overflow-hidden">
        {/* Fond de marque subtil */}
        <div
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(90rem 30rem at 15% -10%, color-mix(in oklab, var(--primary) 12%, transparent), transparent 60%), radial-gradient(70rem 26rem at 100% 0%, color-mix(in oklab, var(--volt) 16%, transparent), transparent 55%)",
          }}
        />
        <div
          className="pointer-events-none absolute inset-0 -z-10 opacity-[0.5]"
          style={{
            backgroundImage:
              "linear-gradient(to right, color-mix(in oklab, var(--border) 55%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in oklab, var(--border) 55%, transparent) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
            maskImage: "linear-gradient(to bottom, black, transparent 75%)",
            WebkitMaskImage: "linear-gradient(to bottom, black, transparent 75%)",
          }}
        />
        <div className="mx-auto max-w-7xl px-4 sm:px-6 pt-6 sm:pt-10 pb-4 sm:pb-6">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-[11px] font-semibold text-primary">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-volt opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-volt" />
            </span>
            Marketplace B2B · Afrique de l'Ouest
          </div>
          {/* Titre */}
          <h1 className="mt-3 font-display font-bold tracking-tight text-foreground text-2xl sm:text-4xl md:text-5xl leading-[1.05] max-w-3xl">
            Votre stock, <span className="font-serif italic font-normal text-primary">en mouvement.</span>
          </h1>
          <p className="mt-2.5 text-sm sm:text-base text-muted-foreground max-w-xl">
            Écoulez votre stock dormant, trouvez des produits près de chez vous. Contact direct sur WhatsApp, sans intermédiaire.
          </p>

          {/* Unified search bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              update({ q: q || undefined });
            }}
            className="mt-3 sm:mt-4"
          >
            {/* Mobile: single pill with search + inline submit */}
            <div className="sm:hidden">
              <div className="relative flex items-center h-12 rounded-full border border-border bg-background pl-4 pr-1.5 shadow-sm focus-within:border-foreground/40">
                <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  type="search"
                  inputMode="search"
                  placeholder="Rechercher un produit…"
                  className="min-w-0 flex-1 bg-transparent px-2 text-sm placeholder:text-muted-foreground focus:outline-none"
                />
                <button
                  type="submit"
                  aria-label="Rechercher"
                  className="grid h-9 w-9 place-items-center rounded-full bg-foreground text-background hover:opacity-90 transition shrink-0"
                >
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>

              {/* Country + City compact row */}
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div className="relative">
                  <select
                    value={search.country ?? ""}
                    onChange={(e) => update({ country: e.target.value || undefined, city: undefined })}
                    className="appearance-none w-full h-10 rounded-full border border-border bg-background pl-3 pr-8 text-xs font-medium focus:outline-none focus:border-foreground/40 truncate"
                  >
                    <option value="">Tous les pays</option>
                    {countries.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                </div>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <input
                    list="stockme-cities"
                    value={search.city ?? ""}
                    onChange={(e) => update({ city: e.target.value || undefined })}
                    type="search"
                    placeholder="Ville"
                    className="w-full h-10 rounded-full border border-border bg-background pl-8 pr-3 text-xs font-medium placeholder:text-muted-foreground focus:outline-none focus:border-foreground/40"
                  />
                </div>
              </div>
            </div>

            {/* Desktop: single row */}
            <div className="hidden sm:grid gap-2 grid-cols-[1fr_auto_auto_auto] items-stretch">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  type="search"
                  inputMode="search"
                  placeholder="Rechercher un produit, une marque…"
                  className="w-full h-11 rounded-xl border border-border bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-foreground/40"
                />
              </div>
              <div className="relative">
                <select
                  value={search.country ?? ""}
                  onChange={(e) => update({ country: e.target.value || undefined, city: undefined })}
                  className="appearance-none w-40 h-11 rounded-xl border border-border bg-background pl-3 pr-8 text-sm focus:outline-none focus:border-foreground/40"
                >
                  <option value="">Tous les pays</option>
                  {countries.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              </div>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <input
                  list="stockme-cities"
                  value={search.city ?? ""}
                  onChange={(e) => update({ city: e.target.value || undefined })}
                  type="search"
                  placeholder="Ville / région"
                  className="w-48 h-11 rounded-xl border border-border bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-foreground/40"
                />
              </div>
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-1.5 h-11 rounded-xl bg-foreground text-background px-5 text-sm font-semibold hover:opacity-90 transition"
              >
                <span>Rechercher</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>

            <datalist id="stockme-cities">
              {availableCities.map((city) => (
                <option key={city} value={city} />
              ))}
            </datalist>
          </form>

          {/* Trust row — subtle inline */}
          <div className="mt-3 flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> Vérifiés</span>
            <span className="h-0.5 w-0.5 rounded-full bg-muted-foreground/50" />
            <span className="inline-flex items-center gap-1"><MessageCircle className="h-3 w-3" /> WhatsApp</span>
            <span className="h-0.5 w-0.5 rounded-full bg-muted-foreground/50" />
            <span className="inline-flex items-center gap-1"><BadgeCheck className="h-3 w-3" /> 100% gratuit</span>
          </div>
        </div>
      </section>


      {/* ============ CATEGORY RAIL ============ */}
      <section className="border-b border-border bg-background sticky top-14 md:top-0 z-30 backdrop-blur">
        <div className="mx-auto max-w-7xl">
          <div className="overflow-x-auto no-scrollbar">
            <div className="flex items-center gap-2 px-4 sm:px-6 py-3">
              <button
                onClick={() => update({ category: undefined })}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                  !search.category
                    ? "bg-volt text-volt-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                Tout
              </button>
              {CATEGORIES.map((c) => {
                const active = search.category === c;
                return (
                  <button
                    key={c}
                    onClick={() => update({ category: active ? undefined : c })}
                    className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                      active
                        ? "bg-volt text-volt-foreground"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ============ ACTIVE FILTERS ============ */}
      {hasFilters && (
        <div className="mx-auto max-w-7xl px-4 sm:px-6 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            {search.q && <Chip onRemove={() => update({ q: undefined })}>« {search.q} »</Chip>}
            {search.country && <Chip onRemove={() => update({ country: undefined, city: undefined })}>{search.country}</Chip>}
            {search.city && <Chip onRemove={() => update({ city: undefined })}>{search.city}</Chip>}
            {search.category && (
              <Chip onRemove={() => update({ category: undefined })}>{search.category}</Chip>
            )}
            <button
              onClick={clearAll}
              className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              Tout effacer
            </button>
          </div>
        </div>
      )}

      {/* ============ PROMO STRIP ============ */}
      {promos.length > 0 && !hasFilters && (
        <section className="mx-auto max-w-7xl px-4 sm:px-6 pt-6 sm:pt-8">
          <div className="flex items-end justify-between mb-3">
            <div className="flex items-center gap-2">
              <Flame className="h-4 w-4 text-volt" />
              <h2 className="text-sm sm:text-base font-bold tracking-tight uppercase">Promotions</h2>
            </div>
          </div>
          <div className="-mx-4 sm:mx-0 overflow-x-auto no-scrollbar">
            <div className="flex gap-3 sm:gap-4 px-4 sm:px-0 snap-x snap-mandatory">
              {promos.map((p) => (
                <div key={p.id} className="w-[70%] sm:w-64 shrink-0 snap-start">
                  <ProductCard product={p} />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ============ PRODUCT GRID ============ */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-6 sm:py-10">
        <div className="flex items-end justify-between flex-wrap gap-3 mb-4 sm:mb-6">
          <div>
            <p className="text-[10px] sm:text-xs font-semibold tracking-[0.22em] text-muted-foreground uppercase">
              {search.category ?? "Sélection"}
            </p>
            <h2 className="mt-1 text-xl sm:text-3xl font-bold tracking-tight">
              {items === null
                ? "Chargement…"
                : items.length === 0
                ? "Aucun résultat"
                : `${items.length} produit${items.length > 1 ? "s" : ""} disponible${items.length > 1 ? "s" : ""}`}
            </h2>
          </div>
        </div>

        {items === null ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState onClear={clearAll} />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
            {items.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </section>

      {/* ============ SELL CTA ============ */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 pb-10 sm:pb-16">
        <div className="relative overflow-hidden rounded-3xl border border-foreground/10 bg-foreground text-background p-6 sm:p-10">
          <div
            className="absolute inset-0 opacity-30"
            style={{
              background:
                "radial-gradient(600px 300px at 90% 20%, color-mix(in oklab, var(--volt) 50%, transparent), transparent 60%)",
            }}
          />
          <div className="relative grid gap-6 sm:grid-cols-[1fr_auto] sm:items-end">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-background/20 px-3 py-1 text-[11px]">
                <Store className="h-3 w-3" /> Vendeurs
              </div>
              <h3 className="mt-3 font-display text-2xl sm:text-4xl font-bold tracking-tight max-w-lg">
                Publiez votre stock. Le marché fait le reste.
              </h3>
              <p className="mt-2 text-sm sm:text-base text-background/70 max-w-md">
                Ajoutez vos produits en 2 minutes. Les acheteurs vous contactent directement sur WhatsApp.
              </p>
            </div>
            <Link
              to="/dashboard/new"
              className="inline-flex items-center justify-center gap-2 h-12 rounded-full bg-volt px-6 text-sm font-bold text-volt-foreground shadow-lg shadow-volt/30 hover:brightness-110 transition"
            >
              Publier un produit <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <Footer />
      <MobileFooter />
      <MobileNav />
    </div>
  );
}

function Chip({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-foreground text-background px-3 py-1 text-xs font-medium">
      {children}
      <button onClick={onRemove} aria-label="Retirer">
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-border overflow-hidden bg-card">
      <div className="aspect-square shimmer bg-muted" />
      <div className="p-3 space-y-2">
        <div className="h-4 w-3/4 rounded shimmer bg-muted" />
        <div className="h-3 w-1/2 rounded shimmer bg-muted" />
      </div>
    </div>
  );
}

function EmptyState({ onClear }: { onClear: () => void }) {
  return (
    <div className="grid place-items-center py-16 text-center border border-dashed border-border rounded-3xl bg-muted/30">
      <Package className="h-10 w-10 text-muted-foreground" />
      <h3 className="mt-4 text-lg font-semibold">Aucun produit trouvé</h3>
      <p className="mt-1 text-sm text-muted-foreground max-w-xs">
        Essayez d'élargir vos filtres ou explorez une autre catégorie.
      </p>
      <button
        onClick={onClear}
        className="mt-4 rounded-full bg-foreground text-background px-4 py-2 text-xs font-semibold"
      >
        Réinitialiser les filtres
      </button>
    </div>
  );
}

function ProductCard({ product }: { product: Product }) {
  const img = product.images[0];
  const hasPromo = product.promo_price_fcfa && product.promo_price_fcfa < product.price_fcfa;
  const discount = hasPromo
    ? Math.round(((product.price_fcfa - (product.promo_price_fcfa as number)) / product.price_fcfa) * 100)
    : 0;
  return (
    <Link
      to="/product/$id"
      params={{ id: product.id }}
      className="group block rounded-2xl border border-border bg-card overflow-hidden hover:border-foreground/40 transition-all hover:-translate-y-0.5 hover:shadow-[0_20px_40px_-20px_rgba(0,0,0,0.2)]"
    >
      <div className="aspect-square bg-muted overflow-hidden relative">
        {img ? (
          <img
            src={img}
            alt={product.name}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="grid h-full place-items-center text-muted-foreground">
            <Package className="h-10 w-10" />
          </div>
        )}
        {hasPromo && (
          <div className="absolute top-2 left-2 rounded-full bg-volt text-volt-foreground px-2 py-0.5 text-[10px] font-black tracking-wide">
            -{discount}%
          </div>
        )}
        {product.sold_out && (
          <div className="absolute top-2 right-2 rounded-full bg-destructive text-background px-2 py-0.5 text-[10px] font-black tracking-wide">
            Épuisé
          </div>
        )}
        <div className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-background/95 backdrop-blur px-2 py-0.5 text-[10px] font-medium">
          <MapPin className="h-2.5 w-2.5" /> {product.zone || product.city}
        </div>
      </div>
      <div className="p-3 sm:p-4">
        <h3 className="font-semibold leading-tight line-clamp-1 text-sm sm:text-base">{product.name}</h3>
        <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-1">{product.category}</p>
        <div className="mt-2 flex items-baseline justify-between gap-2">
          {hasPromo ? (
            <div className="flex items-baseline gap-1.5 flex-wrap">
              <span className="text-base sm:text-lg font-bold tracking-tight">
                {formatFCFA(product.promo_price_fcfa!)}
              </span>
              <span className="text-[11px] line-through text-muted-foreground">
                {formatFCFA(product.price_fcfa)}
              </span>
            </div>
          ) : (
            <div className="text-base sm:text-lg font-bold tracking-tight">
              {formatFCFA(product.price_fcfa)}
            </div>
          )}
        </div>
        <div className="mt-1 text-[10px] sm:text-[11px] text-muted-foreground">
          MOQ {product.moq} · Stock {product.quantity}
        </div>
      </div>
    </Link>
  );
}
