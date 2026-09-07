import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/stockme-client";
import { Footer } from "@/components/Footer";
import { MobileNav } from "@/components/MobileNav";
import { MobileFooter } from "@/components/MobileFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { ProductCard, type ListingProduct } from "@/components/ProductCard";
import { buildSeoHead } from "@/lib/seo";
import { CATEGORIES, WEST_AFRICA_LOCATIONS } from "@/lib/constants";
import { formatFCFA } from "@/lib/format";
import {
  IconBox as Package,
  IconClose as X,
  IconArrow as ArrowRight,
  IconStore as Store,
  IconFlame as Flame,
} from "@/components/icons";

type Filters = { country?: string; city?: string; category?: string; q?: string };

export const Route = createFileRoute("/")({
  validateSearch: (s: Record<string, unknown>): Filters => ({
    country: typeof s.country === "string" ? s.country : undefined,
    city: typeof s.city === "string" ? s.city : undefined,
    category: typeof s.category === "string" ? s.category : undefined,
    q: typeof s.q === "string" ? s.q : undefined,
  }),
  head: () => {
    const { meta, links } = buildSeoHead({
      title: "StockMe — Achetez & vendez du stock en gros en Afrique de l'Ouest",
      description:
        "Marketplace B2B d'Afrique de l'Ouest : écoulez votre stock dormant et achetez des produits en gros (lots, MOQ) près de chez vous. Contact direct WhatsApp, sans intermédiaire.",
      path: "/",
      keywords:
        "stock en gros, vente en gros, marketplace B2B, stock dormant, liquidation stock, Afrique de l'Ouest, Sénégal, Côte d'Ivoire, Mali, gros acheteur, revendeur, B2B Afrique",
    });
    return { meta, links };
  },
  component: Index,
});

type Product = ListingProduct;



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
        .eq("dropshipping", false)
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
      <SiteHeader
        q={q}
        onQChange={setQ}
        country={search.country}
        city={search.city}
        countries={countries}
        cities={availableCities}
        onUpdate={(patch) => update(patch)}
        onSubmit={() => update({ q: q || undefined })}
      />


      {/* ============ CATEGORY RAIL ============ */}
      <section className="border-b border-border bg-background sticky top-0 z-30 backdrop-blur">
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
            {items.map((p, i) => (
              <ProductCard key={p.id} product={p} delayMs={i * 45} />
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

