/**
 * Paliers de prix par quantité — la logique du gros (comme Alibaba) :
 * plus l'acheteur prend de pièces, moins l'unité lui coûte.
 *
 *   ex. de 10 à 99 pièces → 1 000 F l'unité
 *       de 100 à 499     → 800 F
 *       à partir de 500  → 650 F
 *
 * Stockés dans `products.price_tiers` (jsonb) : un tableau d'objets
 * `{ from, to, price }` où `to = null` signifie « et plus ».
 * Ce module est partagé par le formulaire, la fiche produit et les cartes.
 */
export type PriceTier = {
  /** Première quantité du palier (incluse). */
  from: number;
  /** Dernière quantité du palier (incluse), ou null pour « et plus ». */
  to: number | null;
  /** Prix UNITAIRE en FCFA pour ce palier. */
  price: number;
};

/** Lit des paliers venant de la base sans jamais faire planter l'affichage. */
export function normalizeTiers(raw: unknown): PriceTier[] {
  if (!Array.isArray(raw)) return [];
  const out: PriceTier[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const t = item as { from?: unknown; to?: unknown; price?: unknown };
    const from = Number(t.from);
    const price = Number(t.price);
    const to = t.to === null || t.to === undefined || t.to === "" ? null : Number(t.to);
    if (!Number.isFinite(from) || !Number.isFinite(price) || from < 1 || price < 1) continue;
    if (to !== null && (!Number.isFinite(to) || to < from)) continue;
    out.push({ from, to, price });
  }
  return out.sort((a, b) => a.from - b.from);
}

/** « 10 – 99 » ou « 500 et plus ». */
export function tierRangeLabel(t: PriceTier): string {
  return t.to === null ? `${t.from} et plus` : `${t.from} – ${t.to}`;
}

/** Prix unitaire applicable pour une quantité donnée (null si aucun palier). */
export function priceForQuantity(tiers: PriceTier[], qty: number): number | null {
  let found: number | null = null;
  for (const t of tiers) {
    if (qty >= t.from && (t.to === null || qty <= t.to)) found = t.price;
  }
  return found;
}

/** Meilleur prix (le plus bas, donc le plus gros palier) — pour « dès X F ». */
export function lowestTierPrice(tiers: PriceTier[]): number | null {
  if (tiers.length === 0) return null;
  return Math.min(...tiers.map((t) => t.price));
}

/**
 * Vérifie la cohérence d'une liste de paliers.
 * Renvoie un message d'erreur, ou null si tout est bon.
 */
export function validateTiers(tiers: PriceTier[], moq: number, basePrice: number): string | null {
  if (tiers.length === 0) return null;

  const sorted = [...tiers].sort((a, b) => a.from - b.from);
  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i];
    if (t.from < moq) return `Le palier ${tierRangeLabel(t)} commence avant votre commande minimum (${moq}).`;
    if (t.price > basePrice)
      return `Le palier ${tierRangeLabel(t)} est plus cher que votre prix de vente : les paliers doivent faire baisser le prix.`;
  }
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if (prev.to === null) return "Le palier « et plus » doit être le dernier.";
    if (cur.from <= prev.to) return `Les paliers se chevauchent (${tierRangeLabel(prev)} et ${tierRangeLabel(cur)}).`;
    if (cur.price > prev.price)
      return `Le prix doit baisser quand la quantité augmente (${tierRangeLabel(cur)} est plus cher).`;
  }
  return null;
}
