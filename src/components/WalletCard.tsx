import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { formatFCFA } from "@/lib/format";
import { supabase } from "@/integrations/supabase/stockme-client";
import type { PendingPayment, WalletData } from "@/hooks/useWallet";
import {
  BOOST_DAY_PRICE,
  FREE_PRODUCTS,
  EXTRA_PUBLICATION_PRICE,
  PRO_AVAILABLE,
  PRO_MONTHLY_BOOST_CREDIT,
  VERIFICATION_BONUS_FCFA,
  boostDaysFor,
  boostPriceFor,
  boostSavingsFor,
  planById,
  type PlanId,
} from "@/lib/pricing";
import { ArrowDownLeft, BadgeCheck, Check, ChevronDown, Clock, Gift, Plus, Rocket, Wallet } from "lucide-react";

type Props = {
  wallet: WalletData | null;
  loading: boolean;
  /** Ouvre la fenêtre de rechargement (montant et formules pré-remplis si fournis). */
  onRecharge: (amount?: number, presets?: number[]) => void;
  onEditPending: (pending: PendingPayment) => void;
  onChanged?: () => void;
  /** Offre actuelle du vendeur (« pro » = abonnement actif). */
  plan?: PlanId | null;
  /** Fin d'abonnement Vendeur Pro, si connue. */
  proUntil?: string | null;
  /** Ouvre la fenêtre d'abonnement Vendeur Pro. */
  onPro?: () => void;
};

/**
 * ONGLET PORTEFEUILLE — uniquement l'ARGENT.
 *
 * POURQUOI CE DÉCOUPAGE : l'ancien onglet mélangeait solde, formule d'achat,
 * campagnes en cours, résultats et mouvements. Résultat : personne n'y
 * comprenait rien. Ici on ne gère que le carburant — combien j'ai, comment je
 * recharge, ce que ça me permet d'acheter, et où est passé l'argent.
 *
 * Les campagnes vivent dans l'onglet Sponsorisation, les chiffres dans Stat.
 */
