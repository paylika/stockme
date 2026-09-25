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
 *   • 10 photos par produit (gratuit compris) ;
 *   • au-delà de 20 produits : 500 F par publication, prélevés sur le solde ;
 *   • mise en avant : 500 F/jour, pour tous.
 */
export const FREE_PRODUCTS = 20;
export const EXTRA_PUBLICATION_PRICE = 500;
export const MAX_PHOTOS_PER_PRODUCT = 10;

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
  boostPerDay: 500,
  tagline: "Publiez vos produits et vendez dès aujourd'hui",
  features: [
    `${FREE_PRODUCTS} produits publiés`,
    `${MAX_PHOTOS_PER_PRODUCT} photos par produit`,
    "Statistiques de base (vues, contacts, favoris)",
    "Mise en avant à 500 F/jour",
    `Au-delà de ${FREE_PRODUCTS} produits : ${EXTRA_PUBLICATION_PRICE} F par publication`,
  ],
  missing: ["Badge Fournisseur vérifié", "Priorité dans la recherche", "1 500 F de mise en avant offerts"],
};

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
    boostPerDay: 500,
    tagline: "La confiance qui fait écrire les acheteurs",
    badge: "Le badge",
    features: [
      "Badge « Fournisseur vérifié » sur toutes vos annonces",
      "Priorité dans la recherche (et dans les résultats de recherche par image)",
      "1 500 F de mise en avant offerts pour essayer (72 h)",
      "Statistiques avancées (vues, clics, contacts)",
      "Assistance prioritaire WhatsApp",
    ],
  },
  {
    id: "pro",
    name: "StockMe PRO",
    price: 2500,
    regularPrice: 3500,
    period: "par mois",
    monthlyEquivalent: 2500,
    days: 30,
    recurring: "month",
    dbPlan: "pro",
    boostPerDay: 400,
    tagline: "Pour dominer votre catégorie",
    badge: "Tarif de lancement",
    features: [
      "Tout ce que contient l'offre Fournisseur vérifié",
      "Mise en avant à 400 F/jour (le meilleur tarif)",
      "72 h de mise en avant offertes chaque mois",
      "Statistiques avancées : pays des acheteurs, taux de contact, valeur du stock",
      "Prélèvement automatique, résiliable à tout moment",
      "Assistance prioritaire + accompagnement",
    ],
  },
  {
    id: "pro_annuel",
    name: "PRO à l'année",
    price: 25000,
    period: "par an",
    monthlyEquivalent: 2083,
    days: 365,
    recurring: null,
    dbPlan: "pro",
    boostPerDay: 400,
    tagline: "12 mois de PRO, 2 mois offerts",
    badge: "2 mois offerts",
    features: [
      "Tout StockMe PRO pendant 12 mois",
      "Paiement unique : plus rien à penser pendant un an",
      "Votre badge reste acquis même si vous arrêtez ensuite",
      "Mise en avant à 400 F/jour pendant 12 mois",
      "Soit 2 083 F/mois au lieu de 2 500",
    ],
  },
];

/** Les 4 offres alignées, pour la page d'offres publique. */
export const ALL_PLANS: AnyPlan[] = [FREE_PLAN, ...PAID_PLANS];

/** Prix d'une journée de mise en avant — le MÊME pour tout le monde. */
export const BOOST_DAILY_PRICE: Record<PlanId, number> = {
  gratuit: 500,
  verifie: 500,
  pro: 500,
  pro_annuel: 500,
};

/** Durée du bonus offert à la vérification (jours de mise en avant). */
export const VERIFICATION_BONUS_DAYS = 3;
/** Montant du crédit offert, en FCFA. */
export const VERIFICATION_BONUS_FCFA = 1500;

/** Pack « badge annuel + PRO » : total payé le premier mois. */
export const PACK_TOTAL = 2000 + 2500; // 4 500 F

/**
 * PRO (abonnement mensuel et annuel) est MASQUÉ pour le moment.
 *
 * On garde volontairement simple : le badge Fournisseur vérifié à l'année
 * (2 000 F) et la mise en avant payée au jour. Tout ce qui touche à PRO
 * disparaît de l'interface — le code et les tarifs restent en place, il suffit
 * de repasser ce drapeau à `true` pour tout rallumer d'un coup.
 */
export const PRO_AVAILABLE = false;

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
  const stillVerified =
    !!profile?.verified && (!profile.verified_until || new Date(profile.verified_until) > new Date());

  if (profile?.plan === "pro") return "pro";
  if (stillVerified) return profile?.plan === "pro_annuel" ? "pro_annuel" : "verifie";
  return "gratuit";
};

export const isVerifiedPlan = (p: PlanId | string) => p === "verifie" || p === "pro" || p === "pro_annuel";
