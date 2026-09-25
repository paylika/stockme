import { BadgeCheck, Crown } from "lucide-react";
import { Link } from "@tanstack/react-router";

type Props = {
  /** Badge bleu « Fournisseur vérifié » (style Alibaba). */
  label?: string;
  /** Version compacte : icône + texte court. */
  compact?: boolean;
  /** Rend le badge cliquable vers la page boutique du vendeur. */
  sellerId?: string;
  size?: "sm" | "md";
};

/**
 * Badge officiel StockMe : attribué après paiement par carte (5 000 FCFA/an)
 * ou manuellement par l'équipe. Bleu profond = confiance, coche et bouclier.
 */
export function VerifiedBadge({ label = "Fournisseur vérifié", compact = false, sellerId, size = "sm" }: Props) {
  const pad = size === "md" ? "px-2.5 py-1 text-xs" : "px-2 py-0.5 text-[11px]";
  const icon = size === "md" ? "h-4 w-4" : "h-3.5 w-3.5";

  const inner = (
    <>
      <BadgeCheck className={icon} />
      <span className="font-semibold">{compact ? "Vérifié" : label}</span>
    </>
  );

  const className = `inline-flex items-center gap-1 rounded-full bg-primary text-primary-foreground shadow-sm ${pad}`;

  if (sellerId) {
    return (
      <Link to="/vendeur/$id" params={{ id: sellerId }} className={`${className} transition hover:brightness-110`} title="Voir la boutique du fournisseur vérifié">
        {inner}
      </Link>
    );
  }

  return <span className={className}>{inner}</span>;
}

/** Petite variante « or » pour les vendeurs Premium / à vie. */
export function VerifiedBadgeGold({ label = "Fournisseur vérifié à vie", size = "sm" }: Props) {
  const pad = size === "md" ? "px-2.5 py-1 text-xs" : "px-2 py-0.5 text-[11px]";
  const icon = size === "md" ? "h-4 w-4" : "h-3.5 w-3.5";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full bg-volt text-volt-foreground shadow-sm ${pad}`}>
      <Crown className={icon} />
      <span className="font-semibold">{label}</span>
    </span>
  );
}
