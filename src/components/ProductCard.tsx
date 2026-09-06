import { Link } from "@tanstack/react-router";
import { formatFCFA } from "@/lib/format";
import { IconPin as MapPin, IconBox as Package } from "@/components/icons";

export type ProductCardProduct = {
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

export function ProductCard({ product }: { product: ProductCardProduct }) {
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