export function WalletCard({ wallet, loading, onRecharge, onEditPending, onChanged, plan, proUntil, onPro }: Props) {
  // Réparation automatique : une campagne active et financée dont l'annonce
  // n'est plus servie est remise en service (aucun débit : la journée est payée).
  useEffect(() => {
    let cancel = false;
    (async () => {
      const { data } = await supabase.rpc("boost_self_heal");
      if (cancel) return;
      const repaired = (data as { repaired?: number } | null)?.repaired ?? 0;
      if (repaired > 0) onChanged?.();
    })();
    return () => {
      cancel = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <div className="h-40 rounded-2xl shimmer bg-muted" />;
  if (!wallet) return null;

  const balance = wallet.balance_fcfa ?? 0;
  const running = wallet.boosts.filter((b) => b.status === "active");
  const dailySpend = running.reduce((s, b) => s + b.daily_budget_fcfa, 0);
  const daysLeft = dailySpend > 0 ? Math.floor(balance / dailySpend) : 0;
  const daysAvailable = boostDaysFor(balance);

  const presets = [1000, 3000, 7000, 13500, 24000];

  return (
    <div className="space-y-4">
      {/* ---------- 1. Le solde ---------- */}
      <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-volt/15 text-volt">
              <Wallet className="h-6 w-6" />
            </span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Mon solde
              </p>
              <p className="text-3xl font-bold tracking-tight">{formatFCFA(balance)}</p>
              <p className="text-[11px] text-muted-foreground">
                {dailySpend > 0
                  ? `${formatFCFA(dailySpend)} engagés par jour · ≈ ${daysLeft} jour${daysLeft > 1 ? "s" : ""} de diffusion`
                  : daysAvailable > 0
                    ? `de quoi payer ${daysAvailable} jour${daysAvailable > 1 ? "s" : ""} de mise en avant`
                    : "Rechargez pour mettre vos produits en avant"}
              </p>
            </div>
          </div>
          <Button variant="volt" className="h-12 px-5" onClick={() => onRecharge(undefined, presets)}>
            <ArrowDownLeft className="mr-1.5 h-4 w-4" /> Recharger
          </Button>
        </div>
      </div>

      {/* ---------- 1 bis. Vendeur Pro : le crédit mensuel dépasse l'abonnement ---------- */}
      {PRO_AVAILABLE && plan === "pro" && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-volt/50 bg-volt/10 p-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-volt text-volt-foreground">
            <Rocket className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-sm font-bold">
              Vendeur Pro actif <BadgeCheck className="h-4 w-4 text-volt" />
            </p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
              {formatFCFA(PRO_MONTHLY_BOOST_CREDIT)} de mise en avant sont crédités sur ce solde chaque mois, et vos
              publications sont illimitées.
              {proUntil ? ` Prochaine échéance : ${new Date(proUntil).toLocaleDateString("fr-FR")}.` : ""}
            </p>
          </div>
        </div>
      )}

      {PRO_AVAILABLE && plan !== "pro" && onPro && (
        <div className="rounded-2xl border border-volt/60 bg-volt/10 p-4">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-volt text-volt-foreground">
              <Rocket className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">
                Vendeur Pro — {formatFCFA(planById("pro")?.price ?? 2900)}/mois
              </p>
              <p className="mt-1 text-xs leading-relaxed">
                <strong>{formatFCFA(PRO_MONTHLY_BOOST_CREDIT)} de mise en avant versés sur ce solde chaque mois</strong>{" "}
                — soit plus que le prix de l'abonnement. Vous récupérez donc l'argent en jours de mise en avant.
              </p>
              <ul className="mt-2 space-y-1 text-[11px] text-muted-foreground">
                <li className="flex items-start gap-1.5">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-volt" />
                  <span>
                    Publications illimitées (au-delà de {FREE_PRODUCTS} produits, au lieu de{" "}
                    {formatFCFA(EXTRA_PUBLICATION_PRICE)} l'unité)
                  </span>
                </li>
                <li className="flex items-start gap-1.5">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-volt" />
                  <span>Badge « Fournisseur vérifié » et priorité dans la recherche inclus</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-volt" />
                  <span>Prélèvement par carte, résiliable à tout moment</span>
                </li>
              </ul>
              <Button variant="volt" className="mt-3 h-11 w-full sm:w-auto" onClick={onPro}>
                <Rocket className="mr-1.5 h-4 w-4" /> Passer Vendeur Pro
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- 2. Ce que le solde permet d'acheter (l'explication, au bon endroit) ---------- */}
      <details open className="rounded-2xl border border-border bg-card p-4">
        <summary className="cursor-pointer text-sm font-bold">À quoi sert mon solde ?</summary>
        <ul className="mt-3 space-y-2 text-xs leading-relaxed text-muted-foreground">
          <li className="flex items-start gap-2">
            <Rocket className="mt-0.5 h-4 w-4 shrink-0 text-volt" />
            <span>
              <strong className="text-foreground">Mise en avant d'un produit</strong> — {formatFCFA(BOOST_DAY_PRICE)}{" "}
              le jour. Plus vous prenez de jours, moins la journée coûte : contenus {formatFCFA(900)} dès 11 jours et{" "}
              {formatFCFA(800)} dès 21 jours. Débitée automatiquement chaque jour, en pause quand vous voulez.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <Plus className="mt-0.5 h-4 w-4 shrink-0 text-volt" />
            <span>
              <strong className="text-foreground">Publications au-delà de {FREE_PRODUCTS} produits</strong> —{" "}
              {formatFCFA(EXTRA_PUBLICATION_PRICE)} par produit supplémentaire, prélevés au moment de la publication.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <Gift className="mt-0.5 h-4 w-4 shrink-0 text-volt" />
            <span>
              <strong className="text-foreground">Vos cadeaux y arrivent aussi</strong> — les{" "}
              {formatFCFA(VERIFICATION_BONUS_FCFA)} offerts à la vérification de votre boutique, et les{" "}
              {formatFCFA(2000)} de la première vente protégée XaalisPay.
            </span>
          </li>
        </ul>
        <p className="mt-3 rounded-xl bg-muted/50 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
          Le solde ne s'expire jamais : ce que vous ne dépensez pas reste pour plus tard. Paiement par carte
          (Visa/Mastercard) — crédité automatiquement dès la confirmation.
        </p>
      </details>

      {/* ---------- 3. Les formules de recharge, avec la remise visible ---------- */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <h3 className="text-sm font-bold tracking-tight">Recharger par durée de mise en avant</h3>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Choisissez la durée : le montant est calculé et crédité sur votre solde.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {[1, 3, 7, 15, 30].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => onRecharge(boostPriceFor(d), presets)}
              className="rounded-xl border border-border bg-background px-2 py-2.5 text-center transition hover:border-volt hover:bg-volt/5"
            >
              <span className="block text-sm font-bold">{d} jour{d > 1 ? "s" : ""}</span>
              <span className="block text-xs font-semibold text-foreground">{formatFCFA(boostPriceFor(d))}</span>
              <span className="block text-[10px] text-muted-foreground">
                {boostSavingsFor(d) > 0 ? `économisez ${formatFCFA(boostSavingsFor(d))}` : "prix normal"}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ---------- 4. Paiement en attente ---------- */}
      {wallet.pending.length > 0 && (
        <div className="rounded-2xl border border-volt/40 bg-volt/10 p-4">
          <div className="flex flex-wrap items-start gap-3">
            <Clock className="mt-0.5 h-5 w-5 shrink-0 text-volt" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">
                {wallet.pending.length === 1
                  ? "Un paiement attend d'être finalisé"
                  : `${wallet.pending.length} paiements attendent d'être finalisés`}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                Vous n'avez pas terminé ce paiement. Reprenez-le plutôt que d'en créer un nouveau — le lien reste
                valable 24 h.
              </p>

              <ul className="mt-2 space-y-2">
                {wallet.pending.map((p) => (
                  <li key={p.id} className="rounded-xl border border-volt/30 bg-background/70 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">
                          {formatFCFA(p.amount_fcfa)}
                          {p.purpose === "wallet_topup" && (
                            <span className="ml-2 text-[11px] font-normal text-muted-foreground">rechargement</span>
                          )}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {new Date(p.created_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                          {p.method ? ` · ${p.method}` : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {p.checkout_url ? (
                          <a href={p.checkout_url}>
                            <Button variant="volt" size="sm" className="h-9">
                              Reprendre le paiement
                            </Button>
                          </a>
                        ) : null}
                        <Button variant="outline" size="sm" className="h-9" onClick={() => onEditPending(p)}>
                          Modifier le montant
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* ---------- 5. Mouvements ---------- */}
      {wallet.transactions.length > 0 && (
        <details className="rounded-2xl border border-border bg-card p-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
            <span className="text-sm font-bold tracking-tight">Où est passé mon argent</span>
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              {wallet.transactions.length} opération{wallet.transactions.length > 1 ? "s" : ""}
              <ChevronDown className="h-3.5 w-3.5" />
            </span>
          </summary>
          <ul className="mt-3 space-y-1.5">
            {wallet.transactions.slice(0, 20).map((t, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-3 border-b border-border/60 pb-1.5 text-xs last:border-0"
              >
                <span className="min-w-0 truncate text-muted-foreground">
                  {t.label ?? t.kind}
                  <span className="ml-2 text-[10px] opacity-70">
                    {new Date(t.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}
                  </span>
                </span>
                <span className={t.amount_fcfa >= 0 ? "shrink-0 font-semibold text-success" : "shrink-0 font-semibold"}>
                  {t.amount_fcfa >= 0 ? "+" : ""}
                  {t.amount_fcfa.toLocaleString("fr-FR")} F
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <p className="text-center text-[11px] text-muted-foreground">
        Une question sur un paiement ?{" "}
        <Link to="/paiement-securise" className="underline underline-offset-2">
          Payer en sécurité avec XaalisPay
        </Link>{" "}
        ou écrivez-nous sur WhatsApp.
      </p>
    </div>
  );
}
