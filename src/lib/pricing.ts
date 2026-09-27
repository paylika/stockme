/**
 * Grille tarifaire StockMe — source unique de vérité.
 *
 * LOGIQUE (décidée avec le fondateur) :
 *   PRO ⊃ Vérifié. Le badge est toujours ACQUIS :
 *     • soit par un achat annuel (2 000 F / 12 mois) ;
 *     • soit automatiquement tant que l'abonnement PRO est actif ;
 *     • soit par l'admin (vérification manuelle → à vie).
 *   Ce qui change, c'est ce qui RESTE si le vendeur arrête : avec le badge
 *   annuel, il garde son badge 12 mois ; avec PRO seul, il le perd.
 *
 * Le « pack 4 500 » (= badge annuel + PRO) se fait en 2 étapes dans la même
 * fenêtre : 2 000 F pour sécuriser l'année, puis 2 500 F/mois pour PRO.
 * Aucun double paiement : le vendeur n'achète jamais deux fois le badge.
 */

export type PlanId = "gratuit" | "verifie" | "pro" | "pro_annuel";

/**
 * QUOTAS ET PRIX DE PUBLICATION — les mêmes pour tout le monde :
 *   • 20 produits publiés offerts (gratuit compris) ;
 *   • 5 photos par produit (gratuit compris) ;
 *   • au-delà de 20 produits : 500 F par publication, prélevés sur le solde ;
 *   • mise en avant : 1 000 F/jour, pour tous (prix unique, aucune option).
 */
export const FREE_PRODUCTS = 20;
export const EXTRA_PUBLICATION_PRICE = 500;
export const MAX_PHOTOS_PER_PRODUCT = 5;

/**
 * MISE EN AVANT — LE PRIX SE DÉGRADE AVEC LA DURÉE.
 *
 * Prix d'entrée : **1 000 F pour UNE journée** (800 F pour un Vendeur Pro).
 * C'est le point le plus important : il est beaucoup plus facile de sortir
 * 1 000 F que 7 000 F. Le vendeur essaie un jour, voit l'effet, puis allonge.
 *
 *   • 1 à 10 jours  → 1 000 F / jour   (Pro : 800 F)
 *   • 11 à 20 jours →   900 F / jour   (Pro : 700 F)
 *   • 21 jours et + →   800 F / jour   (Pro : 600 F)
 *
 * C'est l'utilisateur qui choisit la durée : il voit le TOTAL et l'ÉCONOMIE
 * avant de payer, recharge par carte, et lance.
 */
export const BOOST_DAY_PRICE = 1000;

export const BOOST_TIERS: { min: number; max: number; price: number; note: string }[] = [
  { min: 1, max: 10, price: BOOST_DAY_PRICE, note: "prix normal" },
  { min: 11, max: 20, price: 900, note: "−100 F par jour" },
  { min: 21, max: 90, price: 800, note: "−200 F par jour" },
];

/**
 * MISE EN AVANT D'UN VENDEUR PRO — ELLE DÉMARRE À 800 F/JOUR.
 *
 * C'est l'avantage qui se voit tout de suite : le Pro paie 800 F la première
 * journée au lieu de 1 000 F, et la journée descend jusqu'à 600 F sur les
 * longues durées. Même dégressivité que tout le monde, un cran en dessous.
 * (Identique pour Vendeur Pro mensuel et Vendeur Pro à l'année.)
 */
export const PRO_BOOST_DAY_PRICE = 800;

export const PRO_BOOST_TIERS: { min: number; max: number; price: number; note: string }[] = [
  { min: 1, max: 10, price: PRO_BOOST_DAY_PRICE, note: "prix Pro" },
  { min: 11, max: 20, price: 700, note: "−100 F par jour" },
  { min: 21, max: 90, price: 600, note: "−200 F par jour" },
];

/** Prix d'une journée selon la durée choisie (et l'offre du vendeur). */
export const boostDayPrice = (days: number, isPro = false): number => {
  const d = Math.max(1, Math.floor(days || 1));
  const tiers = isPro ? PRO_BOOST_TIERS : BOOST_TIERS;
  return tiers.find((t) => d >= t.min && d <= t.max)?.price ?? (isPro ? 600 : 800);
};

