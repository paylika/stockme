import { Link } from "@tanstack/react-router";
import logoUrl from "@/assets/stockme-logo.png";
import {
  IconPin as MapPin,
  IconSearch as Search,
  IconArrow as ArrowRight,
  IconChevronDown as ChevronDown,
  IconShield as ShieldCheck,
  IconBadge as BadgeCheck,
  IconWhatsApp as MessageCircle,
} from "@/components/icons";

type Filters = { country?: string; city?: string; q?: string };

type Props = {
  q: string;
  onQChange: (v: string) => void;
  country?: string;
  city?: string;
  countries: string[];
  cities: string[];
  onUpdate: (patch: Partial<Filters>) => void;
  onSubmit: () => void;
};

export function SiteHeader({
  q,
  onQChange,
  country,
  city,
  countries,
  cities,
  onUpdate,
  onSubmit,
}: Props) {
  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 pt-3 sm:pt-4 pb-3">
        {/* Logo (mobile) — sur desktop le logo est dans la sidebar */}
        <div className="md:hidden mb-2.5">
          <Link to="/" className="inline-flex items-center gap-2.5">
            <img src={logoUrl} alt="StockMe" className="h-8 w-8 object-contain rounded-lg" />
            <span className="text-base font-display font-medium tracking-tight">
              Stock<span className="font-bold">Me</span>
            </span>
          </Link>
        </div>

        {/* Barre de recherche */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          {/* Mobile : pilule + pays/ville */}
          <div className="sm:hidden">
            <div className="relative flex items-center h-12 rounded-full border border-border bg-background pl-4 pr-1.5 shadow-sm focus-within:border-foreground/40">
              <Search className="h-4 w-4 text-muted-foreground shrink-0" />
              <input
                value={q}
                onChange={(e) => onQChange(e.target.value)}
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
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div className="relative">
                <select
                  value={country ?? ""}
                  onChange={(e) => onUpdate({ country: e.target.value || undefined, city: undefined })}
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
                  list="stockme-header-cities"
                  value={city ?? ""}
                  onChange={(e) => onUpdate({ city: e.target.value || undefined })}
                  type="search"
                  placeholder="Ville"
                  className="w-full h-10 rounded-full border border-border bg-background pl-8 pr-3 text-xs font-medium placeholder:text-muted-foreground focus:outline-none focus:border-foreground/40"
                />
              </div>
            </div>
          </div>

          {/* Desktop : une seule rangée */}
          <div className="hidden sm:grid gap-2 grid-cols-[1fr_auto_auto_auto] items-stretch">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <input
                value={q}
                onChange={(e) => onQChange(e.target.value)}
                type="search"
                inputMode="search"
                placeholder="Rechercher un produit, une marque…"
                className="w-full h-11 rounded-xl border border-border bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-foreground/40"
              />
            </div>
            <div className="relative">
              <select
                value={country ?? ""}
                onChange={(e) => onUpdate({ country: e.target.value || undefined, city: undefined })}
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
                list="stockme-header-cities"
                value={city ?? ""}
                onChange={(e) => onUpdate({ city: e.target.value || undefined })}
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

          <datalist id="stockme-header-cities">
            {cities.map((city) => (
              <option key={city} value={city} />
            ))}
          </datalist>
        </form>

        {/* Bandeau de confiance */}
        <div className="mt-2.5 flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> Vérifiés</span>
          <span className="h-0.5 w-0.5 rounded-full bg-muted-foreground/50" />
          <span className="inline-flex items-center gap-1"><MessageCircle className="h-3 w-3" /> WhatsApp</span>
          <span className="h-0.5 w-0.5 rounded-full bg-muted-foreground/50" />
          <span className="inline-flex items-center gap-1"><BadgeCheck className="h-3 w-3" /> 100% gratuit</span>
        </div>
      </div>
    </header>
  );
}
