/**
 * Grille tarifaire StockMe — source unique de vérité.
 *
 * Changer un prix ici met à jour toute l'application (page d'offres, profil,
 * messages, paiement). Les limites correspondantes sont appliquées en base
 * (trigger `products_guard_limits` pour les photos et le nombre de produits).
 *
 * STRATÉGIE DE CONVERSION retenue :
 *   • le boost est ouvert à TOUT LE MONDE (achat d'impulsion à 500-700 F) :
 *     le bloquer aux vérifiés ferait perdre 97 % des acheteurs potentiels ;
 *   • la vérification est RÉCOMPENSÉE par un meilleur prix et 72 h offertes,
 *     donc elle se rentabilise d'elle-même ;
 *   • PRO est lancé à un tarif d'appel (2 500 F) avec une raison crédible de
 *     monter plus tard (3 500 F) : l'urgence fait décider maintenant.
 */

export type PlanId = "gratuit" | "verifie" | "pro";

export type Plan = {
  id: PlanId;
  name: string;
  /** Prix payé aujourd'hui, en FCFA. */
  price: number;
  /** Prix « normal », affiché barré quand il y a un tarif de lancement. */
  regularPrice?: number;
  period: string;
  /** Détail du prélèvement (abonnement). */
  billingNote?: string;
  /** Équivalent mensuel, pour comparer honnêtement. */
  monthlyEquivalent?: number;
  tagline: string;
  /** Durée ajoutée au badge à chaque paiement (jours). */
  days: number;
  /** Abonnement mensuel automatique (carte enregistrée) ? */
  recurring: "month" | null;
  features: string[];
  missing?: string[];
  highlight?: boolean;
  badge?: string;
  /** Prix de la mise en avant par jour pour cette offre. */
  boostPerDay: number;
};

export const PLANS: Plan[] = [
  {
    id: "gratuit",
    name: "Gratuit",
    price: 0,
    period: "pour toujours",
    days: 0,
    recurring: null,
    boostPerDay: 700,
    tagline: "Pour tester et vendre tranquillement",
    features: [
      "10 produits publiés",
      "2 photos par produit",
      "Statistiques de base (vues, contacts, favoris)",
      "Mise en avant à 700 F/jour",
    ],
    missing: ["Badge vérifié", "10 photos par produit", "Tarif réduit sur les mises en avant"],
  },
  {
    id: "verifie",
    name: "Fournisseur vérifié",
    price: 5000,
    period: "par an",
    monthlyEquivalent: 417,
    days: 365,
    recurring: null,
    boostPerDay: 500,
    tagline: "La confiance qui fait écrire les acheteurs",
    badge: "Le plus choisi",
    features: [
      "Badge « Fournisseur vérifié » sur toutes vos cartes produit",
      "Produits illimités",
      "10 photos par produit",
      "Mise en avant à 500 F/jour au lieu de 700",
      "72 h de mise en avant offertes (1 500 F crédités)",
      "Priorité dans le classement de la recherche",
      "Assistance prioritaire sur WhatsApp",
    ],
    highlight: true,
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
    boostPerDay: 400,
    tagline: "Pour dominer votre catégorie",
    badge: "Tarif de lancement",
    features: [
      "Tout ce que contient l'offre Vérifiée",
      "Mise en avant à 400 F/jour (le meilleur tarif)",
      "72 h de mise en avant offertes chaque mois",
      "Statistiques avancées : pays des acheteurs, taux de contact, valeur du stock",
      "Prélèvement automatique, résiliable à tout moment",
      "Assistance prioritaire + accompagnement personnalisé",
    ],
  },
];

/** Prix d'une journée de mise en avant selon l'offre (raccourci). */
export const BOOST_DAILY_PRICE: Record<PlanId, number> = {
  gratuit: 700,
  verifie: 500,
  pro: 400,
};

/** Durée du bonus offert à la vérification (jours de mise en avant). */
export const VERIFICATION_BONUS_DAYS = 3;
/** Montant du crédit offert, en FCFA (3 jours à 500 F). */
export const VERIFICATION_BONUS_FCFA = 1500;

/** Garantie affichée sur la page d'offres (levier de conversion). */
export const SATISFACTION_GUARANTEE =
  "Satisfait ou remboursé : si vous ne recevez aucun contact en 30 jours, nous vous remboursons intégralement.";

/**
 * Faut-il être vérifié pour acheter une mise en avant ?
 * Recommandation : NON (voir la note stratégique en tête de fichier).
 * Passez à `true` pour réserver le boost aux comptes vérifiés.
 */
export const BOOST_REQUIRES_VERIFICATION = false;

/** Offre d'un vendeur, déduite de son profil. */
export const planOf = (profile: { plan?: string | null } | null | undefined): PlanId => {
  const p = profile?.plan;
  return p === "pro" || p === "verifie" ? p : "gratuit";
};

export const planById = (id: PlanId): Plan => PLANS.find((p) => p.id === id) ?? PLANS[0];

export const formatPlanPrice = (n: number) =>
  n === 0 ? "Gratuit" : `${n.toLocaleString("fr-FR")} FCFA`;
