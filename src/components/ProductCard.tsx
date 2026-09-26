import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Eye, Heart, MessageCircle, Megaphone, Tag } from "lucide-react";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { normalizeTiers, lowestTierPrice } from "@/lib/price-tiers";
import { Stars } from "@/components/ProductReviews";
import { formatFCFA } from "@/lib/format";
import { IconPin as MapPin, IconBox as Package } from "@/components/icons";
import { IMG, thumbResponsive } from "@/lib/img";

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
  dropshipping?: boolean;
  owner_id?: string | null;
  /** Renseigné par les fonctions de liste (le vendeur a le badge). */
  seller_verified?: boolean;
  /** Renseigné par get_ranked_products : mise en avant payée encore active. */
  is_boosted?: boolean;
  /** Paliers de prix par quantité (jsonb côté base). */
  price_tiers?: unknown;
  /** Note moyenne des acheteurs (1 à 5) et nombre d'avis. */
  rating_avg?: number | null;
  rating_count?: number | null;
  views?: number;
  contacts?: number;
  favorites?: number;
};

type Props = {
  product: ListingProduct;
  delayMs?: number;
  /** Emplacement sponsorisé : badge "Sponsorisé" + mise en avant visuelle. */
  sponsored?: boolean;
  /** Vendeur au badge « Fournisseur vérifié » (affiché sur la carte). */
  sellerVerified?: boolean;
  /** Appelé au clic (mesure des performances d'une annonce). */
  onOpen?: () => void;
  /**
   * Carte visible immédiatement à l'écran (les 2 premières) : son image est
   * chargée en priorité, les suivantes en différé. C'est ce qui fait gagner
   * le plus de temps sur un téléphone en 3G.
   */
  priority?: boolean;
};

export function ProductCard({
  product,
  delayMs = 0,
  sponsored = false,
  sellerVerified = false,
  onOpen,
  priority = false,
}: Props) {
  const img = product.images[0];
  /**
   * 0 = version allégée (35 Ko), 1 = photo d'origine (repli), 2 = visuel neutre.
   * Si le service d'images ne répond pas, on retombe automatiquement sur
   * l'originale : l'acheteur ne voit jamais d'image cassée.
   */
  const [stage, setStage] = useState<0 | 1 | 2>(0);
  const showImage = !!img && stage < 2;
  const sizes = thumbResponsive(img, IMG.card.widths as unknown as number[], IMG.card.sizes);
  const src = stage === 0 ? sizes.src : (img ?? "");
  const hasPromo = product.promo_price_fcfa && product.promo_price_fcfa < product.price_fcfa;
  const discount = hasPromo
    ? Math.round(((product.price_fcfa - (product.promo_price_fcfa as number)) / product.price_fcfa) * 100)
    : 0;
  const showStock = typeof product.moq === "number" && typeof product.quantity === "number";
  const showStats = typeof product.views === "number" && typeof product.contacts === "number";
  /** Paliers de prix : on affiche « dès X F » sur la carte, comme en gros. */
  const tiers = normalizeTiers(product.price_tiers);
  const bestTier = lowestTierPrice(tiers);
  const basePrice = hasPromo ? (product.promo_price_fcfa as number) : product.price_fcfa;

  return (
    <Link
      to="/product/$id"
      params={{ id: product.id }}
      onClick={onOpen}
      className={`group flex flex-col overflow-hidden rounded-2xl border bg-card transition-all hover:-translate-y-0.5 hover:border-foreground/30 hover:shadow-[0_20px_40px_-24px_rgba(0,0,0,0.25)] fade-in ${
        sponsored ? "border-volt/50 shadow-[0_10px_30px_-20px_rgba(0,0,0,0.35)]" : "border-border"
      }`}
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <div className="relative aspect-square w-full overflow-hidden bg-muted">
        {showImage ? (
          <img
            src={src}
            srcSet={stage === 0 ? sizes.srcSet : undefined}
            sizes={stage === 0 ? sizes.sizes : undefined}
            alt={product.name}
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : "auto"}
            decoding="async"
            onError={() => setStage((s) => (s === 0 ? 1 : 2))}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="grid h-full place-items-center text-muted-foreground">
            <Package className="h-10 w-10" />
          </div>
        )}
        {sponsored ? (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-foreground px-2 py-0.5 text-[10px] font-bold text-background shadow-sm">
            <Megaphone className="h-2.5 w-2.5" /> Sponsorisé
          </span>
        ) : null}
        {hasPromo && (
          <span
            className={`absolute inline-flex items-center gap-1 rounded-full bg-destructive px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm ${
              sponsored ? "left-2 top-9" : "left-2 top-2"
            }`}
          >
            <Tag className="h-2.5 w-2.5" /> −{discount} %
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
        {product.dropshipping && (
          <span className="absolute bottom-2 right-2 rounded-full bg-foreground/90 px-2 py-0.5 text-[10px] font-semibold text-background backdrop-blur">
            Dropshipping
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-3 sm:p-4">
        <h3 className="line-clamp-1 font-semibold leading-tight text-sm sm:text-base">{product.name}</h3>
        <div className="mt-0.5 flex items-center gap-1.5">
          {sellerVerified && <VerifiedBadge compact />}
          {product.category && (
            <p className="line-clamp-1 text-[11px] text-muted-foreground">{product.category}</p>
          )}
        </div>
        <div className="mt-2 flex items-baseline gap-1.5">
          <span className="text-base font-bold tracking-tight sm:text-lg">
            {formatFCFA(hasPromo ? product.promo_price_fcfa! : product.price_fcfa)}
          </span>
          {hasPromo && <span className="text-[11px] line-through text-muted-foreground">{formatFCFA(product.price_fcfa)}</span>}
        </div>
        {showStock && (
          <div className="mt-1 text-[10px] text-muted-foreground sm:text-[11px]">
            MOQ {product.moq} · Stock {product.quantity}
            {/* Prix dégressif : on annonce tout de suite le meilleur tarif. */}
            {bestTier !== null && bestTier < basePrice && (
              <>
                {" · "}
                <span className="font-semibold text-destructive">dès {formatFCFA(bestTier)}</span>
              </>
            )}
          </div>
        )}
        {/* Note des acheteurs : la preuve sociale, comme sur Alibaba. */}
        {!!product.rating_count && product.rating_count > 0 && (
          <div className="mt-1 flex items-center gap-1.5">
            <Stars value={product.rating_avg ?? 0} size="xs" />
            <span className="text-[10px] font-semibold text-muted-foreground sm:text-[11px]">
              {(product.rating_avg ?? 0).toFixed(1).replace(".", ",")} ({product.rating_count})
            </span>
          </div>
        )}
        {showStats && (
          <div className="mt-2 flex items-center gap-3 border-t border-border pt-2 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Eye className="h-3 w-3" /> {product.views}</span>
            <span className="inline-flex items-center gap-1"><MessageCircle className="h-3 w-3" /> {product.contacts}</span>
            {!!product.favorites && (
              <span className="inline-flex items-center gap-1"><Heart className="h-3 w-3" /> {product.favorites}</span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}
