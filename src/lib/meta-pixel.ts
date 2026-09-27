/**
 * PIXEL META (Facebook / Instagram) — installé pour suivre les campagnes.
 *
 * ⚡ RÈGLE D'OR ICI : le pixel ne doit JAMAIS ralentir le site.
 *   • On pose d'abord le « boîtier » `fbq` (une file d'attente de quelques
 *     centièmes de Ko, en local) : les événements peuvent être enregistrés tout
 *     de suite, même si le script Meta n'est pas encore arrivé.
 *   • Le vrai script Meta (fbevents.js, un fichier externe de ~90 Ko) est
 *     chargé SEULEMENT quand la page est terminée et que le navigateur est
 *     libre. Il n'entre donc jamais en concurrence avec l'affichage.
 *
 * ÉVÉNEMENTS ENVOYÉS :
 *   • PageView                → chaque page vue (y compris la navigation interne)
 *   • CompleteRegistration    → création de compte (le vrai « prospect »)
 *   • PublierProduit (personnalisé) → première publication d'un produit
 *   • Contact (personnalisé)  → un acheteur qui écrit au vendeur sur WhatsApp
 *   • AddToWishlist (personnalisé) → un produit mis en favori
 *
 * Ces trois derniers sont ce qui permet de passer plus tard à l'objectif
 * « Ventes » : Meta saura optimiser sur de vrais résultats, pas sur des clics.
 */

export const META_PIXEL_ID = "28983107031287431";

type Fbq = ((...args: unknown[]) => void) & { queue?: unknown[]; loaded?: boolean; version?: string; callMethod?: unknown };

declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
  }
}

let started = false;
let scriptRequested = false;

/** Charge le script Meta quand le navigateur est libre. */
function requestScript() {
  if (scriptRequested || typeof document === "undefined") return;
  scriptRequested = true;

  const inject = () => {
    if (document.getElementById("meta-pixel-js")) return;
    const s = document.createElement("script");
    s.id = "meta-pixel-js";
    s.async = true;
    s.src = "https://connect.facebook.net/en_US/fbevents.js";
    document.head.appendChild(s);
  };

  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  const later = () => {
    if (typeof w.requestIdleCallback === "function") w.requestIdleCallback(inject, { timeout: 3000 });
    else window.setTimeout(inject, 1200);
  };

  if (document.readyState === "complete") later();
  else window.addEventListener("load", later, { once: true });
}

/** Démarre le pixel (à appeler une seule fois, au montage de l'application). */
export function startMetaPixel() {
  if (started || typeof window === "undefined") return;
  started = true;

  // File d'attente locale : les événements partent dès que le script arrive.
  if (!window.fbq) {
    const fbq = function (this: unknown, ...args: unknown[]) {
      const self = fbq as Fbq;
      if (self.callMethod) (self.callMethod as (...a: unknown[]) => void).apply(self, args);
      else self.queue?.push(args);
    } as Fbq;
    fbq.queue = [];
    fbq.loaded = true;
    fbq.version = "2.0";
    window.fbq = fbq;
    window._fbq = fbq;
  }

  window.fbq("init", META_PIXEL_ID);
  window.fbq("track", "PageView");
  requestScript();
}

/** Page vue (navigation interne d'une application à page unique). */
export function trackPageView(path?: string) {
  if (typeof window === "undefined" || !window.fbq) return;
  window.fbq("track", "PageView", path ? { path } : undefined);
}

/** Compte créé : c'est LE prospect que les campagnes doivent chercher. */
export function trackCompleteRegistration(role?: string) {
  if (typeof window === "undefined" || !window.fbq) return;
  window.fbq("track", "CompleteRegistration", { content_name: role ?? "vendeur" });
}

/** Premier produit publié : le vrai passage à l'acte du vendeur. */
export function trackPublishProduct(name: string, priceFcfa?: number) {
  if (typeof window === "undefined" || !window.fbq) return;
  window.fbq("trackCustom", "PublierProduit", {
    content_name: name,
    value: priceFcfa ?? 0,
    currency: "XOF",
  });
}

/** Un acheteur a écrit au vendeur (WhatsApp, appel, copie du numéro). */
export function trackContact(how: "whatsapp" | "appel" | "copie" | "fiche", productName?: string) {
  if (typeof window === "undefined" || !window.fbq) return;
  window.fbq("trackCustom", "Contact", { content_name: productName ?? how, content_category: how });
}

/** Produit mis en favori. */
export function trackAddToWishlist(name?: string) {
  if (typeof window === "undefined" || !window.fbq) return;
  window.fbq("trackCustom", "AddToWishlist", { content_name: name ?? "" });
}
