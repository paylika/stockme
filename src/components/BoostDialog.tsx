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
import { supabase } from "@/integrations/supabase/stockme-client";
import { formatFCFA } from "@/lib/format";
import {
  BOOST_DAY_PRICE,
  BOOST_MAX_DAYS,
  BOOST_MIN_DAYS,
  BOOST_PACKS,
  boostDaysFor,
  boostPriceFor,
} from "@/lib/pricing";
import { saveBoostIntent } from "@/lib/boost-intent";
import { CalendarDays, CheckCircle2, Pause, Rocket, Wallet } from "lucide-react";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  productName: string;
  balance: number;
  /** Mise en avant déjà existante sur ce produit (elle ne se double pas). */
  existing?: { status: "active" | "paused"; daysServed: number; totalSpent: number } | null;
  /** Ouvre le paiement : montant, et formules à afficher dans la fenêtre. */
  onTopUpRequested: (amount?: number, presets?: number[]) => void;
  onStarted: () => void;
  /** Durée déjà choisie ailleurs (retour de paiement) : on la reprend. */
  initialDays?: number;
};

/**
 * Mettre un produit en avant.
 *
 * UN SEUL CHOIX : la durée. Le prix est le même pour tout le monde
 * (1 000 F par jour), donc 7 jours = 7 000 F, 15 jours = 15 000 F,
 * 30 jours = 30 000 F — ou n'importe quelle durée au même tarif.
 *
 * Le solde peut déjà couvrir la durée (on démarre) ou non (on paie exactement
 * ce qu'il faut, et le choix est mémorisé pour le retour du paiement).
 */
