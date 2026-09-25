import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Rocket } from "lucide-react";
import { supabase } from "@/integrations/supabase/stockme-client";
import { useWallet } from "@/hooks/useWallet";
import { useAuth } from "@/hooks/useAuth";
import { usePaymentsStatus } from "@/lib/features";
import { isAdminEmail } from "@/lib/constants";
import { WalletCard } from "@/components/WalletCard";
import { TopUpDialog } from "@/components/TopUpDialog";
import { BoostDialog } from "@/components/BoostDialog";
import { toast } from "sonner";

type BoostTarget = { id: string; name: string };

/* ------------------------------------------------------------------ *
 * Petit magasin réactif : permet à n'importe quelle carte produit
 * d'afficher un bouton « Booster » SANS refonte de la page, et seulement
 * quand le paiement est réellement actif.
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

/** true si le bouton « Booster » doit être affiché. */
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

type Ctx = {
  balance: number;
  openTopUp: () => void;
  openBoost: (product: BoostTarget) => void;
  refresh: () => void;
};

const SellerMoneyContext = createContext<Ctx | null>(null);

/** À utiliser depuis n'importe quelle carte produit de l'espace vendeur. */
export function useSellerMoney() {
  return useContext(SellerMoneyContext);
}

/**
 * Regroupe tout l'argent du vendeur : solde, rechargement, boosts.
 *
 * VISIBILITÉ : l'ensemble reste invisible tant que le paiement n'est pas
 * réellement configuré (`usePaymentsStatus`). Pendant la phase de test,
 * l'administrateur peut tout voir (aperçu) ; les vendeurs ne voient rien.
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
  const [busyId, setBusyId] = useState<string | null>(null);

  // Aperçu admin : permet de tester de bout en bout avant l'ouverture au public.
  const visible = payments.enabled || (isAdminEmail(user?.email) && payments.methods.length > 0);

  // On publie (ou retire) le bouton « Booster » selon la visibilité réelle.
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

  const toggleBoost = useCallback(
    async (campaignId: string, next: "active" | "paused") => {
      setBusyId(campaignId);
      const { data, error } = await supabase.rpc("boost_set_status", { p_campaign_id: campaignId, p_status: next });
      setBusyId(null);
      if (error) return toast.error(error.message);
      const res = data as { ok?: boolean; reason?: string } | null;
      if (res?.ok === false && res.reason === "insufficient_balance") {
        return toast.error("Solde insuffisant pour reprendre ce boost.");
      }
      toast.success(next === "active" ? "Boost repris" : "Boost mis en pause");
      refresh();
      onChanged?.();
    },
    [refresh, onChanged],
  );

  const value = useMemo<Ctx>(
    () => ({ balance: wallet?.balance_fcfa ?? 0, openTopUp, openBoost: setBoost, refresh }),
    [wallet?.balance_fcfa, openTopUp, refresh],
  );

  if (!visible) return <>{children}</>;

  return (
    <SellerMoneyContext.Provider value={value}>
      {children}

      <WalletCard
        wallet={wallet}
        loading={loading}
        busyId={busyId}
        onRecharge={openTopUp}
        onToggleBoost={toggleBoost}
      />

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
