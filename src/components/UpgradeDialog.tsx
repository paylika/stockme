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
import { PAID_PLANS, PACK_TOTAL, VERIFICATION_BONUS_FCFA, type Plan, type PlanId } from "@/lib/pricing";
import { METHOD_LABELS, goToCheckout, type PayMethod } from "@/lib/pay-client";
import { BadgeCheck, Check, CreditCard, Loader2, ShieldCheck, Smartphone, Sparkles, Zap } from "lucide-react";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  methods: string[];
  /** Le vendeur est-il DÉJÀ fournisseur vérifié (achat ou admin) ? */
  isVerified: boolean;
  defaultPhone?: string | null;
  /** Offre présélectionnée à l'ouverture (selon le bouton cliqué). */
  defaultPlan?: PlanId;
};

/**
 * Montée en offre — logique définitive :
 *   • déjà vérifié → on ne propose QUE PRO (jamais d'acheter le badge deux fois) ;
 *   • non vérifié → ÉTAPE 1 le badge annuel, ÉTAPE 2 PRO, avec le pack
 *     « badge + PRO » à 7 500 F le premier mois (badge sécurisé 12 mois).
 */
export function UpgradeDialog({ open, onOpenChange, methods, isVerified, defaultPhone, defaultPlan }: Props) {
  const [selected, setSelected] = useState<PlanId>("pro");
  const [method, setMethod] = useState<PayMethod>("card");
  const [phone, setPhone] = useState(defaultPhone ?? "");
  const [busy, setBusy] = useState(false);
  const [pack, setPack] = useState(false);

  // Offres réellement proposables selon l'état du vendeur
  const options = (isVerified ? PAID_PLANS.filter((p) => p.id !== "verifie") : PAID_PLANS).filter(
    (p) => p.id !== "pro_annuel" || isVerified,
  );

  useEffect(() => {
    if (!open) return;
    // On ouvre sur l'offre correspondant au bouton cliqué (jamais le badge
    // pour un vendeur déjà vérifié).
    const wanted = defaultPlan && (defaultPlan !== "verifie" || !isVerified) ? defaultPlan : "pro";
    setSelected(wanted);
    setPack(false);
    setMethod(((methods[0] as PayMethod | undefined) ?? "card") as PayMethod);
    setBusy(false);
  }, [open, isVerified, methods, defaultPlan]);

  useEffect(() => {
    if (defaultPhone) setPhone(defaultPhone);
  }, [defaultPhone]);

  const plan: Plan = (pack ? PAID_PLANS.find((p) => p.id === "pro")! : options.find((p) => p.id === selected) ?? options[0])!;

  const amountToday = pack ? PACK_TOTAL : plan.price;
  const needsPhone = method === "wave" || method === "orange_money";
  const monthlyAfter = pack || plan.recurring === "month";

  const pay = async () => {
    if (needsPhone && phone.replace(/\D/g, "").length < 8) {
      return toast.error("Indiquez le numéro lié à votre compte mobile money");
    }
    setBusy(true);
    try {
      if (pack) {
        // ÉTAPE 1 : sécuriser le badge pour 12 mois (5 000 F, paiement unique).
        // L'étape 2 (PRO) est proposée automatiquement juste après le paiement.
        await goToCheckout({
          purpose: "subscription",
          amount: 5000,
          method,
          customerNumber: needsPhone ? phone : null,
          metadata: { days: 365, plan: "verifie", next_step: "pro", source: "pack" },
        });
        return;
      }

      await goToCheckout({
        purpose: "subscription",
        amount: plan.price,
        method,
        customerNumber: needsPhone ? phone : null,
        metadata: { days: plan.days, plan: plan.dbPlan, source: isVerified ? "upsell_pro" : "signup" },
      });
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
            <Sparkles className="h-5 w-5 text-volt" />
            {isVerified ? "Ajouter StockMe PRO" : "Faire vérifier ma boutique"}
          </DialogTitle>
          <DialogDescription className="text-left">
            {isVerified
              ? "Vous êtes déjà fournisseur vérifié — il ne vous manque que les avantages PRO."
              : "Le badge rassure les acheteurs et débloque 10 photos, les produits illimités et un tarif réduit sur les mises en avant."}
          </DialogDescription>
        </DialogHeader>

        {/* Rappel pour un compte déjà vérifié */}
        {isVerified && (
          <p className="flex items-center gap-2 rounded-xl border border-primary/25 bg-primary/5 px-3 py-2 text-xs">
            <BadgeCheck className="h-4 w-4 shrink-0 text-primary" />
            <span>
              Votre badge est <strong>déjà actif</strong> : il reste acquis, aucun achat de badge n'est nécessaire.
            </span>
          </p>
        )}

        {/* Choix des offres */}
        <div className="space-y-2">
          {options.map((p) => {
            const active = !pack && selected === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setPack(false);
                  setSelected(p.id);
                }}
                className={`w-full rounded-2xl border p-3.5 text-left transition ${
                  active ? "border-volt bg-volt/10" : "border-border bg-background hover:bg-accent"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${
                        active ? "border-volt bg-volt text-volt-foreground" : "border-input"
                      }`}
                    >
                      {active && <Check className="h-3 w-3" />}
                    </span>
                    <span className="truncate text-sm font-bold">{p.name}</span>
                    {p.badge && (
                      <span className="shrink-0 rounded-full bg-foreground px-2 py-0.5 text-[10px] font-semibold text-background">
                        {p.badge}
                      </span>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
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

        {/* Pack badge annuel + PRO (uniquement si pas encore vérifié) */}
        {!isVerified && (
          <button
            type="button"
            onClick={() => setPack(true)}
            className={`w-full rounded-2xl border p-3.5 text-left transition ${
              pack ? "border-volt bg-volt/10" : "border-dashed border-volt/50 bg-volt/5 hover:bg-volt/10"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${
                    pack ? "border-volt bg-volt text-volt-foreground" : "border-input"
                  }`}
                >
                  {pack && <Check className="h-3 w-3" />}
                </span>
                <span className="text-sm font-bold">
                  <Zap className="mr-1 inline h-3.5 w-3.5 text-volt" />
                  Pack : badge 1 an + PRO
                </span>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-bold">{formatFCFA(PACK_TOTAL)}</p>
                <p className="text-[11px] text-muted-foreground">puis 2 500 F/mois</p>
              </div>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              <strong className="text-foreground">Payez {formatFCFA(5000)} une fois</strong> pour sécuriser votre badge
              pendant 12 mois, puis activez PRO dans la foulée. Même si vous arrêtez PRO plus tard,{" "}
              <strong className="text-foreground">votre badge reste acquis toute l'année</strong>.
            </p>
          </button>
        )}

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

        {/* Récapitulatif */}
        <div className="space-y-2 rounded-xl bg-muted/50 px-3 py-2.5 text-xs">
          <p className="flex items-center justify-between">
            <span className="text-muted-foreground">À payer aujourd'hui</span>
            <strong className="text-sm">{formatFCFA(amountToday)}</strong>
          </p>
          {pack ? (
            <p className="text-muted-foreground">
              Étape 1 : badge sécurisé 12 mois. L'activation de <strong className="text-foreground">PRO (2 500 F/mois,
              prélevés automatiquement)</strong> vous sera proposée juste après le paiement.
            </p>
          ) : monthlyAfter ? (
            <p className="text-muted-foreground">
              Puis <strong className="text-foreground">{formatFCFA(plan.price)}</strong> par mois, prélevés
              automatiquement. Résiliable à tout moment — le badge reste actif tant que l'abonnement court.
            </p>
          ) : (
            <p className="text-muted-foreground">
              Paiement unique : votre badge est acquis pour {plan.days} jours, même si vous ne renouvelez pas.
            </p>
          )}
          <p className="inline-flex items-start gap-1.5 text-muted-foreground">
            <BadgeCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <span>
              <strong className="text-foreground">{formatFCFA(VERIFICATION_BONUS_FCFA)} de mise en avant offerts</strong>{" "}
              immédiatement (72 h).
            </span>
          </p>
          <p className="inline-flex items-start gap-1.5 text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
            <span>Satisfait ou remboursé : aucun contact reçu en 30 jours → remboursement intégral.</span>
          </p>
        </div>

        <Button variant="volt" className="h-12 w-full text-sm font-bold" disabled={busy || methods.length === 0} onClick={pay}>
          {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
          {busy
            ? "Ouverture du paiement…"
            : pack
            ? `Sécuriser mon badge — ${formatFCFA(5000)}`
            : `Activer ${plan.name} — ${formatFCFA(plan.price)}`}
        </Button>

        <p className="text-center text-[11px] text-muted-foreground">
          Paiement sécurisé.{" "}
          <Link to="/tarifs" className="underline underline-offset-2">
            Voir le détail des offres
          </Link>
        </p>
      </DialogContent>
    </Dialog>
  );
}
