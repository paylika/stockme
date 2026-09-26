import { SITE_URL } from "@/lib/seo";

export function formatFCFA(n: number): string {
  return new Intl.NumberFormat("fr-FR").format(n) + " FCFA";
}

export function whatsappLink(phone: string, message: string): string {
  const clean = phone.replace(/\D/g, "");
  return `https://wa.me/${clean}?text=${encodeURIComponent(message)}`;
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
