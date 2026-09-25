/**
 * Grille tarifaire StockMe — source unique de vérité.
 *
 * Changer un prix ici met à jour toute l'application (profil, messages,
 * interfaces). Les limites correspondantes sont appliquées côté base
 * (trigger `products_guard_limits` pour les photos et le nombre de produits).
 */

export type PlanId = "gratuit" | "verifie" | "pro";

export type Plan = {
  id: PlanId;
  name: string;
  /** Prix affiché, en FCFA. */
  price: number;
  /** Libellé de la périodicité. */
  period: string;
  /** Équivalent mensuel, pour comparer honnêtement les offres. */
  monthlyEquivalent?: number;
  tagline: string;
  features: string[];
  /** Non inclus, affiché en gris pour la transparence. */
  missing?: string[];
  highlight?: boolean;
};

export const PLANS: Plan[] = [
  {
    id: "gratuit",
    name: "Gratuit",
    price: 0,
    period: "pour toujours",
    tagline: "Pour tester et vendre tranquillement",
    features: [
      "10 produits publiés",
      "2 photos par produit",
      "Statistiques de base (vues, contacts, favoris)",
      "Contact WhatsApp direct",
    ],
    missing: ["Badge vérifié", "Mise en avant (boost)", "Statistiques avancées"],
  },
  {
    id: "verifie",
    name: "Fournisseur vérifié",
    price: 5000,
    period: "par an",
    monthlyEquivalent: 417,
    tagline: "La confiance qui fait écrire les acheteurs",
    features: [
      "Badge « Fournisseur vérifié » sur toutes vos cartes",
      "Produits illimités",
      "10 photos par produit",
      "Priorité dans le classement",
      "72 h de mise en avant offertes (1 500 F de crédit)",
      "Assistance prioritaire WhatsApp",
    ],
    highlight: true,
  },
  {
    id: "pro",
    name: "StockMe PRO",
    price: 3500,
    period: "par mois",
    monthlyEquivalent: 3500,
    tagline: "Pour les vendeurs qui veulent dominer leur catégorie",
    features: [
      "Tout le plan Vérifié",
      "Statistiques avancées (pays des acheteurs, taux de contact, valeur du stock)",
      "Mise en avant quotidienne à tarif réduit",
      "72 h de boost offertes chaque mois",
      "Assistance prioritaire + accompagnement",
    ],
  },
];

/** Prix d'une journée de mise en avant, selon l'offre du vendeur. */
export const BOOST_DAILY_PRICE = {
  gratuit: 700,
  verifie: 500,
  pro: 400,
} as const;

/** Durée du bonus offert à la vérification (en jours de mise en avant). */
export const VERIFICATION_BONUS_DAYS = 3;
/** Montant du crédit offert à la vérification, en FCFA (3 jours à 500 F). */
export const VERIFICATION_BONUS_FCFA = 1500;

/**
 * Faut-il être vérifié pour pouvoir acheter une mise en avant ?
 *
 * Recommandation : NON. La mise en avant est un achat d'impulsion ; exiger
 * d'abord un abonnement divise le nombre d'acheteurs par ~40 tant que peu de
 * vendeurs sont vérifiés. On préfère récompenser la vérification par un
 * MEILLEUR PRIX (500 F/jour contre 700 F) : le badge se rentabilise en 2 jours
 * de boost, ce qui le vend tout seul.
 *
 * Passez cette valeur à `true` pour réserver le boost aux comptes vérifiés.
 */
export const BOOST_REQUIRES_VERIFICATION = false;
