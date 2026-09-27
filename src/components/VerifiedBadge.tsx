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
 * Badge officiel StockMe — ROSACE + COCHE, comme le badge vérifié d'Instagram :
 * une forme festonnée bleue vif avec une coche blanche. C'est LA marque du
 * compte sérieux, et elle doit se voir partout, mobile compris (un badge caché
 * ne rassure personne).
 *
 * Deux tons :
 *   • bleu = fournisseur vérifié (badge 2 000 F/an, ou abonnement Vendeur Pro) ;
 *   • or   = vérifié à vie (vérification manuelle par l'équipe StockMe).
 *
 * Le bleu est réservé à la confiance : l'orange `volt` reste la couleur des
 * actions (publier, payer) — et sert au marqueur « PRO ».
 */

/** Rosace : 12 festons, galbe « Instagram ». Calculée → nette à toute taille. */
function rosettePath(cx: number, cy: number, r: number, petals = 12): string {
  const step = (Math.PI * 2) / petals;
  const arcR = r * 0.285;
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < petals; i++) {
    const a = -Math.PI / 2 + i * step;
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 1; i <= petals; i++) {
    const p = pts[i % petals];
    d += ` A ${arcR.toFixed(2)} ${arcR.toFixed(2)} 0 0 1 ${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
  }
  return `${d} Z`;
}

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
    from: "#4DA3FF",
    to: "#0A66E8",
    first: "text-[#0A66E8]/70",
    last: "text-[#0A66E8]",
    shell: "bg-[linear-gradient(180deg,#FFFFFF,#EAF3FF)]",
    ring: "ring-[#0A66E8]/20",
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

/** Le sceau seul : la rosace remplie + la coche blanche. */
function Seal({ size, tone, crown }: { size: number; tone: Tone; crown?: boolean }) {
  const id = useId().replace(/:/g, "");
  const t = TONES[tone];
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" className="shrink-0">
      <defs>
        <linearGradient id={`sm-${id}`} x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0%" stopColor={t.from} />
          <stop offset="100%" stopColor={t.to} />
        </linearGradient>
      </defs>
      <path d={rosettePath(12, 12, 10.2)} fill={`url(#sm-${id})`} />
      {crown ? (
        <path
          d="M7.3 14.9l-.7-4.4 2.7 1.9L12 9.4l2.7 3 2.7-1.9-.7 4.4z"
          fill="#ffffff"
          stroke="#ffffff"
          strokeWidth="1"
          strokeLinejoin="round"
        />
      ) : (
        <path
          d="M7.6 12.4l2.9 2.9 6-6.4"
          fill="none"
          stroke="#ffffff"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

/**
 * LE MARQUEUR À METTRE PARTOUT, juste après un nom (boutique, vendeur).
 * Petit, bleu, reconnaissable — et jamais masqué sur mobile.
 */
export function VerifiedMark({
  size = 15,
  tone = "blue",
  sellerId,
  className = "",
  title = "Fournisseur vérifié par StockMe",
}: {
  size?: number;
  tone?: Tone;
  sellerId?: string;
  className?: string;
  title?: string;
}) {
  const svg = <Seal size={size} tone={tone} crown={tone === "gold"} />;
  if (sellerId) {
    return (
      <Link
        to="/vendeur/$id"
        params={{ id: sellerId }}
        title={title}
        aria-label={title}
        className={`inline-flex shrink-0 align-[-2px] ${className}`}
      >
        {svg}
      </Link>
    );
  }
  return (
    <span title={title} aria-label={title} className={`inline-flex shrink-0 align-[-2px] ${className}`}>
      {svg}
    </span>
  );
}

/** Marqueur « PRO » : la pastille orange de l'abonnement Vendeur Pro. */
export function ProChip({ className = "" }: { className?: string }) {
  return (
    <span
      title="Vendeur Pro — abonnement actif"
      className={`inline-flex shrink-0 items-center gap-0.5 rounded-full bg-volt px-1.5 py-px text-[9px] font-black uppercase tracking-wide text-volt-foreground ${className}`}
    >
      Pro
    </span>
  );
}

export function VerifiedBadge({ label = "Fournisseur vérifié", compact = false, sellerId, size = "sm" }: Props) {
  const t = TONES.blue;
  const markSize = compact ? (size === "md" ? 17 : 15) : size === "md" ? 26 : 21;
  const pad = compact ? "gap-1 py-0.5 pl-0.5 pr-2" : "gap-1.5 py-0.5 pl-0.5 pr-2.5";

  const shell = `inline-flex items-center rounded-full ring-1 ${t.ring} ${t.shell} shadow-[0_1px_2px_rgba(10,70,160,0.12)] ${pad}`;

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
            <span className={`text-[8px] font-bold uppercase tracking-[0.14em] ${t.first}`}>{first}</span>
            <span className={`mt-0.5 text-[12.5px] font-extrabold uppercase tracking-tight ${t.last}`}>{last}</span>
          </>
        ) : (
          <span className={`text-[12.5px] font-extrabold uppercase tracking-tight ${t.last}`}>{label}</span>
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
  const markSize = size === "md" ? 26 : 21;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-2.5 ring-1 ${t.ring} ${t.shell} shadow-[0_1px_2px_rgba(120,80,10,0.12)]`}
      title="Fournisseur vérifié à vie par StockMe"
    >
      <Seal size={markSize} tone="gold" crown />
      {/* Lockup bicolore : « FOURNISSEUR » discret + « À VIE » en or. */}
      <span className="flex min-w-0 flex-col leading-none">
        <span className={`text-[8px] font-bold uppercase tracking-[0.14em] ${t.first}`}>Fournisseur</span>
        <span className={`mt-0.5 text-[12.5px] font-extrabold uppercase tracking-tight ${t.last}`}>{label}</span>
      </span>
    </span>
  );
}
