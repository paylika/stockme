import { CATEGORIES } from "@/lib/constants";
import { IconPin as MapPin, IconChevronDown } from "@/components/icons";

export type FilterState = {
  country?: string;
  city?: string;
  category?: string;
  min?: number;
  max?: number;
};

type Props = {
  filters: FilterState;
  countries: string[];
  cities: string[];
  onUpdate: (patch: Partial<FilterState>) => void;
  onClear: () => void;
};

export function FilterPanel({ filters, countries, cities, onUpdate, onClear }: Props) {
  const hasFilters = !!(filters.country || filters.city || filters.category || filters.min !== undefined || filters.max !== undefined);

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold tracking-tight">Filtres</h3>
        {hasFilters && (
          <button
            onClick={onClear}
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Réinitialiser
          </button>
        )}
      </div>

      {/* ===== Prix ===== */}
      <div>
        <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-muted-foreground">Prix (FCFA)</p>
        <div className="mt-2 flex items-center gap-2">
          <div className="relative flex-1">
            <input
              type="number"
              placeholder="Min"
              min={0}
              value={filters.min ?? ""}
              onChange={(e) => onUpdate({ min: e.target.value === "" ? undefined : Number(e.target.value) })}
              className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm focus:outline-none focus:border-foreground/40"
            />
          </div>
          <span className="text-muted-foreground text-xs">—</span>
          <div className="relative flex-1">
            <input
              type="number"
              placeholder="Max"
              min={0}
              value={filters.max ?? ""}
              onChange={(e) => onUpdate({ max: e.target.value === "" ? undefined : Number(e.target.value) })}
              className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm focus:outline-none focus:border-foreground/40"
            />
          </div>
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">Filtre sur le prix affiché du produit.</p>
      </div>

      {/* ===== Catégorie ===== */}
      <div>
        <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-muted-foreground">Catégorie</p>
        <div className="mt-2 space-y-1">
          <CatButton active={!filters.category} onClick={() => onUpdate({ category: undefined })}>Toutes</CatButton>
          {CATEGORIES.map((c) => (
            <CatButton
              key={c}
              active={filters.category === c}
              onClick={() => onUpdate({ category: filters.category === c ? undefined : c })}
            >
              {c}
            </CatButton>
          ))}
        </div>
      </div>

      {/* ===== Localisation ===== */}
      <div className="space-y-3">
        <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-muted-foreground">Localisation</p>
        <div className="relative">
          <select
            value={filters.country ?? ""}
            onChange={(e) => onUpdate({ country: e.target.value || undefined, city: undefined })}
            className="appearance-none w-full h-10 rounded-lg border border-input bg-background pl-3 pr-8 text-sm focus:outline-none focus:border-foreground/40"
          >
            <option value="">Tous les pays</option>
            {countries.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <IconChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        </div>
        <div className="relative">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            list="stockme-filter-cities"
            value={filters.city ?? ""}
            onChange={(e) => onUpdate({ city: e.target.value || undefined })}
            type="search"
            placeholder="Ville"
            className="w-full h-10 rounded-lg border border-input bg-background pl-8 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-foreground/40"
          />
          <datalist id="stockme-filter-cities">
            {cities.map((city) => (
              <option key={city} value={city} />
            ))}
          </datalist>
        </div>
      </div>
    </div>
  );
}

function CatButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-lg px-3 py-2 text-sm font-medium transition ${
        active
          ? "bg-volt/10 text-volt font-semibold"
          : "text-foreground/80 hover:bg-muted hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
