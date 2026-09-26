/**
 * Mémoire de l'intention de mise en avant.
 *
 * Le paiement se fait chez le fournisseur (page externe) : le vendeur QUITTE le
 * site. Sans cette mémoire, il devrait retrouver son produit et sa durée à son
 * retour — c'est exactement là qu'on perd un achat.
 *
 * On garde donc, dans la session du navigateur, le produit choisi et le nombre
 * de jours. Au retour du paiement, le vendeur retrouve son choix déjà prêt et
 * n'a plus qu'un bouton à toucher pour lancer la diffusion.
 */
export type BoostIntent = {
  productId: string;
  productName: string;
  days: number;
  /** Horodatage : une intention vieille de plus d'un jour est oubliée. */
  at: number;
};

const KEY = "stockme:boost-intent";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function saveBoostIntent(intent: Omit<BoostIntent, "at">) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...intent, at: Date.now() }));
  } catch {
    /* navigation privée : on continue sans mémoire */
  }
}

export function readBoostIntent(): BoostIntent | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BoostIntent;
    if (!parsed?.productId || Date.now() - (parsed.at ?? 0) > MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearBoostIntent() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* rien à faire */
  }
}
