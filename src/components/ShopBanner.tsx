import { useState } from "react";
import logoUrl from "@/assets/stockme-logo.png";

type Props = {
  /** Image de couverture du vendeur (null = bannière StockMe par défaut). */
  src?: string | null;
  /** Point focal vertical en % (0 = haut, 100 = bas). */
  position?: number | null;
  /** Hauteur de la bannière. */
  className?: string;
  /** Affiche le texte StockMe sur la bannière par défaut. */
  overlay?: boolean;
};

/** Bannière StockMe par défaut (aucune image à téléverser côté serveur). */
export function DefaultBanner({ compact = false }: { compact?: boolean }) {
  return (
    <div className="absolute inset-0 bg-[linear-gradient(135deg,#0b1524_0%,#101c30_45%,#0b1524_100%)]">
      {/* halos discrets, comme le visuel de marque */}
      <div
        className="absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(420px 200px at 85% 15%, rgba(240,168,54,0.18), transparent 65%), radial-gradient(400px 220px at 10% 90%, rgba(31,61,143,0.35), transparent 60%)",
        }}
      />
      <div className="relative flex h-full flex-col items-center justify-center gap-1.5 px-4 text-center">
        <img
          src={logoUrl}
          alt="StockMe"
          className={compact ? "h-7 w-7 object-contain opacity-90" : "h-9 w-9 object-contain opacity-90"}
        />
        {!compact && (
          <>
            <p className="font-display text-lg font-bold tracking-tight text-white/95 sm:text-xl">
              Stock<span className="font-extrabold">Me</span>
            </p>
            <p className="hidden text-[11px] text-white/60 sm:block">
              Gérez votre stock. Vendez plus. Sans prise de tête.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Bannière de boutique : image du vendeur (avec son point focal choisi en
 * glissant) ou bannière StockMe par défaut. Si une image est déclarée mais
 * ne se charge pas, on retombe proprement sur la bannière par défaut.
 */
export function ShopBanner({ src, position = 50, className = "h-32 sm:h-44", overlay = false }: Props) {
  const [failed, setFailed] = useState(false);
  const showImage = !!src && !failed;

  return (
    <div className={`relative w-full overflow-hidden bg-[#0b1524] ${className}`}>
      {showImage ? (
        <>
          <img
            src={src as string}
            alt=""
            onError={() => setFailed(true)}
            className="absolute inset-0 h-full w-full object-cover"
            style={{ objectPosition: `center ${position}%` }}
          />
          {overlay && <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />}
        </>
      ) : (
        <DefaultBanner />
      )}
    </div>
  );
}
