import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/stockme-client";
import { Header } from "@/components/Header";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { CATEGORIES, WEST_AFRICA_LOCATIONS } from "@/lib/constants";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { ProductCard, type ListingProduct } from "@/components/ProductCard";

type Filters = { city?: string; category?: string; q?: string; min?: number; max?: number };

export const Route = createFileRoute("/browse")({
  validateSearch: (s: Record<string, unknown>): Filters => ({
    city: typeof s.city === "string" ? s.city : undefined,
    category: typeof s.category === "string" ? s.category : undefined,
    q: typeof s.q === "string" ? s.q : undefined,
    min: typeof s.min === "number" ? s.min : undefined,
    max: typeof s.max === "number" ? s.max : undefined,
  }),
  component: Browse,
});

type Product = ListingProduct;

function Browse() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/browse" });
  const [items, setItems] = useState<Product[] | null>(null);
  const [q, setQ] = useState(search.q ?? "");

  useEffect(() => {
    let cancel = false;
    setItems(null);
    const run = async () => {
      let query = supabase.from("products").select("*").eq("published", true).order("created_at", { ascending: false }).limit(60);
      if (search.city) query = query.eq("city", search.city);
      if (search.category) query = query.eq("category", search.category);
      if (search.q) query = query.ilike("name", `%${search.q}%`);
      const { data } = await query;
      if (!cancel) setItems(data ?? []);
    };
    run();
    return () => { cancel = true; };
  }, [search.city, search.category, search.q]);

  const update = (patch: Partial<Filters>) =>
    navigate({ search: (prev: Filters) => ({ ...prev, ...patch }) });

  const clearAll = () => navigate({ search: {} });
  const hasFilters = !!(search.city || search.category || search.q);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="border-b border-border bg-card">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Trouvez du stock</h1>
          <p className="mt-2 text-muted-foreground">Parcourez les produits disponibles auprès de fournisseurs en Afrique de l'Ouest.</p>

          <form onSubmit={(e) => { e.preventDefault(); update({ q: q || undefined }); }} className="mt-6 flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un produit..." className="pl-9 h-11" />
            </div>
            <div className="flex gap-3">
              <Select value={search.city ?? "_all"} onValueChange={(v) => update({ city: v === "_all" ? undefined : v })}>
                <SelectTrigger className="h-11 sm:w-44"><SelectValue placeholder="Ville" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="_all">Toutes villes</SelectItem>
                  {Object.entries(WEST_AFRICA_LOCATIONS).map(([country, cities]) => (
                    <SelectGroup key={country}>
                      <SelectLabel className="text-[10px] tracking-[0.18em] uppercase text-muted-foreground">{country}</SelectLabel>
                      {cities.map((c) => <SelectItem key={`${country}-${c}`} value={c}>{c}</SelectItem>)}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              <Select value={search.category ?? "_all"} onValueChange={(v) => update({ category: v === "_all" ? undefined : v })}>
                <SelectTrigger className="h-11 sm:w-52"><SelectValue placeholder="Catégorie" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">Toutes catégories</SelectItem>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </form>

          {hasFilters && (
            <div className="mt-4 flex flex-wrap gap-2">
              {search.q && <Chip onRemove={() => update({ q: undefined })}>« {search.q} »</Chip>}
              {search.city && <Chip onRemove={() => update({ city: undefined })}>{search.city}</Chip>}
              {search.category && <Chip onRemove={() => update({ category: undefined })}>{search.category}</Chip>}
              <button onClick={clearAll} className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">Tout effacer</button>
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-10">
        {items === null ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : items.length === 0 ? (
          <div className="grid place-items-center py-16 text-center border border-dashed border-border rounded-3xl bg-muted/30">
            <SlidersHorizontal className="h-10 w-10 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-semibold">Aucun produit trouvé</h3>
            <p className="mt-1 text-sm text-muted-foreground">Essayez d'élargir vos filtres ou une autre catégorie.</p>
            <button onClick={clearAll} className="mt-4 rounded-full bg-foreground text-background px-4 py-2 text-xs font-semibold">
              Réinitialiser les filtres
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {items.map((p, i) => <ProductCard key={p.id} product={p} delayMs={i * 45} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function Chip({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-foreground text-background px-3 py-1 text-xs font-medium">
      {children}
      <button onClick={onRemove}><X className="h-3 w-3" /></button>
    </span>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-border overflow-hidden bg-card">
      <div className="aspect-[4/3] shimmer bg-muted" />
      <div className="p-4 space-y-2">
        <div className="h-4 w-3/4 rounded shimmer bg-muted" />
        <div className="h-3 w-1/2 rounded shimmer bg-muted" />
      </div>
    </div>
  );
}