/** Prix TOTAL pour N jours (dégressif). */
export const boostPriceFor = (days: number, isPro = false): number => {
  const d = Math.max(0, Math.floor(days || 0));
  return d * boostDayPrice(d, isPro);
};

/** Économie par rapport au prix normal (1 000 F/jour) — affichée au vendeur. */
export const boostSavingsFor = (days: number, isPro = false): number => {
  const d = Math.max(0, Math.floor(days || 0));
  return d * (BOOST_DAY_PRICE - boostDayPrice(d, isPro));
};

/**
 * Les durées proposées. Le détail « combien de jours » reste entièrement libre :
 * le prix au jour baisse tout seul quand la durée augmente.
 */
export const BOOST_PACKS: { days: number; label: string; popular?: boolean }[] = [
  { days: 1, label: "essayer" },
  { days: 3, label: "3 jours" },
  { days: 7, label: "1 semaine", popular: true },
  { days: 15, label: "15 jours" },
  { days: 30, label: "1 mois" },
];

/** Durée pré-sélectionnée partout : 1 jour = 1 000 F (le prix d'entrée). */
export const BOOST_DEFAULT_DAYS = 1;

/** Durées proposées d'un clic (en jours). */
export const BOOST_DAY_PRESETS = BOOST_PACKS.map((p) => p.days);
/** Bornes de saisie libre du nombre de jours. */
export const BOOST_MIN_DAYS = 1;
export const BOOST_MAX_DAYS = 90;

export type Plan = {
  id: PlanId;
  name: string;
  /** Prix payé aujourd'hui, en FCFA. */
  price: number;
  /** Prix « normal », barré quand il y a un tarif de lancement. */
  regularPrice?: number;
  period: string;
  /** Équivalent mensuel, pour comparer honnêtement. */
  monthlyEquivalent?: number;
  tagline: string;
  /** Durée ajoutée au badge à chaque paiement (jours). */
  days: number;
  /** Abonnement mensuel automatique (carte enregistrée) ? */
  recurring: "month" | null;
  /** Valeur stockée dans profiles.plan. */
  dbPlan: "verifie" | "pro";
  features: string[];
  highlight?: boolean;
  badge?: string;
  /** Prix de la mise en avant par jour pour cette offre. */
  boostPerDay: number;
};

/** Offre gratuite (pour la page d'offres uniquement). */
export const FREE_PLAN = {
  id: "gratuit" as const,
  name: "Gratuit",
  price: 0,
  period: "pour toujours",
  boostPerDay: 1000,
  tagline: "Publiez vos produits et vendez dès aujourd'hui",
  features: [
    `${FREE_PRODUCTS} produits publiés`,
    `${MAX_PHOTOS_PER_PRODUCT} photos par produit`,
    "Statistiques de base (vues, contacts, favoris)",
    `Mise en avant à ${BOOST_DAY_PRICE.toLocaleString("fr-FR")} F/jour`,
    `Au-delà de ${FREE_PRODUCTS} produits : ${EXTRA_PUBLICATION_PRICE} F par publication`,
  ],
  missing: ["Badge Fournisseur vérifié", "Priorité dans la recherche", "1 500 F de mise en avant offerts"],
};

/** Crédit de mise en avant versé chaque mois aux vendeurs Vendeur Pro. */
export const PRO_MONTHLY_BOOST_CREDIT = 2000;

/** Type commun (offre gratuite incluse) pour l'affichage public. */
export type AnyPlan = {
  id: PlanId;
  name: string;
  price: number;
  regularPrice?: number;
  period: string;
  monthlyEquivalent?: number;
  tagline: string;
  features: string[];
  missing?: string[];
  boostPerDay: number;
  badge?: string;
  highlight?: boolean;
  days?: number;
  recurring?: "month" | null;
  dbPlan?: "verifie" | "pro";
};

