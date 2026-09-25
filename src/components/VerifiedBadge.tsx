import { useId } from "react";
import { Link } from "@tanstack/react-router";

type Tone = "blue" | "gold";

type Props = {
  /** Ex. « Fournisseur vérifié », « Vérifié », « Fournisseur vérifié à vie ». */
  label?: string;
  /** Version compacte (listes, cartes produit) : sceau + mot court. */
  compact?: boolean;
  /** Rend le badge cliquable vers la page boutique du vendeur. */
  sellerId?: string;
  size?: "sm" | "md";
};

/**
 * Badge officiel StockMe — inspiré du badge « Verified Supplier » d'Alibaba :
 * un sceau dégradé à gauche, puis un libellé BICOLORE en capitales
 * (« FOURNISSEUR » en bleu profond + « VÉRIFIÉ » en bleu vif).
 *
 * Deux tons :
 *   • bleu  = fournisseur vérifié (achat du badge 5 000 FCFA/an) — la confiance ;
 *   • or    = vérifié à vie (vérification manuelle par l'équipe StockMe).
 *
 * Le bleu est volontairement réservé à la confiance : l'orange `volt` reste la
 * couleur des actions (publier, payer), pour qu'un bouton orange reste un bouton.
 */
const TONES: Record<
  Tone,
  {
    from: string;
    to: string;
    /** Première ligne (petite, capitale, discrète). */
    first: string;
    /** Dernière ligne (grande, grasse, colorée). */
    last: string;
    shell: string;
    ring: string;
  }
> = {
  blue: {
    from: "#4C82F0",
    to: "#1B3A7A",
    first: "text-primary/75",
    last: "text-[#2C63D9]",
    shell: "bg-[linear-gradient(180deg,#FFFFFF,#EDF3FF)]",
    ring: "ring-primary/20",
  },
  gold: {
    from: "#F5B93F",
    to: "#B87708",
    first: "text-[#8A5A12]/80",
    last: "text-[#C2760A]",
    shell: "bg-[linear-gradient(180deg,#FFFFFF,#FFF6E3)]",
    ring: "ring-volt/40",
  },
};

/** Sceau : carré arrondi en dégradé, coche (ou couronne) blanche, léger éclat. */
function Seal({ size, tone, crown }: { size: number; tone: Tone; crown?: boolean }) {
  const id = useId().replace(/:/g, "");
  const t = TONES[tone];
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" className="shrink-0">
      <defs>
        <linearGradient id={`sm-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={t.from} />
          <stop offset="100%" stopColor={t.to} />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="22" height="22" rx="7" fill={`url(#sm-${id})`} />
      {/* reflet diagonal : donne du relief au sceau */}
      <path d="M1 9.5C1 4.8 4.8 1 9.5 1H16L3.2 16.2Z" fill="#ffffff" opacity="0.14" />
      {crown ? (
        <path
          d="M6.4 15.4l-.8-5 3 2.1L12 8.9l3.4 3.6 3-2.1-.8 5z"
          fill="#ffffff"
          stroke="#ffffff"
          strokeWidth="1.1"
          strokeLinejoin="round"
        />
      ) : (
        <path
          d="M6.6 12.3l3.3 3.3 7.5-7.5"
          fill="none"
          stroke="#ffffff"
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

export function VerifiedBadge({ label = "Fournisseur vérifié", compact = false, sellerId, size = "sm" }: Props) {
  const t = TONES.blue;
  const markSize = compact ? (size === "md" ? 16 : 14) : size === "md" ? 24 : 20;
  const pad = compact ? "gap-1 py-0.5 pl-0.5 pr-2" : "gap-2 py-1 pl-1 pr-3";

  const shell = `inline-flex items-center rounded-full ring-1 ${t.ring} ${t.shell} shadow-[0_1px_2px_rgba(15,42,92,0.10)] ${pad}`;

  // Libellé bicolore : « Fournisseur » (petit) + « Vérifié » (gras).
  const words = label.trim().split(/\s+/);
  const last = words[words.length - 1] ?? "Vérifié";
  const first = words.slice(0, -1).join(" ");

  const inner = compact ? (
    <>
      <Seal size={markSize} tone="blue" />
      <span className={`text-[11px] font-extrabold uppercase tracking-tight ${t.last}`}>
        {first ? last : label}
      </span>
    </>
  ) : (
    <>
      <Seal size={markSize} tone="blue" />
      <span className="flex min-w-0 flex-col leading-none">
        {first ? (
          <>
            <span className={`text-[8px] font-bold uppercase tracking-[0.16em] ${t.first}`}>{first}</span>
            <span className={`mt-0.5 text-[13px] font-extrabold uppercase tracking-tight ${t.last}`}>{last}</span>
          </>
        ) : (
          <span className={`text-[13px] font-extrabold uppercase tracking-tight ${t.last}`}>{label}</span>
        )}
      </span>
    </>
  );

  const title = "Fournisseur vérifié par StockMe";

  if (sellerId) {
    return (
      <Link
        to="/vendeur/$id"
        params={{ id: sellerId }}
        className={`${shell} transition hover:brightness-[1.04]`}
        title={title}
      >
        {inner}
      </Link>
    );
  }

  return (
    <span className={shell} title={title}>
      {inner}
    </span>
  );
}

/** Variante « or » : vérification manuelle par l'équipe, badge acquis à vie. */
export function VerifiedBadgeGold({ label = "à vie", size = "sm" }: Props) {
  const t = TONES.gold;
  const markSize = size === "md" ? 24 : 20;

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full py-1 pl-1 pr-3 ring-1 ${t.ring} ${t.shell} shadow-[0_1px_2px_rgba(120,80,10,0.12)]`}
      title="Fournisseur vérifié à vie par StockMe"
    >
      <Seal size={markSize} tone="gold" crown />
      {/* Lockup bicolore : « FOURNISSEUR » discret + « À VIE » en or. */}
      <span className="flex min-w-0 flex-col leading-none">
        <span className={`text-[8px] font-bold uppercase tracking-[0.16em] ${t.first}`}>Fournisseur</span>
        <span className={`mt-0.5 text-[13px] font-extrabold uppercase tracking-tight ${t.last}`}>{label}</span>
      </span>
    </span>
  );
}
