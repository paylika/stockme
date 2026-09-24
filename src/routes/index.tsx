import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/stockme-client";
import { Footer } from "@/components/Footer";
import { MobileNav } from "@/components/MobileNav";
import { MobileFooter } from "@/components/MobileFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { ProductCard, type ListingProduct } from "@/components/ProductCard";
import { SponsorCarousel } from "@/components/SponsorCarousel";
import { ALL_COUNTRIES, useVisitorCountry } from "@/lib/geo";
import { BadgeCheck, MapPin, Trophy } from "lucide-react";
import { buildSeoHead } from "@/lib/seo";
import { CATEGORIES, WEST_AFRICA_LOCATIONS } from "@/lib/constants";
import { trackAdClick, trackAdImpression } from "@/lib/ad-tracking";
import {
  IconBox as Package,
  IconClose as X,
  IconArrow as ArrowRight,
  IconStore as Store,
} from "@/components/icons";

type Filters = { country?: string; city?: string; category?: string; q?: string; verified?: boolean };

export const Route = createFileRoute("/")({
  validateSearch: (s: Record<string, unknown>): Filters => ({
    country: typeof s.country === "string" ? s.country : undefined,
    city: typeof s.city === "string" ? s.city : undefined,
    category: typeof s.category === "string" ? s.category : undefined,
    q: typeof s.q === "string" ? s.q : undefined,
    // Le routeur convertit « ?verified=1 » en nombre : on accepte toutes les formes.
    verified:
      s.verified === true || s.verified === "true" || s.verified === 1 || s.verified === "1"
        ? true
        : undefined,
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
type SponsoredProduct = Product & { ad_id: string };

const PAGE_SIZE = 24;
/** Positions sponsorisées dans la grille (index 1 et 2 = cartes n°2 et n°3). */
const SPONSOR_SLOTS = [1, 2];
const SORTS = [
  { id: "nouveau", label: "Nouveautés" },
  { id: "pertinence", label: "Pertinence" },
  { id: "populaire", label: "Populaires" },
  { id: "promo", label: "Promos" },
  { id: "prix_asc", label: "Prix ↑" },
  { id: "prix_desc", label: "Prix ↓" },
] as const;



function Index() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/" });
  const visitor = useVisitorCountry();
  const [items, setItems] = useState<Product[] | null>(null);
  const [q, setQ] = useState(search.q ?? "");
  // Par défaut : les nouveautés. « Pertinence » remonterait les mêmes produits
  // que la section « Potentiel produit Winner » (effet de répétition).
  const [sort, setSort] = useState("nouveau");
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [winners, setWinners] = useState<Product[] | null>(null);
  const [winnerRot, setWinnerRot] = useState(() => Math.floor(Math.random() * 8));
  const [sponsored, setSponsored] = useState<SponsoredProduct[]>([]);
  // Produits de la sous-région, affichés si son propre pays n'a pas encore de stock.
  const [elsewhere, setElsewhere] = useState<Product[]>([]);

  // Emplacements sponsorisés (annonces « produit » actives et dans leur fenêtre).
  useEffect(() => {
    supabase
      .rpc("get_sponsored_products", { p_limit: 3 })
      .then(({ data }) => setSponsored((data as SponsoredProduct[] | null) ?? []));
  }, []);

  useEffect(() => {
    // "Potentiel Winner" : pool des produits les plus sollicités (contacts + vues).
    supabase
      .rpc("get_ranked_products", { p_sort: "populaire", p_limit: 20, p_offset: 0 })
      .then(({ data }) => {
        const list = ((data as (Product & { contacts_total?: number; views_30?: number })[] | null) ?? []).map((p) => ({
          ...p,
          contacts: p.contacts_total ?? 0,
          views: p.views_30 ?? 0,
        }));
        const engaged = list
          .filter((p) => (p.contacts ?? 0) + (p.views ?? 0) > 0)
          .sort((a, b) => ((b.contacts ?? 0) * 3 + (b.views ?? 0)) - ((a.contacts ?? 0) * 3 + (a.views ?? 0)))
          .slice(0, 16);
        setWinners(engaged);
      });
  }, []);

  // Rotation : on décale l'ordre régulièrement pour que tous les produits aient leur chance.
  useEffect(() => {
    const t = window.setInterval(() => setWinnerRot((r) => r + 1), 7000);
    return () => window.clearInterval(t);
  }, []);

  const winnerList = useMemo(() => {
    if (!winners || winners.length === 0) return [];
    const n = winners.length;
    const start = ((winnerRot % n) + n) % n;
    return [...winners.slice(start), ...winners.slice(0, start)].slice(0, 8);
  }, [winners, winnerRot]);

  // Grille affichée = produits naturels + emplacements sponsorisés (cartes n°2 et n°3).
  const display = useMemo(() => {
    const list = items ?? [];
    const rows: { product: Product; adId?: string }[] = list.map((product) => ({ product }));
    const isMainFeed = !search.country && !search.city && !search.category && !search.q;
    if (!isMainFeed || list.length === 0) return rows;

    const alreadyListed = new Set(list.map((p) => p.id));
    const ads = sponsored.filter((a) => !alreadyListed.has(a.id)).slice(0, SPONSOR_SLOTS.length);
    ads.forEach((ad, i) => {
      const at = Math.min(SPONSOR_SLOTS[i] ?? rows.length, rows.length);
      rows.splice(at, 0, { product: ad, adId: ad.ad_id });
    });
    return rows;
  }, [items, sponsored, search.country, search.city, search.category, search.q]);

  const sponsoredAdIds = useMemo(
    () => display.filter((r) => r.adId).map((r) => r.adId as string),
    [display],
  );

  // Impression : comptée dès que l'emplacement sponsorisé est réellement affiché.
  useEffect(() => {
    sponsoredAdIds.forEach((id) => trackAdImpression(id));
  }, [sponsoredAdIds]);

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
      p_verified_only: !!search.verified,
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
  }, [search.country, search.city, search.category, search.q, search.verified, sort]);

  const loadMore = async () => {
    if (!items || loadingMore) return;
    setLoadingMore(true);
    const list = await fetchPage(items.length);
    setItems((prev) => [...(prev ?? []), ...list]);
    setHasMore(list.length === PAGE_SIZE);
    setLoadingMore(false);
  };


  const update = (patch: Partial<Filters>) => {
    // Un choix de pays (ou son retrait) est un choix EXPLICITE : on le mémorise
    // pour que la détection automatique ne revienne jamais le contredire.
    if ("country" in patch) visitor.setManual(patch.country ?? ALL_COUNTRIES);
    navigate({ search: (prev: Filters) => ({ ...prev, ...patch }) });
  };
  const clearAll = () => {
    visitor.setManual(ALL_COUNTRIES);
    navigate({ search: {} });
  };
  const hasFilters = !!(search.country || search.city || search.category || search.q || search.verified);

  // Filtre local automatique : un visiteur ivoirien voit d'abord la Côte d'Ivoire.
  useEffect(() => {
    if (search.country || visitor.manual || !visitor.country) return;
    navigate({ search: (prev: Filters) => ({ ...prev, country: visitor.country as string }) });
  }, [visitor.country, visitor.manual, search.country]);

  // Aucun stock dans le pays détecté → on propose la sous-région (jamais de page vide).
  useEffect(() => {
    if (!items || items.length > 0 || !search.country) {
      setElsewhere([]);
      return;
    }
    let cancel = false;
    supabase
      .rpc("get_ranked_products", { p_sort: sort, p_limit: 12, p_offset: 0 })
      .then(({ data }) => {
        if (!cancel) setElsewhere((data as Product[] | null) ?? []);
      });
    return () => {
      cancel = true;
    };
  }, [items, search.country, sort]);

  const countries = useMemo(() => Object.keys(WEST_AFRICA_LOCATIONS).sort((a, b) => a.localeCompare(b, "fr")), []);
  const availableCities = useMemo(() => {
    if (search.country && WEST_AFRICA_LOCATIONS[search.country]) {
      return [...WEST_AFRICA_LOCATIONS[search.country]].sort((a, b) => a.localeCompare(b, "fr"));
    }
    return Object.values(WEST_AFRICA_LOCATIONS).flat().sort((a, b) => a.localeCompare(b, "fr"));
  }, [search.country]);

  return (
    <div className="min-h-screen bg-background">
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

      {/* ============ FILTRE LOCAL AUTOMATIQUE ============ */}
      {search.country && visitor.isAuto && (
        <section className="mx-auto max-w-7xl px-4 pt-3 sm:px-6">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-2 rounded-2xl border border-primary/30 bg-primary/5 px-3 py-2.5 text-xs">
            <MapPin className="h-4 w-4 shrink-0 text-primary" />
            <span className="min-w-0 flex-1">
              Vous voyez les produits disponibles <strong>en {search.country}</strong> — votre pays a été détecté
              automatiquement.
            </span>
            <button
              onClick={() => update({ country: undefined, city: undefined })}
              className="shrink-0 rounded-full bg-foreground px-3 py-1.5 font-semibold text-background transition hover:opacity-90"
            >
              Voir toute l'Afrique de l'Ouest
            </button>
          </div>
        </section>
      )}

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
            {search.verified && (
              <Chip onRemove={() => update({ verified: undefined })}>Vendeurs vérifiés</Chip>
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
      {winnerList.length > 0 && !hasFilters && (
        <section className="mx-auto max-w-7xl px-4 sm:px-6 pt-6 sm:pt-8">
          <div className="mb-3 flex items-center gap-2">
            <Trophy className="h-4 w-4 text-volt" />
            <h2 className="text-sm sm:text-base font-bold tracking-tight uppercase">Potentiel produit Winner</h2>
            <span className="text-xs text-muted-foreground">· les plus sollicités</span>
          </div>
          <div className="-mx-4 sm:mx-0 overflow-x-auto no-scrollbar">
            <div className="flex gap-3 sm:gap-4 px-4 sm:px-0 snap-x snap-mandatory">
              {winnerList.map((p, i) => (
                <div key={p.id} className="w-[70%] sm:w-64 shrink-0 snap-start">
                  <ProductCard product={p} sellerVerified={!!p.seller_verified} delayMs={i * 40} />
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
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="overflow-x-auto no-scrollbar">
            <div className="flex items-center gap-2">
              {/* Filtre « Vendeurs vérifiés » : c'est l'avantage concret du badge */}
              <button
                onClick={() => update({ verified: search.verified ? undefined : true })}
                aria-pressed={!!search.verified}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                  search.verified
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                <BadgeCheck className="h-3.5 w-3.5" /> Vendeurs vérifiés
              </button>
              <span className="mx-0.5 h-5 w-px shrink-0 bg-border" aria-hidden />
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
          {sponsoredAdIds.length > 0 && (
            <span className="hidden text-[11px] text-muted-foreground sm:inline">
              Emplacements « Sponsorisé » : annonces mises en avant.
            </span>
          )}
        </div>

        {items === null ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : items.length === 0 ? (
          <>
            <EmptyState onClear={clearAll} country={search.country} verifiedOnly={!!search.verified} />
            {elsewhere.length > 0 && (
              <section className="mt-10">
                <h3 className="text-sm font-bold tracking-tight uppercase">
                  Ailleurs en Afrique de l'Ouest
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Aucun stock publié{search.country ? ` en ${search.country}` : ""} pour le moment — voici ce qui est
                  disponible dans la sous-région. Vous pouvez commander ou collaborer avec ces vendeurs par WhatsApp.
                </p>
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4">
                  {elsewhere.map((p, i) => (
                    <ProductCard key={p.id} product={p} sellerVerified={!!p.seller_verified} delayMs={i * 40} />
                  ))}
                </div>
              </section>
            )}
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
              {display.map((row, i) => (
                <ProductCard
                  key={row.adId ? `ad-${row.adId}` : row.product.id}
                  product={row.product}
                  sponsored={!!row.adId}
                  sellerVerified={!!row.product.seller_verified}
                  onOpen={row.adId ? () => trackAdClick(row.adId) : undefined}
                  delayMs={(i % PAGE_SIZE) * 40}
                />
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

function EmptyState({
  onClear,
  country,
  verifiedOnly,
}: {
  onClear: () => void;
  country?: string;
  verifiedOnly?: boolean;
}) {
  const title = verifiedOnly
    ? "Aucun vendeur vérifié dans cette sélection"
    : country
    ? `Aucun produit en ${country}`
    : "Aucun produit trouvé";

  const text = verifiedOnly
    ? "Aucun fournisseur vérifié ne correspond à votre recherche pour le moment. Relancez la recherche sans ce filtre pour voir tout le stock disponible."
    : country
    ? `Nous n'avons pas encore de stock publié en ${country}. Élargissez à toute l'Afrique de l'Ouest — la sous-région bouge vite.`
    : "Essayez d'élargir vos filtres ou explorez une autre catégorie.";

  return (
    <div className="grid place-items-center rounded-3xl border border-dashed border-border bg-muted/30 py-16 text-center">
      <Package className="h-10 w-10 text-muted-foreground" />
      <h3 className="mt-4 text-lg font-semibold">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{text}</p>
      <button
        onClick={onClear}
        className="mt-4 rounded-full bg-foreground px-4 py-2 text-xs font-semibold text-background"
      >
        {verifiedOnly ? "Voir tout le stock" : country ? "Voir toute l'Afrique de l'Ouest" : "Réinitialiser les filtres"}
      </button>
    </div>
  );
}