/** Les offres payable (utilisées par la fenêtre d'abonnement). */
export const PAID_PLANS: Plan[] = [
  {
    id: "verifie",
    name: "Fournisseur vérifié",
    price: 2000,
    period: "par an",
    monthlyEquivalent: 167,
    days: 365,
    recurring: null,
    dbPlan: "verifie",
    boostPerDay: BOOST_DAY_PRICE,
    tagline: "La confiance qui fait écrire les acheteurs",
    badge: "Le badge",
    features: [
      "Badge « Fournisseur vérifié » sur toutes vos annonces",
      "Priorité dans la recherche (et dans les résultats de recherche par image)",
      "1 500 F de mise en avant offerts pour essayer",
      "Statistiques avancées (vues, clics, contacts)",
      "Assistance prioritaire WhatsApp",
    ],
  },
  {
    id: "pro",
    name: "Vendeur Pro",
    price: 2900,
    period: "par mois",
    monthlyEquivalent: 2900,
    days: 30,
    recurring: "month",
    dbPlan: "pro",
    boostPerDay: PRO_BOOST_DAY_PRICE,
    tagline: "Publiez sans limite, et payez la mise en avant moins cher",
    badge: "Le plus avantageux",
    highlight: true,
    /**
     * CE QU'ON OFFRE (décidé avec le fondateur) :
     *   • la mise en avant PRO démarre à 800 F/jour au lieu de 1 000 F, et
     *     descend jusqu'à 600 F — l'économie se voit dès la première journée ;
     *   • 2 000 F de mise en avant versés sur le solde chaque mois ;
     *   • publications illimitées (500 F l'unité au-delà de 20 pour les autres) ;
     *   • le badge vérifié, les statistiques détaillées, la priorité.
     */
    features: [
      `Mise en avant à ${PRO_BOOST_DAY_PRICE} F/jour au lieu de ${BOOST_DAY_PRICE} F (jusqu'à 600 F sur les longues durées)`,
      `${PRO_MONTHLY_BOOST_CREDIT.toLocaleString("fr-FR")} F de mise en avant versés chaque mois sur votre solde`,
      `Publications illimitées (au lieu de ${EXTRA_PUBLICATION_PRICE} F par produit au-delà de ${FREE_PRODUCTS})`,
      "Badge « Fournisseur vérifié » inclus",
      "Statistiques détaillées réservées aux Pro : par produit et coût par contact",
      "Prélèvement automatique par carte, résiliable à tout moment",
    ],
  },
  {
    id: "pro_annuel",
    name: "Vendeur Pro à l'année",
    price: 29000,
    period: "par an",
    monthlyEquivalent: 2417,
    days: 365,
    recurring: null,
    dbPlan: "pro",
    boostPerDay: PRO_BOOST_DAY_PRICE,
    tagline: "12 mois de Vendeur Pro, 2 mois offerts",
    badge: "2 mois offerts",
    features: [
      "Tout Vendeur Pro pendant 12 mois",
      "Paiement unique : plus rien à penser pendant un an",
      `Mise en avant à ${PRO_BOOST_DAY_PRICE} F/jour (jusqu'à 600 F), comme le Pro mensuel`,
      `24 000 F de mise en avant versés sur l'année (${PRO_MONTHLY_BOOST_CREDIT.toLocaleString("fr-FR")} F par mois)`,
      "Votre badge reste acquis même si vous arrêtez ensuite",
      "Soit 2 417 F/mois au lieu de 2 900",
    ],
  },
];

/** Les 4 offres alignées, pour la page d'offres publique. */
export const ALL_PLANS: AnyPlan[] = [FREE_PLAN, ...PAID_PLANS];

/**
 * Prix d'une journée de mise en avant — IDENTIQUE pour tout le monde.
 * (Conservé sous forme de table par offre : PRO est masqué aujourd'hui, mais
 * le jour où il revient, il n'y a qu'une ligne à changer ici.)
 */
/**
 * Prix d'une journée de mise en avant, par offre.
 * PRO démarre à 800 F (au lieu de 1 000 F) : c'est l'avantage le plus visible.
 */
export const BOOST_DAILY_PRICE: Record<PlanId, number> = {
  gratuit: BOOST_DAY_PRICE,
  verifie: BOOST_DAY_PRICE,
  pro: PRO_BOOST_DAY_PRICE,
  pro_annuel: PRO_BOOST_DAY_PRICE,
};

