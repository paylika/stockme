import { Link } from "@tanstack/react-router";
import { formatFCFA } from "@/lib/format";
import { IconPin as MapPin, IconBox as Package } from "@/components/icons";

export type ListingProduct = {
  id: string;
  name: string;
  category?: string;
  price_fcfa: number;
  promo_price_fcfa: number | null;
  quantity?: number;
  moq?: number;
  city: string;
  zone?: string | null;
  images: string[];
  sold_out?: boolean;
};

export function ProductCard({ product, delayMs = 0 }: { product: ListingProduct; delayMs?: number }) {
  const img = product.images[0];
  const hasPromo = product.promo_price_fcfa && product.promo_price_fcfa < product.price_fcfa;
  const discount = hasPromo
    ? Math.round(((product.price_fcfa - (product.promo_price_fcfa as number)) / product.price_fcfa) * 100)
    : 0;
  const showStock = typeof product.moq === "number" && typeof product.quantity === "number";

  return (
    <Link
      to="/product/$id"
      params={{ id: product.id }}
      className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition-all hover:-translate-y-0.5 hover:border-foreground/30 hover:shadow-[0_20px_40px_-24px_rgba(0,0,0,0.25)] fade-in"
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <div className="relative aspect-square w-full overflow-hidden bg-muted">
        {img ? (
          <img
            src={img}
            alt={product.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="grid h-full place-items-center text-muted-foreground">
            <Package className="h-10 w-10" />
          </div>
        )}
        {hasPromo && (
          <span className="absolute left-2 top-2 rounded-full bg-volt px-2 py-0.5 text-[10px] font-bold text-volt-foreground">
            -{discount}%
          </span>
        )}
        {product.sold_out && (
          <span className="absolute right-2 top-2 rounded-full bg-destructive px-2 py-0.5 text-[10px] font-bold text-background">
            Épuisé
          </span>
        )}
        <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-background/95 px-2 py-0.5 text-[10px] font-medium backdrop-blur">
          <MapPin className="h-2.5 w-2.5" /> {product.zone || product.city}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-3 sm:p-4">
        <h3 className="line-clamp-1 font-semibold leading-tight text-sm sm:text-base">{product.name}</h3>
        {product.category && (
          <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">{product.category}</p>
        )}
        <div className="mt-2 flex items-baseline gap-1.5">
          <span className="text-base font-bold tracking-tight sm:text-lg">
            {formatFCFA(hasPromo ? product.promo_price_fcfa! : product.price_fcfa)}
          </span>
          {hasPromo && <span className="text-[11px] line-through text-muted-foreground">{formatFCFA(product.price_fcfa)}</span>}
        </div>
        {showStock && (
          <div className="mt-1 text-[10px] text-muted-foreground sm:text-[11px]">
            MOQ {product.moq} · Stock {product.quantity}
          </div>
        )}
      </div>
    </Link>
  );
}
