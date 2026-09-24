import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/stockme-client";
import { Footer } from "@/components/Footer";
import { MobileNav } from "@/components/MobileNav";
import { MobileFooter } from "@/components/MobileFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { ProductCard, type ListingProduct } from "@/components/ProductCard";
import { SponsorCarousel } from "@/components/SponsorCarousel";
import { Trophy } from "lucide-react";
import { buildSeoHead } from "@/lib/seo";
import { CATEGORIES, WEST_AFRICA_LOCATIONS } from "@/lib/constants";
import {
  IconBox as Package,
  IconClose as X,
  IconArrow as ArrowRight,
  IconStore as Store,
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

const PAGE_SIZE = 24;
const SORTS = [
  { id: "pertinence", label: "Pertinence" },
  { id: "nouveau", label: "Nouveautés" },
  { id: "populaire", label: "Populaires" },
  { id: "promo", label: "Promos" },
  { id: "prix_asc", label: "Prix ↑" },
  { id: "prix_desc", label: "Prix ↓" },
] as const;



function Index() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/" });
  const [items, setItems] = useState<Product[] | null>(null);
  const [q, setQ] = useState(search.q ?? "");
  const [sort, setSort] = useState("pertinence");
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [winners, setWinners] = useState<Product[] | null>(null);

  useEffect(() => {
    // "Potentiel Winner" : on réutilise la fonction de classement déjà en place
    // (aucune migration supplémentaire requise). On trie par contacts + vues.
    supabase
      .rpc("get_ranked_products", { p_sort: "populaire", p_limit: 16, p_offset: 0 })
      .then(({ data }) => {
        const list = ((data as (Product & { contacts_total?: number; views_30?: number })[] | null) ?? []).map((p) => ({
          ...p,
          contacts: p.contacts_total ?? 0,
          views: p.views_30 ?? 0,
        }));
        const engaged = list
          .filter((p) => (p.contacts ?? 0) + (p.views ?? 0) > 0)
          .sort((a, b) => ((b.contacts ?? 0) * 3 + (b.views ?? 0)) - ((a.contacts ?? 0) * 3 + (a.views ?? 0)))
          .slice(0, 8);
        setWinners(engaged);
      });
  }, []);

  useEffect(() => {
    setQ(search.q ?? "");
  }, [search.q]);

  const fetchPage = async (offset: number) => {
    const cities = search.city
      ? null
      : search.country && WEST_AFRICA_LOCATIONS[search.country]
      ? WEST_AFRICA_LOCATIONS[search.country]
      : null;
    const { data } = await supabase.rpc("get_ranked_products", {
      p_sort: sort,
      p_limit: PAGE_SIZE,
      p_offset: offset,
      p_city: search.city ?? null,
      p_cities: cities,
      p_category: search.category ?? null,
      p_q: search.q ?? null,
    });
    return (data as Product[] | null) ?? [];
  };

  useEffect(() => {
    let cancel = false;
    setItems(null);
    setHasMore(false);
    (async () => {
      const list = await fetchPage(0);
      if (cancel) return;
      setItems(list);
      setHasMore(list.length === PAGE_SIZE);
    })();
    return () => {
      cancel = true;
    };
  }, [search.country, search.city, search.category, search.q, sort]);

  const loadMore = async () => {
    if (!items || loadingMore) return;
    setLoadingMore(true);
    const list = await fetchPage(items.length);
    setItems((prev) => [...(prev ?? []), ...list]);
    setHasMore(list.length === PAGE_SIZE);
    setLoadingMore(false);
  };


  const update = (patch: Partial<Filters>) =>
    navigate({ search: (prev: Filters) => ({ ...prev, ...patch }) });
  const clearAll = () => navigate({ search: {} });
  const hasFilters = !!(search.country || search.city || search.category || search.q);

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

      {/* ============ ENCART SPONSORISÉ (carrousel) ============ */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 pt-4 sm:pt-6">
        <SponsorCarousel />
      </section>

      {/* ============ POTENTIEL PRODUIT WINNER ============ */}
      {winners && winners.length > 0 && !hasFilters && (
        <section className="mx-auto max-w-7xl px-4 sm:px-6 pt-6 sm:pt-8">
          <div className="mb-3 flex items-center gap-2">
            <Trophy className="h-4 w-4 text-volt" />
            <h2 className="text-sm sm:text-base font-bold tracking-tight uppercase">Potentiel produit Winner</h2>
            <span className="text-xs text-muted-foreground">· les plus sollicités</span>
          </div>
          <div className="-mx-4 sm:mx-0 overflow-x-auto no-scrollbar">
            <div className="flex gap-3 sm:gap-4 px-4 sm:px-0 snap-x snap-mandatory">
              {winners.map((p, i) => (
                <div key={p.id} className="w-[70%] sm:w-64 shrink-0 snap-start">
                  <ProductCard product={p} delayMs={i * 40} />
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
                : `${items.length} produit${items.length > 1 ? "s" : ""} affiché${items.length > 1 ? "s" : ""}`}
            </h2>
          </div>
        </div>

        {/* Onglets de tri */}
        <div className="mb-4 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-2">
            {SORTS.map((s) => {
              const active = sort === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setSort(s.id)}
                  className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                    active ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {s.label}
                </button>
              );
            })}
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
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
              {items.map((p, i) => (
                <ProductCard key={p.id} product={p} delayMs={(i % PAGE_SIZE) * 40} />
              ))}
            </div>
            {hasMore && (
              <div className="mt-8 flex justify-center">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="h-11 rounded-full border border-border bg-card px-6 text-sm font-semibold transition hover:bg-accent disabled:opacity-60"
                >
                  {loadingMore ? "Chargement…" : "Charger plus de produits"}
                </button>
              </div>
            )}
          </>
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

