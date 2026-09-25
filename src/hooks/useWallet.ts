import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/stockme-client";

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
 * Ne s'exécute que si le vendeur est connecté ; renvoie null en cas d'échec
 * (l'interface masque alors simplement la carte).
 */
export function useWallet(enabled = true) {
  const [data, setData] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setData(null);
      setLoading(false);
      return;
    }
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session?.user) {
      setData(null);
      setLoading(false);
      return;
    }
    const { data: overview, error } = await supabase.rpc("wallet_overview");
    setData(error ? null : ((overview as WalletData | null) ?? null));
    setLoading(false);
  }, [enabled]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { wallet: data, loading, refresh };
}
