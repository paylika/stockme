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
import { PAID_PLANS, PACK_TOTAL, PRO_AVAILABLE, VERIFICATION_BONUS_FCFA, type Plan, type PlanId } from "@/lib/pricing";
import { METHOD_LABELS, goToCheckout, type PayMethod } from "@/lib/pay-client";
import { VerifiedPaymentDialog } from "@/components/VerifiedPaymentDialog";
import stripeLogo from "@/assets/stripe-logo.svg";
import { BadgeCheck, Check, CreditCard, Loader2, ShieldCheck, Smartphone, Sparkles } from "lucide-react";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  methods: string[];
  /** Le vendeur est-il DÉJÀ fournisseur vérifié (achat ou admin) ? */
  isVerified: boolean;
  defaultPhone?: string | null;
  /**
   * Parcours demandé par l'utilisateur (bouton cliqué) :
   *   • "verifie" → le pop-up ne montre QUE l'offre du badge, avec ses avantages ;
   *   • "pro"     → le pop-up ne montre QUE les offres PRO (mensuel + annuel).
   * On ne mélange jamais les deux : celui qui a cliqué sait déjà ce qu'il veut.
   */
  focus?: "verifie" | "pro";
  /** Nom de la boutique : sert au message WhatsApp du badge (validation manuelle). */
  shopName?: string | null;
  contactName?: string | null;
};

/**
 * Montée en offre — logique définitive :
 *   • déjà vérifié → on ne propose QUE PRO (jamais d'acheter le badge deux fois) ;
 *   • focus "verifie" → l'offre du badge seule (ÉTAPE 1) ;
 *   • focus "pro" → les offres PRO seules (ÉTAPE 2).
 */