/**
 * Combien de jours de mise en avant un solde permet-il de payer ?
 *
 * Dégressif : un gros solde achète des journées moins chères. On avance palier
 * par palier pour ne jamais promettre plus de jours que le solde n'en paie.
 * (Les paliers d'un vendeur Pro sont ceux de son offre : 800 / 700 / 600.)
 */
export const boostDaysFor = (balanceFcfa: number, isPro = false): number => {
  const b = Math.max(0, Math.floor(Math.max(0, balanceFcfa)));
  if (b <= 0) return 0;
  const t = isPro ? PRO_BOOST_TIERS : BOOST_TIERS; // 3 paliers, du plus court au plus long
  if (b <= 10 * t[0].price) return Math.min(10, Math.floor(b / t[0].price));
  if (b <= 20 * t[1].price) return Math.min(20, Math.floor(b / t[1].price));
  return Math.min(90, Math.floor(b / t[2].price));
};

/** Durée du bonus offert à la vérification (jours de mise en avant). */
export const VERIFICATION_BONUS_DAYS = 3;
/** Montant du crédit offert, en FCFA. */
export const VERIFICATION_BONUS_FCFA = 1500;

/** Pack « badge annuel + PRO » : total payé le premier mois. */
export const PACK_TOTAL = 2000 + 2900; // 4 900 F
/**
 * PRO (abonnement mensuel et annuel) est MASQUÉ pour le moment.
 *
 * On garde volontairement simple : le badge Fournisseur vérifié à l'année
 * (2 000 F) et la mise en avant payée au jour. Tout ce qui touche à PRO
 * disparaît de l'interface — le code et les tarifs restent en place, il suffit
 * de repasser ce drapeau à `true` pour tout rallumer d'un coup.
 */
export const PRO_AVAILABLE = true;

/** Garantie affichée (levier de conversion). */
export const SATISFACTION_GUARANTEE =
  "Satisfait ou remboursé : si vous ne recevez aucun contact en 30 jours, nous vous remboursons intégralement.";

/**
 * Faut-il être vérifié pour acheter une mise en avant ?
 * Recommandation : NON (la mise en avant est un achat d'impulsion ; le badge
 * se vend par le prix réduit et les 72 h offertes).
 */
export const BOOST_REQUIRES_VERIFICATION = false;

export const planById = (id: PlanId | string): Plan | null =>
  PAID_PLANS.find((p) => p.id === id) ?? null;

/**
 * Le vendeur est-il PRO **aujourd'hui** ?
 *
 * Un abonnement Pro donne le badge ET les avantages TANT QU'IL EST PAYÉ :
 * `verified_until` est repoussé de 30 jours à chaque échéance. Une fois la date
 * passée, le compte redevient automatiquement « vérifié » (s'il garde un badge
 * annuel) ou « gratuit » — jamais Pro.
 */
export const isProActive = (profile: {
  plan?: string | null;
  verified?: boolean | null;
  verified_until?: string | null;
} | null | undefined): boolean => {
  if (profile?.plan !== "pro") return false;
  const until = profile.verified_until;
  return !until || new Date(until) > new Date();
};

/**
 * Offre réelle du vendeur.
 *
 * ⚠️ Important : un compte vérifié MANUELLEMENT par l'admin (ou dont la
 * colonne `plan` n'a pas encore été mise à jour) est bien « vérifié ». On ne
 * lui propose donc jamais d'acheter le badge une seconde fois.
 */
export const planOf = (profile: {
  plan?: string | null;
  verified?: boolean | null;
  verified_until?: string | null;
} | null | undefined): PlanId => {
  // Pro seulement tant que l'abonnement court (date d'échéance dépassée = fini).
  if (isProActive(profile)) return "pro";

  const stillVerified =
    !!profile?.verified && (!profile.verified_until || new Date(profile.verified_until) > new Date());

  if (stillVerified) return profile?.plan === "pro_annuel" ? "pro_annuel" : "verifie";
  return "gratuit";
};

export const isVerifiedPlan = (p: PlanId | string) => p === "verifie" || p === "pro" || p === "pro_annuel";
