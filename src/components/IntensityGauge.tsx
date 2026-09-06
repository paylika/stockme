import { useEffect, useRef, useState } from "react";

export type IntensityLabel = { label: string; color: string };

export function intensityLabel(value: number): IntensityLabel {
  if (value >= 60) return { label: "High", color: "#7C3AED" };
  if (value >= 30) return { label: "Medium", color: "#F0A836" };
  return { label: "Low", color: "#94A3B8" };
}

/** Calcule un score d'intensité (0-100) à partir de l'activité réelle du vendeur. */
export function computeIntensity(stats: {
  total_views: number;
  total_contacts: number;
  total_favorites: number;
  total_products: number;
}): number {
  const products = Math.max(stats.total_products, 1);
  const perProductContacts = stats.total_contacts / products;
  const perProductFavorites = stats.total_favorites / products;
  // pondération : contacts (signal fort) + favoris + léger boost des vues
  const raw = perProductContacts * 18 + perProductFavorites * 12 + Math.min(stats.total_views, 200) * 0.06;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

export function IntensityGauge({ value, size = 150 }: { value: number; size?: number }) {
  const [mounted, setMounted] = useState(false);
  const v = Math.max(0, Math.min(100, value));
  const { label, color } = intensityLabel(v);

  const r = 70;
  const cx = 80;
  const cy = 80;
  const half = Math.PI * r; // longueur du demi-cercle (180°)
  // Arc de 180° (de gauche à droite)
  const path = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  const offset = half * (1 - v / 100);

  useEffect(() => {
    // petite animation d'apparition (0 → valeur)
    const id = window.setTimeout(() => setMounted(true), 30);
    return () => window.clearTimeout(id);
  }, []);

  const pctRef = useRef(v);
  useEffect(() => {
    pctRef.current = v;
  }, [v]);

  return (
    <div className="relative inline-flex flex-col items-center" style={{ width: size }}>
      <svg viewBox="0 0 160 100" width={size} height={size * 0.62} className="overflow-visible">
        {/* piste */}
        <path d={path} fill="none" stroke="var(--border)" strokeWidth={14} strokeLinecap="round" />
        {/* valeur */}
        <path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth={14}
          strokeLinecap="round"
          strokeDasharray={half}
          strokeDashoffset={mounted ? offset : half}
          style={{ transition: "stroke-dashoffset 1.1s cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
        <span className="text-xl font-bold tracking-tight text-foreground">{v}%</span>
        <span className="text-xs font-semibold" style={{ color }}>{label}</span>
      </div>
    </div>
  );
}
