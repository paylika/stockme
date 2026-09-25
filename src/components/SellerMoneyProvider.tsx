import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Rocket } from "lucide-react";
import { supabase } from "@/integrations/supabase/stockme-client";
import { useWallet, type WalletData } from "@/hooks/useWallet";
import { useAuth } from "@/hooks/useAuth";
import { usePaymentsStatus } from "@/lib/features";
import { isAdminEmail } from "@/lib/constants";
import { TopUpDialog } from "@/components/TopUpDialog";
import { BoostDialog } from "@/components/BoostDialog";
import { toast } from "sonner";

type BoostTarget = { id: string; name: string };

/* ------------------------------------------------------------------ *
 * Magasin réactif : permet à n'importe quelle carte produit d'afficher
 * un bouton « Booster » sans refonte de la page, et seulement quand le
 * paiement est réellement actif.
 * ------------------------------------------------------------------ */
let boostHandler: ((p: BoostTarget) => void) | null = null;
let boostActive = false;
const boostListeners = new Set<() => void>();

const notify = () => boostListeners.forEach((l) => l());

export const subscribeBoost = (cb: () => void) => {
  boostListeners.add(cb);
  return () => {
    boostListeners.delete(cb);
  };
};

export const boostAvailable = () => boostActive;

/** Bouton « Booster » à poser sur les cartes produit de l'espace vendeur. */
export function BoostButton({ productId, productName }: { productId: string; productName: string }) {
  const [available, setAvailable] = useState(boostActive);

  useEffect(() => subscribeBoost(() => setAvailable(boostActive)), []);

  if (!available) return null;

  return (
    <button
      type="button"
      onClick={() => boostHandler?.({ id: productId, name: productName })}
      className="inline-flex items-center gap-1.5 rounded-lg border border-volt/50 bg-volt/10 px-2.5 py-1.5 text-xs font-semibold text-foreground transition hover:bg-volt/20"
    >
      <Rocket className="h-3.5 w-3.5 text-volt" /> Booster
    </button>
  );
}

export type SellerMoneyCtx = {
  wallet: WalletData | null;
  loading: boolean;
  balance: number;
  refresh: () => void;
  openTopUp: () => void;
  openBoost: (product: BoostTarget) => void;
};

const SellerMoneyContext = createContext<SellerMoneyCtx | null>(null);

export function useSellerMoney() {
  return useContext(SellerMoneyContext);
}

/**
 * Regroupe tout l'argent du vendeur : solde, rechargement, boosts.
 *
 * Ce composant ne dessine QUE les fenêtres de dialogue : la carte « Mon solde »
 * est placée par la page (par exemple dans son onglet « Sponsorisation ») à
 * partir des données exposées ici.
 *
 * VISIBILITÉ : invisible tant que le paiement n'est pas réellement configuré.
 * Pendant la phase de test, seul l'administrateur voit l'ensemble.
 */
export function SellerMoneyProvider({
  children,
  defaultPhone,
  onChanged,
}: {
  children: ReactNode;
  defaultPhone?: string | null;
  onChanged?: () => void;
}) {
  const { user } = useAuth();
  const payments = usePaymentsStatus();
  const { wallet, loading, refresh } = useWallet();

  const [topUpOpen, setTopUpOpen] = useState(false);
  const [boost, setBoost] = useState<BoostTarget | null>(null);

  const visible = payments.enabled || (isAdminEmail(user?.email) && payments.methods.length > 0);

  useEffect(() => {
    boostActive = visible;
    boostHandler = visible ? setBoost : null;
    notify();
    return () => {
      boostActive = false;
      boostHandler = null;
      notify();
    };
  }, [visible]);

  const openTopUp = useCallback(() => setTopUpOpen(true), []);

  const value = useMemo<SellerMoneyCtx>(
    () => ({
      wallet,
      loading,
      balance: wallet?.balance_fcfa ?? 0,
      refresh,
      openTopUp,
      openBoost: setBoost,
    }),
    [wallet, loading, refresh, openTopUp],
  );

  if (!visible) return <>{children}</>;

  return (
    <SellerMoneyContext.Provider value={value}>
      {children}

      <TopUpDialog
        open={topUpOpen}
        onOpenChange={setTopUpOpen}
        methods={payments.methods}
        defaultPhone={defaultPhone}
      />

      {boost && (
        <BoostDialog
          open={!!boost}
          onOpenChange={(o) => !o && setBoost(null)}
          productId={boost.id}
          productName={boost.name}
          balance={wallet?.balance_fcfa ?? 0}
          onTopUpRequested={openTopUp}
          onStarted={() => {
            refresh();
            onChanged?.();
          }}
        />
      )}
    </SellerMoneyContext.Provider>
  );
}

/** Pause / reprise d'une campagne (utilisé par la carte « Mon solde »). */
export async function toggleBoostStatus(campaignId: string, next: "active" | "paused"): Promise<boolean> {
  const { data, error } = await supabase.rpc("boost_set_status", { p_campaign_id: campaignId, p_status: next });
  if (error) {
    toast.error(error.message);
    return false;
  }
  const res = data as { ok?: boolean; reason?: string } | null;
  if (res?.ok === false && res.reason === "insufficient_balance") {
    toast.error("Solde insuffisant pour reprendre ce boost.");
    return false;
  }
  toast.success(next === "active" ? "Boost repris" : "Boost mis en pause");
  return true;
}
