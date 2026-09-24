import { useEffect, useState } from "react";

/**
 * Pays du visiteur : détection automatique + choix mémorisé.
 *
 * Détection : Cloudflare ajoute l'en-tête `CF-IPCountry` à chaque requête
 * (aucun service externe, aucune permission, instantané). Notre route serveur
 * `/api/geo` le traduit en nom de pays StockMe.
 *
 * Le choix de l'utilisateur est PRIORITAIRE et mémorisé : s'il choisit un pays
 * (ou « toute l'Afrique de l'Ouest »), on ne le contredit plus jamais.
 */

/** Code ISO 3166-1 alpha-2 → pays utilisé dans StockMe. */
const ISO_TO_COUNTRY: Record<string, string> = {
  SN: "Sénégal",
  CI: "Côte d'Ivoire",
  ML: "Mali",
  BF: "Burkina Faso",
  NE: "Niger",
  GN: "Guinée",
  GW: "Guinée-Bissau",
  BJ: "Bénin",
  TG: "Togo",
  GH: "Ghana",
  NG: "Nigeria",
  LR: "Liberia",
  SL: "Sierra Leone",
  GM: "Gambie",
  MR: "Mauritanie",
  CV: "Cap-Vert",
  // Un visiteur hors zone couverte (Europe, Amérique…) reste sur le flux global.
};

export const countryFromIso = (iso?: string | null): string | null =>
  iso ? ISO_TO_COUNTRY[iso.toUpperCase()] ?? null : null;

const PREF_KEY = "stockme:country-pref";

/** Valeur spéciale : l'utilisateur veut voir TOUS les pays. */
export const ALL_COUNTRIES = "ALL";

let detected: string | null | undefined;
let inflight: Promise<string | null> | null = null;

/** Pays détecté par IP (une seule requête par session). */
export function detectVisitorCountry(): Promise<string | null> {
  if (detected !== undefined) return Promise.resolve(detected);
  if (typeof window === "undefined") return Promise.resolve(null);
  inflight =
    inflight ??
    fetch("/api/geo")
      .then((r) => (r.ok ? r.json() : { country: null }))
      .then((d: { country?: string | null }) => {
        detected = d?.country ?? null;
        return detected;
      })
      .catch(() => {
        detected = null;
        return null;
      });
  return inflight;
}

export type VisitorCountry = {
  /** Pays détecté automatiquement (null si hors zone ou en développement). */
  detected: string | null;
  /** Choix explicite de l'utilisateur (pays, ou ALL_COUNTRIES). */
  manual: string | null;
  /** Pays à appliquer : le choix de l'utilisateur sinon la détection. */
  country: string | null;
  /** true si le filtre vient de la détection (donc modifiable librement). */
  isAuto: boolean;
  setManual: (value: string | null) => void;
};

export function useVisitorCountry(): VisitorCountry {
  const [manual, setManualState] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      return window.localStorage.getItem(PREF_KEY);
    } catch {
      return null;
    }
  });
  const [auto, setAuto] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    detectVisitorCountry().then((c) => {
      if (!cancel) setAuto(c);
    });
    return () => {
      cancel = true;
    };
  }, []);

  const setManual = (value: string | null) => {
    setManualState(value);
    if (typeof window === "undefined") return;
    try {
      if (value === null) window.localStorage.removeItem(PREF_KEY);
      else window.localStorage.setItem(PREF_KEY, value);
    } catch {
      /* stockage indisponible : le filtre reste valable pour la session */
    }
  };

  const country = manual === ALL_COUNTRIES ? null : manual ?? auto;

  return { detected: auto, manual, country, isAuto: !manual && !!auto, setManual };
}
