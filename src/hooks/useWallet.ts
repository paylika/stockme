import { useSellerDashboard } from "@/hooks/useSellerDashboard";

export type WalletTx = {
  amount_fcfa: number;
  kind: string;
  label: string | null;
  created_at: string;
};

export type BoostRow = {
  id: string;
  product_id: string;
  product_name: string | null;
  images: string[] | null;
  status: string;
  daily_budget_fcfa: number;
  days_served: number;
  total_spent_fcfa: number;
  created_at: string;
  last_run_at: string | null;
  impressions: number;
  clicks: number;
  /** Vues de la fiche produit depuis le début de la mise en avant. */
  product_views: number;
  /** Contacts (WhatsApp / téléphone) générés depuis le début de la mise en avant. */
  product_contacts: number;
};

export type PendingPayment = {
  id: string;
  purpose: string;
  amount_fcfa: number;
  provider: string;
  method: string | null;
  checkout_url: string | null;
  created_at: string;
};

export type WalletData = {
  balance_fcfa: number;
  transactions: WalletTx[];
  boosts: BoostRow[];
  pending: PendingPayment[];
};

/**
 * Solde, mouvements et campagnes de boost du vendeur.
 *
 * Depuis la refonte « vitesse », le portefeuille arrive DANS le paquet unique
 * de l'espace vendeur (`seller_dashboard`) : plus aucun appel supplémentaire,
 * et le solde est toujours cohérent avec le profil et les statistiques.
 * `refresh()` recharge ce paquet entier.
 */
export function useWallet(enabled = true) {
  const { data, loading, refresh } = useSellerDashboard(enabled);

  return {
    wallet: enabled ? (data?.wallet ?? null) : null,
    loading: enabled ? loading : false,
    refresh,
  };
}
