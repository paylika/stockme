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
  BOOST_DAY_PRESETS,
  BOOST_DAY_PRICE,
  BOOST_MAX_DAYS,
  BOOST_MIN_DAYS,
  boostDaysFor,
  boostPriceFor,
} from "@/lib/pricing";
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
  onTopUpRequested: (amount?: number) => void;
  onStarted: () => void;
};

/**
 * Mettre un produit en avant — une seule question : COMBIEN DE JOURS ?
 *
 * Le prix est le même pour tout le monde (1 000 F par jour) : il n'y a donc
 * aucun « budget quotidien » à régler. Le vendeur choisit une durée, on lui
 * dit exactement combien de solde il faut, et la mise en avant tourne toute
 * seule — 1 000 F débités chaque jour — jusqu'à ce qu'il la mette en pause ou
 * que son solde soit épuisé.
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
}: Props) {
  const [days, setDays] = useState(7);
  const [customDays, setCustomDays] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setBusy(false);
    setDays(7);
    setCustomDays("");
  }, [open, productId]);

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

    toast.success(`Mise en avant activée : ${formatFCFA(BOOST_DAY_PRICE)} par jour.`);
    onOpenChange(false);
    onStarted();
  };

  const recharge = (amount: number) => {
    onOpenChange(false);
    onTopUpRequested(amount);
  };

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

        {/* Mise en avant déjà en cours : on ne relance rien, on ajoute des jours. */}
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
              · {existing.daysServed} jour{existing.daysServed > 1 ? "s" : ""} servi
              {existing.daysServed > 1 ? "s" : ""} · {formatFCFA(existing.totalSpent)} dépensés.
              {alreadyRunning
                ? " Chaque jour coûte 1 000 F : rechargez pour qu'elle continue plus longtemps."
                : " Reprenez-la ci-dessous : la journée du jour sera débitée."}
            </span>
          </div>
        ) : null}

        {/* ÉTAPE 1 — la seule question posée */}
        {!alreadyRunning && (
          <>
            <div className="space-y-2">
              <p className="text-sm font-semibold">Pendant combien de jours ?</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {BOOST_DAY_PRESETS.map((v) => {
                  const active = !customDays && days === v;
                  return (
                    <button
                      key={v}
                      type="button"
                      onClick={() => selectDays(v)}
                      className={`rounded-xl border px-2 py-2 text-center transition ${
                        active
                          ? "border-volt bg-volt text-volt-foreground"
                          : "border-border bg-background hover:bg-accent"
                      }`}
                    >
                      <span className="block text-sm font-bold">{v} jours</span>
                      <span className={`block text-[10px] ${active ? "opacity-90" : "text-muted-foreground"}`}>
                        {formatFCFA(boostPriceFor(v))}
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
                placeholder={`Autre durée (${BOOST_MIN_DAYS} à ${BOOST_MAX_DAYS} jours)`}
                value={customDays}
                onChange={(e) => setCustomDays(e.target.value)}
              />
            </div>

            {/* ÉTAPE 2 — le compte, en clair */}
            <div className="rounded-xl border border-border bg-muted/40 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <CalendarDays className="h-4 w-4" /> Durée choisie
                </span>
                <span className="font-semibold">
                  {validDays > 0 ? `${validDays} jour${validDays > 1 ? "s" : ""}` : "—"}
                </span>
              </div>
              <div className="mt-1.5 flex items-center justify-between">
                <span className="text-muted-foreground">Solde nécessaire</span>
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
              {missing > 0 ? (
                <p className="mt-2 border-t border-border pt-2 text-xs font-semibold text-destructive">
                  Il manque {formatFCFA(missing)} pour {validDays} jour{validDays > 1 ? "s" : ""}.
                </p>
              ) : (
                <p className="mt-2 border-t border-border pt-2 text-xs font-semibold text-success">
                  Tout est là : la mise en avant démarre immédiatement.
                </p>
              )}
            </div>
          </>
        )}

        {/* ACTIONS — une seule décision à prendre */}
        <div className="space-y-2">
          {alreadyRunning ? (
            <Button variant="volt" className="h-12 w-full text-sm font-bold" onClick={() => recharge(BOOST_DAY_PRICE)}>
              <Wallet className="mr-1.5 h-4 w-4" /> Recharger {formatFCFA(BOOST_DAY_PRICE)} (1 jour de plus)
            </Button>
          ) : !canStart ? (
            <Button variant="volt" className="h-12 w-full text-sm font-bold" onClick={() => recharge(needed)}>
              <Wallet className="mr-1.5 h-4 w-4" /> Recharger {formatFCFA(needed)}
            </Button>
          ) : (
            <>
              <Button variant="volt" className="h-12 w-full text-sm font-bold" disabled={busy} onClick={start}>
                {busy
                  ? "Activation…"
                  : covers
                    ? `Démarrer — ${validDays} jour${validDays > 1 ? "s" : ""} pour ${formatFCFA(needed)}`
                    : `Démarrer avec ${daysWithBalance} jour${daysWithBalance > 1 ? "s" : ""}`}
              </Button>
              {!covers && (
                <Button variant="outline" className="h-11 w-full" onClick={() => recharge(missing)}>
                  Recharger {formatFCFA(missing)} pour atteindre {validDays} jour{validDays > 1 ? "s" : ""}
                </Button>
              )}
            </>
          )}
        </div>

        {/* Ce qui va se passer, sans surprise */}
        <ul className="space-y-1 text-[11px] leading-relaxed text-muted-foreground">
          <li>
            • <strong className="text-foreground">{formatFCFA(BOOST_DAY_PRICE)} débités chaque jour</strong> sur votre
            solde, automatiquement.
          </li>
          <li>
            • Votre produit passe <strong className="text-foreground">en tête de l'accueil</strong> et dans le carrousel,
            avec vos vues et vos contacts mesurés.
          </li>
          <li>
            • <strong className="text-foreground">Pause à tout moment</strong> : le solde restant vous appartient, il
            n'est jamais perdu.
          </li>
        </ul>
      </DialogContent>
    </Dialog>
  );
}