export function BoostDialog({
  open,
  onOpenChange,
  productId,
  productName,
  balance,
  existing = null,
  onTopUpRequested,
  onStarted,
  initialDays,
}: Props) {
  const [days, setDays] = useState(7);
  const [customDays, setCustomDays] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setBusy(false);
    const start = initialDays && initialDays >= BOOST_MIN_DAYS ? initialDays : 7;
    if (BOOST_PACKS.some((p) => p.days === start)) {
      setDays(start);
      setCustomDays("");
    } else {
      setDays(7);
      setCustomDays(String(start));
    }
  }, [open, productId, initialDays]);

  const wanted = customDays ? Math.floor(Number(customDays)) : days;
  const validDays = Number.isFinite(wanted) && wanted >= BOOST_MIN_DAYS ? Math.min(wanted, BOOST_MAX_DAYS) : 0;
  const needed = boostPriceFor(validDays);
  const missing = Math.max(0, needed - balance);
  const canStart = balance >= BOOST_DAY_PRICE;
  const covers = validDays > 0 && balance >= needed;
  const daysWithBalance = boostDaysFor(balance);
  const alreadyRunning = existing?.status === "active";

  const selectDays = (v: number) => {
    setDays(v);
    setCustomDays("");
  };

  const start = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc("boost_start", {
      p_product_id: productId,
      p_daily_budget: BOOST_DAY_PRICE,
    });
    setBusy(false);

    if (error) return toast.error(error.message);

    const res = data as { ok?: boolean; reason?: string; balance?: number } | null;
    if (res?.ok === false && res.reason === "insufficient_balance") {
      toast.error(`Il faut au moins ${formatFCFA(BOOST_DAY_PRICE)} de solde pour démarrer.`);
      return;
    }

    toast.success(
      `Mise en avant activée : ${formatFCFA(BOOST_DAY_PRICE)} par jour${
        daysWithBalance > 1 ? ` · environ ${daysWithBalance} jours` : ""
      }.`,
      { duration: 6000 },
    );
    onOpenChange(false);
    onStarted();
  };

  /** Paiement : on mémorise le choix pour le retrouver au retour du paiement. */
  const recharge = (amount: number) => {
    saveBoostIntent({ productId, productName, days: validDays });
    onOpenChange(false);
    onTopUpRequested(amount, BOOST_PACKS.map((p) => boostPriceFor(p.days)));
  };

  // Formules + durée libre (même tarif, aucune remise cachée).
  const dayPicker = (
    <>
      <div className="space-y-2">
        <p className="text-sm font-semibold">Pendant combien de temps ?</p>
        <div className="grid grid-cols-3 gap-2">
          {BOOST_PACKS.map((p) => {
            const active = !customDays && days === p.days;
            return (
              <button
                key={p.days}
                type="button"
                onClick={() => selectDays(p.days)}
                className={`relative rounded-xl border px-2 py-2.5 text-center transition ${
                  active ? "border-volt bg-volt text-volt-foreground" : "border-border bg-background hover:bg-accent"
                }`}
              >
                <span className="block text-base font-bold leading-tight">{p.days} j</span>
                <span className={`block text-[11px] font-semibold ${active ? "opacity-90" : "text-foreground"}`}>
                  {formatFCFA(boostPriceFor(p.days))}
                </span>
                <span className={`block text-[10px] ${active ? "opacity-80" : "text-muted-foreground"}`}>
                  {p.label}
                </span>
              </button>
            );
          })}
        </div>
        <Input
          type="number"
          inputMode="numeric"
          min={BOOST_MIN_DAYS}
          max={BOOST_MAX_DAYS}
          placeholder={`Autre durée : nombre de jours (${formatFCFA(BOOST_DAY_PRICE)}/jour)`}
          value={customDays}
          onChange={(e) => setCustomDays(e.target.value)}
        />
      </div>

      <div className="rounded-xl border border-border bg-muted/40 p-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <CalendarDays className="h-4 w-4" /> {validDays > 0 ? `${validDays} jour${validDays > 1 ? "s" : ""}` : "Durée"}
          </span>
          <span className="font-semibold">{formatFCFA(needed)}</span>
        </div>
        <div className="mt-1.5 flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <Wallet className="h-4 w-4" /> Votre solde
          </span>
          <span className={`font-semibold ${missing > 0 ? "text-destructive" : "text-success"}`}>
            {formatFCFA(balance)}
          </span>
        </div>
        <p className={`mt-2 border-t border-border pt-2 text-xs font-semibold ${missing > 0 ? "text-destructive" : "text-success"}`}>
          {missing > 0
            ? `Il manque ${formatFCFA(missing)} pour ${validDays} jour${validDays > 1 ? "s" : ""}.`
            : "Votre solde couvre la durée choisie : démarrage immédiat."}
        </p>
      </div>
    </>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] w-[calc(100%-1.5rem)] max-w-md overflow-y-auto rounded-2xl p-5">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-left">
            <Rocket className="h-5 w-5 text-volt" /> {alreadyRunning ? "Prolonger la mise en avant" : "Mettre en avant"}
          </DialogTitle>
          <DialogDescription className="text-left">
            <span className="line-clamp-1 font-medium text-foreground">{productName}</span>
            {formatFCFA(BOOST_DAY_PRICE)} par jour · en haut de l'accueil et dans le carrousel.
          </DialogDescription>
        </DialogHeader>

        {/* Mise en avant déjà en cours */}
        {existing ? (
          <div className="flex items-start gap-2.5 rounded-xl border border-volt/40 bg-volt/10 px-3 py-2.5 text-xs">
            {alreadyRunning ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            ) : (
              <Pause className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <span className="leading-relaxed">
              <strong className="text-foreground">
                {alreadyRunning ? "Mise en avant en cours" : "Mise en avant en pause"}
              </strong>{" "}
              · {existing.daysServed} jour{existing.daysServed > 1 ? "s" : ""} payé
              {existing.daysServed > 1 ? "s" : ""} · {formatFCFA(existing.totalSpent)} dépensés.
              {alreadyRunning
                ? ` Il vous reste environ ${daysWithBalance} jour${daysWithBalance > 1 ? "s" : ""} : choisissez la durée à ajouter.`
                : " Choisissez la durée pour la relancer."}
            </span>
          </div>
        ) : null}

        {dayPicker}

        {/* UNE décision : démarrer, ou payer ce qu'il manque. */}
        <div className="space-y-2">
          {alreadyRunning ? (
            <Button
              variant="volt"
              className="h-12 w-full text-sm font-bold"
              disabled={validDays < 1}
              onClick={() => recharge(needed)}
            >
              <Wallet className="mr-1.5 h-4 w-4" /> Payer {formatFCFA(needed)} — {validDays} jour
              {validDays > 1 ? "s" : ""} de plus
            </Button>
          ) : covers ? (
            <Button variant="volt" className="h-12 w-full text-sm font-bold" disabled={busy} onClick={start}>
              {busy ? "Activation…" : `Activer — ${validDays} jour${validDays > 1 ? "s" : ""} (${formatFCFA(needed)})`}
            </Button>
          ) : canStart ? (
            <>
              <Button variant="volt" className="h-12 w-full text-sm font-bold" onClick={() => recharge(needed)}>
                <Wallet className="mr-1.5 h-4 w-4" /> Payer {formatFCFA(needed)} — {validDays} jour
                {validDays > 1 ? "s" : ""}
              </Button>
              <Button variant="outline" className="h-11 w-full" disabled={busy} onClick={start}>
                Démarrer avec mon solde (≈ {daysWithBalance} jour{daysWithBalance > 1 ? "s" : ""})
              </Button>
            </>
          ) : (
            <Button variant="volt" className="h-12 w-full text-sm font-bold" onClick={() => recharge(needed)}>
              <Wallet className="mr-1.5 h-4 w-4" /> Payer {formatFCFA(needed)} — {validDays} jour
              {validDays > 1 ? "s" : ""}
            </Button>
          )}
        </div>

        <ul className="space-y-1 text-[11px] leading-relaxed text-muted-foreground">
          <li>
            • <strong className="text-foreground">{formatFCFA(BOOST_DAY_PRICE)} débités chaque jour</strong> sur votre
            solde, automatiquement — rien à relancer.
          </li>
          <li>
            • Votre produit passe <strong className="text-foreground">en tête de l'accueil</strong> et dans le carrousel,
            avec vos vues et vos contacts mesurés.
          </li>
          <li>
            • <strong className="text-foreground">Pause à tout moment</strong> : le solde restant vous appartient.
          </li>
        </ul>
      </DialogContent>
    </Dialog>
  );
}
