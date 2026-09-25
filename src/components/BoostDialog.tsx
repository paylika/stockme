import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/stockme-client";
import { formatFCFA } from "@/lib/format";
import { Rocket, Wallet } from "lucide-react";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  productName: string;
  balance: number;
  onTopUpRequested: () => void;
  onStarted: () => void;
};

const BUDGET_PRESETS = [500, 1000, 2000];
const DAY_PRESETS = [7, 14, 30];

/**
 * Booster un produit : le vendeur choisit son budget quotidien.
 * Le solde est débité automatiquement chaque jour, jusqu'à épuisement —
 * il n'y a donc rien d'autre à payer après la recharge.
 */
export function BoostDialog({
  open,
  onOpenChange,
  productId,
  productName,
  balance,
  onTopUpRequested,
  onStarted,
}: Props) {
  const [budget, setBudget] = useState(500);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setBusy(false);
    }
  }, [open]);

  const daysAffordable = budget > 0 ? Math.floor(balance / budget) : 0;
  const enough = balance >= budget;

  const start = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc("boost_start", {
      p_product_id: productId,
      p_daily_budget: budget,
    });
    setBusy(false);

    if (error) return toast.error(error.message);

    const res = data as { ok?: boolean; reason?: string; balance?: number } | null;
    if (res?.ok === false && res.reason === "insufficient_balance") {
      toast.error("Solde insuffisant — rechargez d'abord.");
      return;
    }

    toast.success(`Boost activé : ${formatFCFA(budget)} par jour. Solde restant : ${formatFCFA(res?.balance ?? 0)}`);
    onOpenChange(false);
    onStarted();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] w-[calc(100%-1.5rem)] max-w-md overflow-y-auto rounded-2xl p-5">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-left">
            <Rocket className="h-5 w-5 text-volt" /> Booster ce produit
          </DialogTitle>
          <DialogDescription className="text-left">
            <span className="line-clamp-1 font-medium text-foreground">{productName}</span>
            Votre produit est mis en avant en haut de l'accueil et dans le carrousel, tant qu'il reste du solde.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <p className="text-sm font-semibold">Budget par jour</p>
          <div className="grid grid-cols-3 gap-2">
            {BUDGET_PRESETS.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setBudget(v)}
                className={`h-11 rounded-xl border text-sm font-semibold transition ${
                  budget === v ? "border-volt bg-volt text-volt-foreground" : "border-border bg-background hover:bg-accent"
                }`}
              >
                {v.toLocaleString("fr-FR")}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Plus le budget est élevé, plus l'emplacement est prioritaire ({formatFCFA(budget)} → priorité{" "}
            {Math.max(0, Math.floor(budget / 500) - 1)}).
          </p>
        </div>

        <div className="rounded-xl border border-border bg-muted/40 p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <Wallet className="h-4 w-4" /> Solde disponible
            </span>
            <span className="font-semibold">{formatFCFA(balance)}</span>
          </div>
          <div className="mt-1.5 flex items-center justify-between">
            <span className="text-muted-foreground">Durée estimée</span>
            <span className="font-semibold">
              {daysAffordable > 0 ? `${daysAffordable} jour${daysAffordable > 1 ? "s" : ""}` : "—"}
            </span>
          </div>
        </div>

        {!enough ? (
          <div className="space-y-2">
            <p className="rounded-xl border border-volt/40 bg-volt/10 px-3 py-2 text-xs">
              Il vous manque {formatFCFA(budget - balance)}. Rechargez votre solde, puis revenez booster ce produit :
              le boost démarre immédiatement.
            </p>
            <Button
              variant="volt"
              className="h-11 w-full"
              onClick={() => {
                onOpenChange(false);
                onTopUpRequested();
              }}
            >
              Recharger mon solde
            </Button>
          </div>
        ) : (
          <Button variant="volt" className="h-12 w-full text-sm font-bold" disabled={busy} onClick={start}>
            {busy ? "Activation…" : `Booster pour ${formatFCFA(budget)} / jour`}
          </Button>
        )}

        <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
          Débité automatiquement chaque jour. Vous pouvez mettre en pause à tout moment : le solde restant vous
          appartient.
        </p>
      </DialogContent>
    </Dialog>
  );
}
