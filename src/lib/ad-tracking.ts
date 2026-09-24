import { supabase } from "@/integrations/supabase/stockme-client";

/**
 * Suivi des annonces (impressions / clics).
 * Une impression est comptée AU PLUS UNE FOIS par annonce et par jour, et par visiteur
 * (mémoire locale) : les chiffres restent exploitables, sans gonfler avec les rechargements.
 */

const STORE_KEY = "stockme:ads-seen";
const CLICK_KEY = "stockme:ads-clicked";

function readSet(key: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(key);
    return new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function writeSet(key: string, set: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    // On garde la mémoire légère (200 entrées max).
    const arr = Array.from(set).slice(-200);
    window.localStorage.setItem(key, JSON.stringify(arr));
  } catch {
    /* stockage indisponible : on n'empêche jamais l'affichage */
  }
}

const today = () => new Date().toISOString().slice(0, 10);

/** Impression : comptée une fois par annonce, par visiteur et par jour. */
export function trackAdImpression(adId: string | null | undefined) {
  if (!adId || typeof window === "undefined") return;
  const token = `${adId}:${today()}`;
  const seen = readSet(STORE_KEY);
  if (seen.has(token)) return;
  seen.add(token);
  writeSet(STORE_KEY, seen);
  void supabase.rpc("log_ad_event", { p_ad_id: adId, p_event: "impression" });
}

/** Clic : compté une fois par annonce, par visiteur et par jour. */
export function trackAdClick(adId: string | null | undefined) {
  if (!adId || typeof window === "undefined") return;
  const token = `${adId}:${today()}`;
  const seen = readSet(CLICK_KEY);
  if (seen.has(token)) return;
  seen.add(token);
  writeSet(CLICK_KEY, seen);
  void supabase.rpc("log_ad_event", { p_ad_id: adId, p_event: "click" });
}

/** Taux de clic en pourcentage (0 si aucune impression). */
export function ctr(impressions: number, clicks: number) {
  if (!impressions) return 0;
  return Math.round((clicks / impressions) * 1000) / 10;
}
