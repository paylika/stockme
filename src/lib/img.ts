/**
 * IMAGES OPTIMISÉES À LA VOLÉE.
 *
 * LE CONSTAT (mesuré sur la production) : les photos produits pèsent en moyenne
 * 341 Ko, jusqu'à 1,3 Mo — alors que la carte produit les affiche en 180 px.
 * Résultat : 8 Mo d'images pour la seule page d'accueil, soit 10 à 30 secondes
 * sur une connexion mobile normale. C'était LE premier ralentisseur du site,
 * bien avant le JavaScript.
 *
 * LA SOLUTION : un service d'images public et gratuit (wsrv.nl) redimensionne
 * la photo à la volée et la renvoie en WebP. Mesuré : 294 Ko → 35 Ko pour une
 * carte (8× plus léger), 101 Ko en 900 px pour la grande photo de la fiche.
 *
 * AUCUN RISQUE : si le service ne répond pas, l'image d'origine est utilisée
 * automatiquement (voir `Img` plus bas). Le site ne peut donc jamais perdre ses
 * photos à cause de ce service.
 *
 * Les URL d'aperçu (WhatsApp, Google) ne passent PAS par ici : elles gardent
 * l'image d'origine.
 */

const CDN = "https://wsrv.nl/";
/** Hôtes à ne jamais redimensionner (données locales, SVG d'interface). */
const SKIP = /^data:|\.svg(\?|$)/i;

export type ThumbOptions = {
  /** Largeur voulue en pixels. */
  w: number;
  /** Hauteur (facultatif) : avec `cover`, recadre proprement. */
  h?: number;
  /** Qualité WebP (par défaut 72 : invisible à l'œil, très léger). */
  q?: number;
  /** Recadrer pour remplir exactement w×h (vignettes carrées). */
  cover?: boolean;
};

/** URL redimensionnée (ou l'originale si le service ne peut pas s'appliquer). */
export function thumb(url: string | null | undefined, opts: ThumbOptions | number): string {
  if (!url) return "";
  const o: ThumbOptions = typeof opts === "number" ? { w: opts } : opts;
  if (!/^https?:\/\//i.test(url) || SKIP.test(url)) return url;
  if (!o.w || o.w < 32) return url;

  const params = new URLSearchParams();
  params.set("url", url);
  params.set("w", String(Math.round(o.w)));
  if (o.h) params.set("h", String(Math.round(o.h)));
  if (o.cover) params.set("fit", "cover");
  params.set("q", String(o.q ?? 72));
  params.set("output", "webp");
  // `we` = without enlargement : une petite photo n'est jamais agrandie (floue).
  params.set("we", "");
  return `${CDN}?${params.toString()}`;
}

/**
 * `src` + `srcSet` prêts pour un <img> : le navigateur choisit la taille qui
 * correspond à l'écran (téléphone, tablette, ordinateur) et à sa densité.
 */
export function thumbResponsive(
  url: string | null | undefined,
  widths: number[],
  sizes: string,
): { src: string; srcSet: string | undefined; sizes: string | undefined } {
  if (!url) return { src: "", srcSet: undefined, sizes: undefined };
  const src = thumb(url, widths[0]);
  if (widths.length < 2) return { src, srcSet: undefined, sizes: undefined };
  return {
    src,
    srcSet: widths.map((w) => `${thumb(url, w)} ${w}w`).join(", "),
    sizes,
  };
}

/** Tailles de référence par usage (évite d'inventer des valeurs à chaque écran). */
export const IMG = {
  /** Vignette de carte produit dans une grille (2 à 4 colonnes). */
  card: {
    widths: [400, 700],
    sizes: "(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 22vw",
  },
  /** Grande photo de la fiche produit (pleine largeur sur mobile). */
  hero: { widths: [700, 1100], sizes: "(max-width: 1024px) 100vw, 55vw" },
  /** Bandeau de vignettes sous la grande photo. */
  thumb: 150,
  /** Photo d'avis client. */
  review: 320,
  /** Photo jointe à une demande d'achat. */
  request: 320,
  /** Avatar / logo de boutique. */
  avatar: 120,
  /** Bannière de boutique. */
  banner: { widths: [800, 1400], sizes: "100vw" },
} as const;
