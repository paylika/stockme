/**
 * XAALISPAY — le tiers de confiance de StockMe.
 *
 * POURQUOI CE FICHIER : XaalisPay n'est pas une publicité à afficher, c'est la
 * réponse au plus gros trou de StockMe. Aujourd'hui une commande se conclut sur
 * WhatsApp : l'acheteur envoie l'argent à un inconnu à 600 km, ou le vendeur
 * livre et attend d'être payé. XaalisPay bloque l'argent jusqu'à la réception :
 * plus de commande fantôme, plus d'arnaque.
 *
 * Le vrai levier n'est donc PAS une bannière : c'est de faire DEMANDER le
 * paiement protégé par l'acheteur (un vendeur qui reçoit la demande l'active),
 * puis de le faire ACCEPTER par le vendeur, qui y gagne sa protection.
 *
 * Un seul endroit à modifier si l'offre XaalisPay change.
 */

export const XAALISPAY = {
  /** Site officiel (page de présentation). */
  site: "https://www.xaalispay.com",
  /**
   * Liens de téléchargement RÉELS, repris tels quels depuis le site XaalisPay
   * (vérifiés : les deux répondent). Le paquet Android s'appelle
   * `com.xaalispay.seller` : c'est l'application que XaalisPay met en avant.
   */
  appStore: "https://apps.apple.com/sn/app/xaalispay/id6798891695?l=fr-FR",
  playStore: "https://play.google.com/store/apps/details?id=com.xaalispay.seller",
  /** Frais de protection du séquestre, en FCFA (constatés sur leur démo). */
  protectionFee: 500,
  /** Délai de livraison garanti par le séquestre. */
  deliveryHours: 48,
  /** Temps laissé à l'acheteur pour contrôler et ouvrir un litige. */
  checkMinutes: 30,
  countries: ["Sénégal", "Côte d'Ivoire", "Mali", "Bénin", "Togo"],
  /** Moyens de paiement acceptés par XaalisPay. */
  methods: ["Wave", "Orange Money", "Free Money"],
} as const;

/**
 * Quel lien ouvrir ? Sur un téléphone, on envoie DIRECTEMENT vers le bon store
 * (l'utilisateur ne doit pas chercher le lien de téléchargement) ; sur
 * ordinateur, vers le site de présentation.
 */
export function preferredStoreUrl(): string {
  if (typeof navigator === "undefined") return XAALISPAY.site;
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return XAALISPAY.playStore;
  if (/iphone|ipad|ipod|macintosh/i.test(ua)) return XAALISPAY.appStore;
  return XAALISPAY.site;
}

/**
 * Les 4 étapes, dans les mots du terrain (pas de jargon bancaire).
 */
export const XAALISPAY_STEPS = [
  {
    n: "1",
    title: "L'acheteur paie dans l'application",
    detail: `L'argent part chez XaalisPay, pas chez le vendeur. (${XAALISPAY.methods.join(", ")})`,
  },
  {
    n: "2",
    title: `Le vendeur livre sous ${XAALISPAY.deliveryHours} h`,
    detail: `S'il ne livre pas, l'acheteur est remboursé automatiquement.`,
  },
  {
    n: "3",
    title: `L'acheteur vérifie (${XAALISPAY.checkMinutes} min)`,
    detail: "Marchandise conforme ? Il valide. Sinon, il ouvre un litige.",
  },
  {
    n: "4",
    title: "L'argent est libéré au vendeur",
    detail: "Automatiquement, une fois la réception validée. Personne ne se déplace pour rien.",
  },
] as const;

/** Ce que chacun y gagne — utilisé tel quel dans l'interface. */
export const XAALISPAY_BENEFITS = {
  buyer: [
    "Vous ne payez plus un inconnu sans garantie",
    "Remboursé si le colis n'arrive pas",
    "30 minutes pour vérifier avant que l'argent parte",
    "Un litige existe : vous n'êtes plus seul",
  ],
  seller: [
    "Fini les commandes fantômes et les faux rendez-vous",
    "Vous livrez quand l'argent est DÉJÀ bloqué : plus de livraison inutile",
    "Vos clients hésitants achètent enfin (ils sont couverts)",
    "Un badge de confiance sur vos produits StockMe",
  ],
} as const;

/**
 * L'INCITATION — pourquoi faire le premier pas MAINTENANT.
 *
 * ⚠️ StockMe NE prend PAS en charge les frais de séquestre : XaalisPay facture
 * sa protection à l'acheteur, et le montant exact s'affiche dans l'application
 * avant qu'il valide. On ne promet donc jamais la gratuité — on promet un
 * bénéfice à celui qui essuie les plâtres : le VENDEUR.
 */
export const XAALISPAY_OFFER = {
  seller: {
    title: "Votre 1ʳᵉ vente protégée : +2 000 FCFA de mise en avant offerts",
    detail:
      "Une fois votre première commande encaissée via XaalisPay, StockMe crédite 2 jours de mise en avant sur votre solde.",
  },
} as const;

/** Message de réclamation (traitement manuel, sous 24 h). */
export function claimMessage(kind: "seller", who?: string | null): string {
  return [
    "Bonjour StockMe, je veux profiter de l'offre XaalisPay :",
    XAALISPAY_OFFER.seller.title + ".",
    who ? `Mon compte / boutique : ${who}` : "",
    "Comment on procède ?",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Message WhatsApp qui PROPOSE le paiement protégé.
 * C'est la pièce maîtresse : l'acheteur demande, le vendeur doit s'équiper
 * pour ne pas perdre la vente. C'est ce qui crée l'usage.
 */
export function securePaymentProposal(opts: {
  productName: string;
  priceFcfa?: number | null;
  productUrl?: string;
  quantity?: number | null;
}): string {
  const lignes = [
    `Bonjour, je suis intéressé par « ${opts.productName} »${opts.quantity ? ` (${opts.quantity})` : ""}${
      opts.priceFcfa ? ` — ${opts.priceFcfa.toLocaleString("fr-FR")} FCFA` : ""
    } vu sur StockMe.`,
    "",
    // Le cœur du message : ce n'est pas une pub, c'est une condition d'achat.
    "Pour être tranquilles tous les deux, je propose de passer par *XaalisPay* : je paie, l'argent est bloqué chez eux, vous livrez, je valide et vous êtes payé.",
    "C'est la seule façon pour moi d'envoyer l'argent à l'avance sans risque (et vous, vous êtes sûr d'être payé).",
    "",
    "Comment ça marche en 4 étapes : https://stockme.store/paiement-securise",
  ];
  if (opts.productUrl) lignes.push("", opts.productUrl);
  return lignes.join("\n");
}