export function UpgradeDialog({ open, onOpenChange, methods, isVerified, defaultPhone, focus, shopName, contactName }: Props) {
  const [selected, setSelected] = useState<PlanId>("pro");
  const [method, setMethod] = useState<PayMethod>("card");
  const [phone, setPhone] = useState(defaultPhone ?? "");
  const [busy, setBusy] = useState(false);
  const [pack, setPack] = useState(false);
  // Parcours affiché : on suit le bouton cliqué, mais l'utilisateur peut
  // basculer d'un lien discret vers l'autre parcours.
  const [view, setView] = useState<"verifie" | "pro">("pro");
  // Tant que PRO est masqué, le seul parcours possible est le badge.
  const badgeMode = !PRO_AVAILABLE || (view === "verifie" && !isVerified);
  /** Rien à vendre : déjà vérifié, et PRO masqué (on explique au lieu de vendre). */
  const nothingToBuy = isVerified && !PRO_AVAILABLE;

  // Offres réellement proposables dans ce parcours.
  const options = badgeMode
    ? PAID_PLANS.filter((p) => p.id === "verifie")
    : PAID_PLANS.filter((p) => p.id === "pro" || p.id === "pro_annuel");

  useEffect(() => {
    if (!open) return;
    const start: "verifie" | "pro" = focus === "verifie" && !isVerified ? "verifie" : "pro";
    setView(start);
    setSelected(start === "verifie" ? "verifie" : "pro");
    setPack(false);
    setMethod(((methods[0] as PayMethod | undefined) ?? "card") as PayMethod);
    setBusy(false);
  }, [open, isVerified, methods, focus]);

  useEffect(() => {
    if (defaultPhone) setPhone(defaultPhone);
  }, [defaultPhone]);

  const plan: Plan = (pack ? PAID_PLANS.find((p) => p.id === "pro")! : options.find((p) => p.id === selected) ?? options[0])!;
  // Prix lus dans la grille tarifaire (jamais écrits en dur ici).
  const badgePlan = PAID_PLANS.find((p) => p.id === "verifie")!;
  const proPlan = PAID_PLANS.find((p) => p.id === "pro")!;

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
        // ÉTAPE 1 : sécuriser le badge pour 12 mois (paiement unique).
        // L'étape 2 (PRO) est proposée automatiquement juste après le paiement.
        await goToCheckout({
          purpose: "subscription",
          amount: badgePlan.price,
          method,
          customerNumber: needsPhone ? phone : null,
          metadata: { days: badgePlan.days, plan: "verifie", next_step: "pro", source: "pack" },
        });
        return;
      }

      await goToCheckout({
        purpose: "subscription",
        amount: plan.price,
        method,
        customerNumber: needsPhone ? phone : null,
        metadata: {
          days: plan.days,
          plan: plan.dbPlan,
          source: badgeMode ? "badge" : isVerified ? "upsell_pro" : "pro",
        },
      });
    } catch (err) {
      setBusy(false);
      toast.error(err instanceof Error ? err.message : "Paiement impossible");
    }
  };

  // ---- Achat du BADGE uniquement ----
  // Le badge ne s'achète JAMAIS par carte : il se paie par Wave / Orange Money
  // sur le numéro du service, puis l'équipe l'active à la main après la capture.
  // On délègue donc tout le parcours « badge » au pop-up de paiement WhatsApp.
  // (La carte reste réservée au rechargement du solde et aux publications
  // supplémentaires, qui n'utilisent pas cette fenêtre.)
  if (badgeMode && !nothingToBuy) {
    return (
      <VerifiedPaymentDialog
        open={open}
        onOpenChange={onOpenChange}
        shopName={shopName}
        contactName={contactName}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] w-[calc(100%-1.5rem)] max-w-lg overflow-y-auto rounded-2xl p-5">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-left">
            {badgeMode || nothingToBuy ? (
              <BadgeCheck className="h-5 w-5 text-primary" />
            ) : (
              <Sparkles className="h-5 w-5 text-volt" />
            )}
            {nothingToBuy ? "Votre boutique est vérifiée" : badgeMode ? "Faire vérifier ma boutique" : "Passer à StockMe PRO"}
          </DialogTitle>
          <DialogDescription className="text-left">
            {nothingToBuy
              ? "Vous avez déjà le badge Fournisseur vérifié : profitez-en pour mettre vos produits en avant."
              : badgeMode
              ? "Le badge Fournisseur vérifié : la confiance qui fait écrire les acheteurs."
              : isVerified
              ? "Vous êtes déjà fournisseur vérifié — il ne vous manque que les avantages PRO."
              : "PRO contient tout le badge Fournisseur vérifié, tant que votre abonnement court."}
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

        {/* Rien à acheter ici : PRO est masqué et le badge est déjà acquis. On
            n'affiche donc aucune offre, seulement le chemin utile. */}
        {nothingToBuy ? (
          <div className="space-y-2">
            <Link to="/profile" search={{ tab: "promo" }} className="block">
              <Button variant="volt" className="h-11 w-full text-sm font-bold">
                Mettre un produit en avant
              </Button>
            </Link>
            <p className="text-center text-[11px] text-muted-foreground">
              La mise en avant se paie au jour, depuis votre solde.
            </p>
          </div>
        ) : (
          <>
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
                <div className="flex items-start justify-between gap-3">
                  {/* Nom + étiquette sur leur propre ligne : le nom n'est jamais
                      tronqué, même sur un petit écran. */}
                  <div className="flex min-w-0 flex-1 items-start gap-2">
                    <span
                      className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border ${
                        active ? "border-volt bg-volt text-volt-foreground" : "border-input"
                      }`}
                    >
                      {active && <Check className="h-3 w-3" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-bold leading-snug">{p.name}</span>
                      {p.badge && (
                        <span className="mt-1 inline-block rounded-full bg-foreground px-2 py-0.5 text-[10px] font-semibold text-background">
                          {p.badge}
                        </span>
                      )}
                    </span>
                  </div>
                  {/* Prix sur 3 lignes courtes : la colonne reste étroite et le
                      nom de l'offre garde toute la place à gauche. */}
                  <div className="shrink-0 text-right">
                    <p className="whitespace-nowrap text-sm font-bold">{formatFCFA(p.price)}</p>
                    <p className="whitespace-nowrap text-[11px] text-muted-foreground">{p.period}</p>
                    {p.regularPrice && (
                      <p className="whitespace-nowrap text-[11px] text-muted-foreground line-through">
                        {formatFCFA(p.regularPrice)}
                      </p>
                    )}
                  </div>
                </div>

                {active && (
                  <ul className="mt-2.5 space-y-1 border-t border-volt/20 pt-2.5">
                    {(badgeMode ? p.features : p.features.slice(0, 5)).map((f) => (
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

        {/* Le PRO à l'année inclut déjà le badge 12 mois : on le dit clairement,
            et on ne propose donc aucune option de vérification en plus. */}
        {!badgeMode && selected === "pro_annuel" && (
          <p className="flex items-start gap-2 rounded-xl border border-primary/25 bg-primary/5 px-3 py-2.5 text-[11px] leading-relaxed">
            <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>
              <strong className="text-foreground">Badge Fournisseur vérifié inclus.</strong> Avec PRO à l'année, vous
              devenez vendeur vérifié et PRO en même temps, pour 12 mois — rien d'autre à payer.
            </span>
          </p>
        )}

        {/* On ne propose l'option « badge 12 mois » que sur le PRO MENSUEL : c'est
            le seul cas où le badge s'arrêterait avec l'abonnement. Simple case à
            cocher, comme partout ailleurs. */}
        {!badgeMode && !isVerified && selected === "pro" && (
          <label
            className={`flex w-full cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition ${
              pack ? "border-volt bg-volt/10" : "border-dashed border-volt/50 bg-volt/5 hover:bg-volt/10"
            }`}
          >
            <input
              type="checkbox"
              checked={pack}
              onChange={(e) => setPack(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-volt"
            />
            <span className="text-[11px] leading-relaxed">
              <span className="block text-xs font-bold">
                Sécuriser mon badge 12 mois (+{formatFCFA(badgePlan.price)})
              </span>
              <span className="mt-0.5 block text-muted-foreground">
                {pack ? (
                  <>
                    Vous payez <strong className="text-foreground">{formatFCFA(PACK_TOTAL)}</strong> aujourd'hui, puis{" "}
                    {formatFCFA(proPlan.price)}/mois. Votre badge reste acquis 12 mois, même si vous arrêtez PRO ensuite.
                  </>
                ) : (
                  <>
                    Sans cocher : votre badge s'arrête si vous arrêtez PRO. En cochant : il reste acquis toute l'année.
                  </>
                )}
              </span>
            </span>
          </label>
        )}

        {/* Lien discret vers l'autre parcours (jamais les deux offres mélangées).
            Masqué tant que PRO est en veille : on ne propose pas ce qu'on ne vend pas. */}
        {PRO_AVAILABLE && badgeMode ? (
          <button
            type="button"
            onClick={() => {
              setView("pro");
              setSelected("pro");
              setPack(false);
            }}
            className="w-full text-center text-[11px] font-semibold text-volt underline underline-offset-2"
          >
            Je veux aussi StockMe PRO → voir les offres PRO
          </button>
        ) : PRO_AVAILABLE && !isVerified ? (
          <button
            type="button"
            onClick={() => {
              setView("verifie");
              setSelected("verifie");
              setPack(false);
            }}
            className="w-full text-center text-[11px] font-semibold text-muted-foreground underline underline-offset-2"
          >
            Je veux seulement le badge Fournisseur vérifié ({formatFCFA(badgePlan.price)}/an)
          </button>
        ) : null}

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
                    className={`flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition ${
                      active ? "border-volt bg-volt/10" : "border-border bg-background hover:bg-accent"
                    }`}
                  >
                    <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${active ? "text-volt" : "text-muted-foreground"}`} />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{METHOD_LABELS[value] ?? m}</span>
                      {value === "card" && (
                        <span className="mt-0.5 block text-[11px] font-normal leading-relaxed text-muted-foreground">
                          Paiement sécurisé par <strong className="font-semibold text-foreground">Stripe</strong>. Votre
                          carte prépayée <strong className="font-semibold text-foreground">Wave</strong> ou{" "}
                          <strong className="font-semibold text-foreground">Orange Money</strong> fonctionne aussi.
                        </span>
                      )}
                    </span>
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
          ) : plan.id === "pro_annuel" ? (
            <p className="text-muted-foreground">
              Paiement unique : <strong className="text-foreground">12 mois de PRO</strong>, badge Fournisseur vérifié
              inclus pendant 12 mois (2 mois offerts).
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
              immédiatement, à utiliser quand vous voulez.
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
            ? `Sécuriser mon badge — ${formatFCFA(badgePlan.price)}`
            : badgeMode
            ? `Obtenir le badge — ${formatFCFA(plan.price)}`
            : `Activer ${plan.name} — ${formatFCFA(plan.price)}`}
        </Button>

        {/* Rassurance paiement : le vrai logo Stripe (marque officielle). */}
        {methods.includes("card") && (
          <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
            <span>Paiement sécurisé par</span>
            <img src={stripeLogo} alt="Stripe" className="h-4 w-auto" />
            <span className="basis-full text-center">
              Vous saisissez votre carte sur la page de Stripe — StockMe ne voit jamais votre numéro.
            </span>
          </p>
        )}

        <p className="text-center text-[11px] text-muted-foreground">
          <Link to="/tarifs" className="underline underline-offset-2">
            Voir le détail des offres
          </Link>
        </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
