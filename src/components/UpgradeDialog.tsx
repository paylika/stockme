import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
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
import { formatFCFA } from "@/lib/format";
import { PLANS, VERIFICATION_BONUS_FCFA, type PlanId } from "@/lib/pricing";
import { METHOD_LABELS, goToCheckout, type PayMethod } from "@/lib/pay-client";
import { BadgeCheck, Check, CreditCard, Loader2, ShieldCheck, Smartphone, Sparkles } from "lucide-react";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  methods: string[];
  /** Offre suggérée à l'ouverture (par défaut PRO). */
  suggested?: PlanId;
  defaultPhone?: string | null;
  onDone?: () => void;
};

/**
 * Passage à une offre payante : le vendeur choisit son offre et son moyen de
 * paiement, puis part chez Stripe. Pour PRO, le prélèvement est MENSUEL et
 * AUTOMATIQUE (carte enregistrée) : plus aucune relance de notre côté.
 */
export function UpgradeDialog({ open, onOpenChange, methods, suggested = "pro", defaultPhone, onDone }: Props) {
  const [selected, setSelected] = useState<PlanId>(suggested);
  const [method, setMethod] = useState<PayMethod>("card");
  const [phone, setPhone] = useState(defaultPhone ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelected(suggested);
    setMethod(((methods[0] as PayMethod | undefined) ?? "card") as PayMethod);
    setBusy(false);
  }, [open, suggested, methods]);

  useEffect(() => {
    if (defaultPhone) setPhone(defaultPhone);
  }, [defaultPhone]);

  const plan = PLANS.find((p) => p.id === selected) ?? PLANS[2];
  const needsPhone = method === "wave" || method === "orange_money";
  const payByCard = method === "card" && !!plan.recurring;

  const pay = async () => {
    if (needsPhone && phone.replace(/\D/g, "").length < 8) {
      return toast.error("Indiquez le numéro lié à votre compte mobile money");
    }
    setBusy(true);
    try {
      await goToCheckout({
        purpose: "subscription",
        amount: plan.price,
        method,
        customerNumber: needsPhone ? phone : null,
        metadata: { days: plan.days, plan: plan.id, source: "upgrade" },
      });
      onDone?.();
    } catch (err) {
      setBusy(false);
      toast.error(err instanceof Error ? err.message : "Paiement impossible");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] w-[calc(100%-1.5rem)] max-w-lg overflow-y-auto rounded-2xl p-5">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-left">
            <Sparkles className="h-5 w-5 text-volt" /> Passer à une offre supérieure
          </DialogTitle>
          <DialogDescription className="text-left">
            Badge vérifié, produits illimités, 10 photos et tarif réduit sur les mises en avant.
          </DialogDescription>
        </DialogHeader>

        {/* Choix de l'offre */}
        <div className="space-y-2">
          {PLANS.filter((p) => p.id !== "gratuit").map((p) => {
            const active = selected === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelected(p.id)}
                className={`w-full rounded-2xl border p-3.5 text-left transition ${
                  active ? "border-volt bg-volt/10" : "border-border bg-background hover:bg-accent"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${
                        active ? "border-volt bg-volt text-volt-foreground" : "border-input"
                      }`}
                    >
                      {active && <Check className="h-3 w-3" />}
                    </span>
                    <span className="text-sm font-bold">{p.name}</span>
                    {p.badge && (
                      <span className="rounded-full bg-foreground px-2 py-0.5 text-[10px] font-semibold text-background">
                        {p.badge}
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold">
                      {formatFCFA(p.price)}
                      <span className="text-[11px] font-normal text-muted-foreground"> {p.period}</span>
                    </p>
                    {p.regularPrice && (
                      <p className="text-[11px] text-muted-foreground line-through">
                        {formatFCFA(p.regularPrice)} {p.period}
                      </p>
                    )}
                  </div>
                </div>

                {active && (
                  <ul className="mt-2.5 space-y-1 border-t border-volt/20 pt-2.5">
                    {p.features.slice(0, 5).map((f) => (
                      <li key={f} className="flex items-start gap-1.5 text-[11px] leading-snug">
                        <Check className="mt-0.5 h-3 w-3 shrink-0 text-success" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </button>
            );
          })}
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

        {/* Récapitulatif + arguments */}
        <div className="space-y-2 rounded-xl bg-muted/50 px-3 py-2.5 text-xs">
          <p className="flex items-center justify-between">
            <span className="text-muted-foreground">À payer aujourd'hui</span>
            <strong className="text-sm">{formatFCFA(plan.price)}</strong>
          </p>
          {payByCard && (
            <p className="text-muted-foreground">
              Puis <strong className="text-foreground">{formatFCFA(plan.price)}</strong> par mois, prélevés
              automatiquement. Résiliable à tout moment.
            </p>
          )}
          <p className="inline-flex items-start gap-1.5 text-muted-foreground">
            <BadgeCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <span>
              <strong className="text-foreground">{formatFCFA(VERIFICATION_BONUS_FCFA)} de mise en avant offerts</strong>{" "}
              immédiatement (72 h), utilisables dès l'activation.
            </span>
          </p>
          <p className="inline-flex items-start gap-1.5 text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
            <span>Satisfait ou remboursé : aucun contact reçu en 30 jours → remboursement intégral.</span>
          </p>
        </div>

        <Button variant="volt" className="h-12 w-full text-sm font-bold" disabled={busy || methods.length === 0} onClick={pay}>
          {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
          {busy ? "Ouverture du paiement…" : `Activer ${plan.name} — ${formatFCFA(plan.price)}`}
        </Button>

        <p className="text-center text-[11px] text-muted-foreground">
          Paiement sécurisé. Besoin d'aide ?{" "}
          <Link to="/tarifs" className="underline underline-offset-2">
            Voir le détail des offres
          </Link>
        </p>
      </DialogContent>
    </Dialog>
  );
}
