import { SITE_URL } from "@/lib/seo";

export function formatFCFA(n: number): string {
  return new Intl.NumberFormat("fr-FR").format(n) + " FCFA";
}

/**
 * NUMÉRO DE TÉLÉPHONE — LA RÈGLE D'OR DU CONTACT VENDEUR.
 *
 * Un lien WhatsApp n'accepte QUE la forme internationale complète, sans « + » :
 *   ✅ 221771234567   → le contact s'ouvre
 *   ❌ 771234567      → WhatsApp répond « numéro invalide », l'acheteur ne peut
 *                        pas joindre le vendeur et la vente est perdue.
 *
 * Or la plupart des vendeurs sénégalais saisissent « 77 123 45 67 » sans
 * indicatif. Cette fonction répare le numéro dans tous les cas :
 *   • « 77 123 45 67 »      → 221771234567
 *   • « 077 123 45 67 »     → 221771234567
 *   • « +221 77 123 45 67 » → 221771234567
 *   • « 00221 77 123 45 67 »→ 221771234567
 * Elle est appliquée À LA FOIS à la saisie (pour stocker un numéro propre) et à
 * l'affichage (pour réparer les numéros déjà enregistrés).
 *
 * Marché de StockMe : le Sénégal (indicatif 221, numéros mobiles à 9 chiffres
 * commençant par 7, fixes par 3). Un numéro étranger déjà complet est conservé
 * tel quel, jamais transformé à l'aveugle.
 */
export function normalizePhone(input: string | null | undefined): string {
  let d = String(input ?? "").replace(/\D/g, "");
  if (!d) return "";
  // Indicatif international écrit « 00 » au lieu de « + »
  if (d.startsWith("00")) d = d.slice(2);
  // Numéro sénégalais local : 9 chiffres (77 123 45 67)
  if (d.length === 9 && /^[73]/.test(d)) return `221${d}`;
  // Numéro sénégalais local avec le zéro de tête (077 123 45 67)
  if (d.length === 10 && d.startsWith("0") && /^[73]/.test(d.slice(1))) return `221${d.slice(1)}`;
  return d;
}

/** Affichage lisible : 221771234567 → « +221 77 123 45 67 ». */
export function formatPhone(input: string | null | undefined): string {
  const d = normalizePhone(input);
  if (!d) return "";
  if (d.startsWith("221") && d.length === 12) {
    const n = d.slice(3);
    return `+221 ${n.slice(0, 2)} ${n.slice(2, 5)} ${n.slice(5, 7)} ${n.slice(7, 9)}`;
  }
  return `+${d}`;
}

export function whatsappLink(phone: string, message: string): string {
  const clean = normalizePhone(phone);
  return `https://wa.me/${clean}?text=${encodeURIComponent(message)}`;
}

/** Lien téléphonique cliquable, toujours en forme internationale. */
export function telLink(phone: string | null | undefined): string | null {
  const d = normalizePhone(phone);
  return d ? `tel:+${d}` : null;
}

/**
 * Message WhatsApp pré-rempli pour contacter un vendeur au sujet d'un produit.
 *
 * Le message contient le LIEN de la fiche produit : WhatsApp affiche alors un
 * aperçu (photo du produit, nom, prix) grâce aux balises Open Graph de la page.
 * C'est pour ça que le lien figure TOUJOURS dans le message : sans lien, aucune
 * image ne peut s'afficher dans la conversation.
 */
export function productInquiryMessage(p: {
  id: string;
  name: string;
  dropshipping?: boolean | null;
  /** Prix affiché à l'acheteur (promo déjà appliquée si elle existe). */
  priceFcfa?: number | null;
}): string {
  const url = `${SITE_URL}/product/${p.id}`;
  const price =
    typeof p.priceFcfa === "number" && p.priceFcfa > 0 ? ` (${formatFCFA(p.priceFcfa)})` : "";
  return p.dropshipping
    ? `Bonjour, je souhaite commander « ${p.name} »${price} vu sur StockMe :\n${url}`
    : `Bonjour, je suis intéressé par votre stock de « ${p.name} »${price} sur StockMe :\n${url}`;
}

/** Même principe pour contacter une boutique entière. */
export function sellerInquiryMessage(seller: {
  id: string;
  shopName?: string | null;
  fullName?: string | null;
  city?: string | null;
}): string {
  const name = (seller.shopName || seller.fullName || "").trim();
  const url = `${SITE_URL}/vendeur/${seller.id}`;
  return (
    `Bonjour${name ? ` ${name}` : ""}, je vous contacte via StockMe au sujet de vos produits` +
    `${seller.city ? ` (${seller.city})` : ""} :\n${url}`
  );
}
