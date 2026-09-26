import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/stockme-client";
import { formatFCFA } from "@/lib/format";
import { METHOD_LABELS, goToCheckout, type PayMethod } from "@/lib/pay-client";
import { CreditCard, Loader2, Smartphone, Wallet } from "lucide-react";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  methods: string[];
  defaultPhone?: string | null;
  /** Montant pré-rempli (reprise d'un paiement en attente). */
  initialAmount?: number | null;
};

const PRESETS = [1000, 2000, 5000, 10000];

/**
 * Rechargement du portefeuille : le vendeur choisit un montant et un moyen de
 * paiement, puis part chez le fournisseur (carte Stripe ou mobile money).
 * Le solde est crédité automatiquement dès la confirmation.
 *
 * On annule d'abord les demandes de paiement abandonnées (plus de 5 minutes)
 * pour ne jamais empiler les paiements en attente.
 */
export function TopUpDialog({ open, onOpenChange, methods, defaultPhone, initialAmount }: Props) {
  const [amount, setAmount] = useState<number>(2000);
  const [customAmount, setCustomAmount] = useState("");
  const [method, setMethod] = useState<PayMethod>("card");
  const [phone, setPhone] = useState(defaultPhone ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const first = (methods[0] as PayMethod | undefined) ?? "card";
    setMethod(first);
    setBusy(false);
    // Reprise d'un paiement en attente : on repart de son montant.
    if (initialAmount && initialAmount >= 100) {
      if (PRESETS.includes(initialAmount)) {
        setAmount(initialAmount);
        setCustomAmount("");
      } else {
        setCustomAmount(String(initialAmount));
      }
    }
  }, [open, methods, initialAmount]);

  useEffect(() => {
    if (defaultPhone) setPhone(defaultPhone);
  }, [defaultPhone]);

  const finalAmount = customAmount ? Number(customAmount) : amount;
  const needsPhone = method === "wave" || method === "orange_money";

  const pay = async () => {
    if (!finalAmount || finalAmount < 100) return toast.error("Montant minimum : 100 FCFA");
    if (needsPhone && phone.replace(/\D/g, "").length < 8) {
      return toast.error("Indiquez le numéro lié à votre compte mobile money");
    }
    setBusy(true);
    try {
      // On nettoie les demandes abandonnées (jamais celles de moins de 5 min,
      // le vendeur est peut-être en train de valider sur son téléphone).
      await supabase.rpc("payment_cancel_pending", { p_purpose: "wallet_topup", p_min_age_seconds: 300 });

      await goToCheckout({
        purpose: "wallet_topup",
        amount: finalAmount,
        method,
        customerNumber: needsPhone ? phone : null,
        metadata: { source: "profile" },
      });
    } catch (err) {
      setBusy(false);
      toast.error(err instanceof Error ? err.message : "Paiement impossible");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] w-[calc(100%-1.5rem)] max-w-md overflow-y-auto rounded-2xl p-5">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-left">
            <Wallet className="h-5 w-5 text-volt" /> Recharger mon solde
          </DialogTitle>
          <DialogDescription className="text-left">
            Votre solde finance vos mises en avant, jour après jour, et vos publications supplémentaires (500 F au-delà
            de 20 produits). Pas d'abonnement, pas d'engagement.
          </DialogDescription>
        </DialogHeader>

        {/* Montant */}
        <div className="space-y-2">
          <Label>Montant à recharger</Label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {PRESETS.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => {
                  setAmount(v);
                  setCustomAmount("");
                }}
                className={`h-11 rounded-xl border text-sm font-semibold transition ${
                  !customAmount && amount === v
                    ? "border-volt bg-volt text-volt-foreground"
                    : "border-border bg-background hover:bg-accent"
                }`}
              >
                {v.toLocaleString("fr-FR")}
              </button>
            ))}
          </div>
          <Input
            type="number"
            inputMode="numeric"
            min={100}
            placeholder="Autre montant (FCFA)"
            value={customAmount}
            onChange={(e) => setCustomAmount(e.target.value)}
          />
        </div>

        {/* Moyen de paiement */}
        <div className="space-y-2">
          <Label>Moyen de paiement</Label>
          {methods.length === 0 ? (
            <p className="rounded-xl border border-volt/40 bg-volt/10 px-3 py-2 text-xs">
              Aucun moyen de paiement n'est encore activé. Réessayez plus tard.
            </p>
          ) : (
            <div className="space-y-2">
              {methods.map((m) => {
                const value = m as PayMethod;
                const Icon = value === "card" ? CreditCard : Smartphone;
                const active = method === value;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMethod(value)}
                    className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition ${
                      active ? "border-volt bg-volt/10" : "border-border bg-background hover:bg-accent"
                    }`}
                  >
                    <Icon className={`h-5 w-5 shrink-0 ${active ? "text-volt" : "text-muted-foreground"}`} />
                    <span className="text-sm font-semibold">{METHOD_LABELS[value] ?? m}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {needsPhone && (
          <div className="space-y-1.5">
            <Label>Numéro {METHOD_LABELS[method]}</Label>
            <Input
              type="tel"
              inputMode="tel"
              placeholder="+221..."
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
        )}

        <div className="rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          Vous allez payer <strong className="text-foreground">{formatFCFA(finalAmount || 0)}</strong>. Le solde est
          crédité automatiquement dès la confirmation du paiement.
        </div>

        <Button
          variant="volt"
          className="h-12 w-full text-sm font-bold"
          disabled={busy || methods.length === 0}
          onClick={pay}
        >
          {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
          {busy ? "Ouverture du paiement…" : `Payer ${formatFCFA(finalAmount || 0)}`}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
