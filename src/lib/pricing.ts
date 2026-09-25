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
  boostPerDay: 700,
  tagline: "Pour tester et vendre tranquillement",
  features: [
    "10 produits publiés",
    "2 photos par produit",
    "Statistiques de base (vues, contacts, favoris)",
    "Mise en avant à 700 F/jour",
  ],
  missing: ["Fournisseur vérifié", "10 photos par produit", "Tarif réduit sur les mises en avant"],
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
    badge: "L'étape 1",
    features: [
      "Fournisseur vérifié sur toutes vos annonces",
      "Produits illimités",
      "10 photos par produit",
      "Mise en avant à 500 F/jour au lieu de 700",
      "72 h de mise en avant offertes (1 500 F crédités)",
      "Priorité dans la recherche",
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

/** Prix d'une journée de mise en avant selon l'offre. */
export const BOOST_DAILY_PRICE: Record<PlanId, number> = {
  gratuit: 700,
  verifie: 500,
  pro: 400,
  pro_annuel: 400,
};

/** Durée du bonus offert à la vérification (jours de mise en avant). */
export const VERIFICATION_BONUS_DAYS = 3;
/** Montant du crédit offert, en FCFA. */
export const VERIFICATION_BONUS_FCFA = 1500;

/** Pack « badge annuel + PRO » : total payé le premier mois. */
export const PACK_TOTAL = 2000 + 2500; // 4 500 F

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
