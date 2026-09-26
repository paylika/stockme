import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { formatFCFA } from "@/lib/format";
import { supabase } from "@/integrations/supabase/stockme-client";
import type { BoostRow, PendingPayment, WalletData } from "@/hooks/useWallet";
import { toggleBoostStatus } from "@/components/SellerMoneyProvider";
import { BOOST_DAY_PRICE, boostDaysFor, boostPriceFor } from "@/lib/pricing";
import {
  AlertTriangle,
  ArrowDownLeft,
  ChevronDown,
  Clock,
  Eye,
  Heart,
  MessageCircle,
  MousePointerClick,
  Pause,
  Percent,
  Play,
  Plus,
  Rocket,
  Wallet,
} from "lucide-react";

type Props = {
  wallet: WalletData | null;
  loading: boolean;
  /** Ouvre le rechargement, éventuellement avec un montant pré-rempli. */
  onRecharge: (amount?: number) => void;
  /** Reprendre un paiement en attente : on modifie le montant et on repart. */
  onEditPending: (pending: PendingPayment) => void;
  onChanged?: () => void;
};

/** Jours ajoutés d'un clic sur « Prolonger ». */
const EXTEND_DAYS = 7;

/**
 * Portefeuille du vendeur — volontairement simple, dans cet ordre :
 *   1. combien j'ai ;
 *   2. combien de jours cela représente ;
 *   3. ce qui tourne en ce moment (avec pause et prolongation) ;
 *   4. ce que ça me rapporte.
 * Le prix d'une journée est le même pour tout le monde : il n'y a donc aucun
 * réglage à comprendre, seulement une durée à choisir.
 */
export function WalletCard({ wallet, loading, onRecharge, onEditPending, onChanged }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);

  // Réparation automatique : quand le vendeur ouvre son portefeuille, si une
  // campagne est active et financée mais que son annonce n'est plus servie
  // (annonce expirée, journée manquée par la tâche quotidienne), on la remet en
  // service. Aucun débit : la journée est déjà payée.
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
  const activeBoosts = wallet.boosts.filter((b) => b.status === "active");
  const dailySpend = activeBoosts.reduce((s, b) => s + b.daily_budget_fcfa, 0);
  const daysLeft = dailySpend > 0 ? Math.floor(balance / dailySpend) : 0;
  // Sans campagne en cours : ce que le solde permettrait de jours au tarif unique.
  const daysAvailable = boostDaysFor(balance);

  const onToggle = async (campaignId: string, next: "active" | "paused") => {
    setBusyId(campaignId);
    const ok = await toggleBoostStatus(campaignId, next);
    setBusyId(null);
    if (ok) onChanged?.();
  };

  // ---- Performance globale (toutes campagnes confondues) ----
  const totals = wallet.boosts.reduce(
    (acc, b) => {
      acc.impressions += b.impressions ?? 0;
      acc.clicks += b.clicks ?? 0;
      acc.contacts += b.product_contacts ?? 0;
      acc.spent += b.total_spent_fcfa ?? 0;
      acc.views += b.product_views ?? 0;
      return acc;
    },
    { impressions: 0, clicks: 0, contacts: 0, spent: 0, views: 0 },
  );
  const globalCtr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
  const costPerContact = totals.contacts > 0 ? Math.round(totals.spent / totals.contacts) : null;

  return (
    <div className="space-y-4">
      {/* ---------- 1. Le solde, et ce qu'il représente ---------- */}
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
                  ? `${formatFCFA(dailySpend)} engagés par jour · ≈ ${daysLeft} jour${daysLeft > 1 ? "s" : ""} restants`
                  : `1 mise en avant coûte ${formatFCFA(BOOST_DAY_PRICE)} par jour${
                      daysAvailable > 0 ? ` · de quoi tenir ${daysAvailable} jour${daysAvailable > 1 ? "s" : ""}` : ""
                    }`}
              </p>
            </div>
          </div>
          <Button variant="volt" className="h-11" onClick={() => onRecharge()}>
            <ArrowDownLeft className="mr-1.5 h-4 w-4" /> Recharger
          </Button>
        </div>
      </div>

      {/* ---------- 2. Alerte : la diffusion va s'arrêter ---------- */}
      {dailySpend > 0 && daysLeft <= 1 && (
        <div className="flex flex-wrap items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">
              {daysLeft === 0 ? "La mise en avant ne peut plus être payée" : "Il reste 1 jour de mise en avant"}
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              Il faut {formatFCFA(dailySpend)} par jour. Sans recharge, la diffusion s'arrête et votre produit quitte
              les emplacements mis en avant — vous pourrez la reprendre plus tard, rien n'est perdu.
            </p>
          </div>
          <Button variant="volt" className="h-10" onClick={() => onRecharge(dailySpend * EXTEND_DAYS)}>
            <Plus className="mr-1 h-4 w-4" /> {EXTEND_DAYS} jours — {formatFCFA(dailySpend * EXTEND_DAYS)}
          </Button>
        </div>
      )}

      {/* ---------- 3. Paiement en attente : on le reprend ---------- */}
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

      {/* ---------- 4. Ce qui tourne en ce moment ---------- */}
      <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold tracking-tight">
            Mes produits en avant{" "}
            {activeBoosts.length > 0 ? `(${activeBoosts.length} en diffusion)` : ""}
          </h3>
          {dailySpend > 0 && (
            <span className="text-[11px] text-muted-foreground">
              ≈ {daysLeft} jour{daysLeft > 1 ? "s" : ""} restant{daysLeft > 1 ? "s" : ""}
            </span>
          )}
        </div>

        {wallet.boosts.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-border p-6 text-center">
            <Rocket className="mx-auto h-6 w-6 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium">Aucune mise en avant pour l'instant</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Ouvrez l'onglet <strong>Produits</strong>, appuyez sur <strong>Booster</strong> sur un produit, puis
              choisissez le nombre de jours.
            </p>
            <Link to="/profile" search={{ tab: "produits" }} className="mt-3 inline-block">
              <Button variant="volt" className="h-10">
                <Rocket className="mr-1.5 h-4 w-4" /> Choisir un produit à booster
              </Button>
            </Link>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            {wallet.boosts.map((b) => (
              <BoostLine
                key={b.id}
                boost={b}
                busy={busyId === b.id}
                balance={balance}
                onToggle={onToggle}
                onExtend={() => onRecharge(Math.max(0, boostPriceFor(EXTEND_DAYS) - balance))}
              />
            ))}
          </div>
        )}
      </div>

      {/* ---------- 5. Ce que ça rapporte ---------- */}
      {wallet.boosts.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
          <h3 className="text-sm font-bold tracking-tight">Résultats de mes mises en avant</h3>

          <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <Kpi
              label="Vues annonce"
              value={totals.impressions.toLocaleString("fr-FR")}
              icon={Eye}
              hint="visiteurs uniques"
            />
            <Kpi label="Clics" value={totals.clicks.toLocaleString("fr-FR")} icon={MousePointerClick} />
            <Kpi
              label="Contacts reçus"
              value={totals.contacts.toLocaleString("fr-FR")}
              icon={MessageCircle}
              tone={totals.contacts > 0 ? "success" : "muted"}
              hint={costPerContact !== null ? `${formatFCFA(costPerContact)} par contact` : "aucun contact encore"}
            />
            <Kpi
              label="Total dépensé"
              value={formatFCFA(totals.spent)}
              icon={Rocket}
              hint={`${totals.views.toLocaleString("fr-FR")} visites de fiche`}
            />
          </div>

          <details className="mt-3 rounded-xl bg-muted/50 px-3 py-2">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[11px] font-semibold">
              <ChevronDown className="h-3.5 w-3.5 shrink-0" /> Comprendre ces chiffres (et le taux de clic)
            </summary>
            <div className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-muted-foreground">
              <p>
                <strong className="text-foreground">Vues annonce</strong> = visiteurs <em>uniques</em> qui ont vu votre
                produit mis en avant (un même visiteur ne compte qu'une fois par jour).{" "}
                <strong className="text-foreground">Fiche vue</strong> = ouvertures de votre fiche produit, mises en
                avant comprises.
              </p>
              <p>
                <strong className="text-foreground">Taux de clic</strong> : {globalCtr.toFixed(1)} % — au-dessus de{" "}
                <strong className="text-foreground">2 %</strong>, c'est bon. Si les contacts restent à 0 après 2-3 jours,
                changez la <strong className="text-foreground">photo principale</strong> et le{" "}
                <strong className="text-foreground">prix</strong> : ce sont les deux leviers qui font écrire les
                acheteurs.
              </p>
            </div>
          </details>
        </div>
      )}

      {/* ---------- 6. Mouvements (repliés : on ne les consulte pas tous les jours) ---------- */}
      {wallet.transactions.length > 0 && (
        <details className="rounded-2xl border border-border bg-card p-4 sm:p-5">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
            <span className="text-sm font-bold tracking-tight">Mes derniers mouvements</span>
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              {wallet.transactions.length} opération{wallet.transactions.length > 1 ? "s" : ""}
              <ChevronDown className="h-3.5 w-3.5" />
            </span>
          </summary>
          <ul className="mt-3 space-y-1.5">
            {wallet.transactions.slice(0, 15).map((t, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-3 border-b border-border/60 pb-1.5 text-xs last:border-0"
              >
                <span className="truncate text-muted-foreground">{t.label ?? t.kind}</span>
                <span className={t.amount_fcfa >= 0 ? "shrink-0 font-semibold text-success" : "shrink-0 font-semibold"}>
                  {t.amount_fcfa >= 0 ? "+" : ""}
                  {t.amount_fcfa.toLocaleString("fr-FR")} F
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Kpi({
  label,
  value,
  icon: Icon,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  hint?: string;
  tone?: "default" | "success" | "muted";
}) {
  const valueTone =
    tone === "success" ? "text-success" : tone === "muted" ? "text-muted-foreground" : "text-foreground";

  return (
    <div className="rounded-xl border border-border bg-background/60 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate text-[10px] font-semibold uppercase tracking-[0.12em]">{label}</span>
      </div>
      <p className={`mt-1 text-lg font-bold tracking-tight ${valueTone}`}>{value}</p>
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function MiniKpi({
  label,
  value,
  icon: Icon,
  highlight = false,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-lg bg-muted/50 px-2 py-1.5 text-center">
      <div className="flex items-center justify-center gap-1 text-muted-foreground">
        <Icon className="h-3 w-3" />
        <span className="text-[9px] font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <p className={`mt-0.5 text-sm font-bold ${highlight ? "text-success" : ""}`}>{value}</p>
    </div>
  );
}

function BoostLine({
  boost,
  busy,
  balance,
  onToggle,
  onExtend,
}: {
  boost: BoostRow;
  busy: boolean;
  balance: number;
  onToggle: (campaignId: string, nextStatus: "active" | "paused") => void;
  onExtend: () => void;
}) {
  const active = boost.status === "active";
  const ctr = boost.impressions > 0 ? (boost.clicks / boost.impressions) * 100 : 0;
  const daysPaid = boost.days_served;
  // Ce que le solde permettrait encore de jours à ce tarif (le solde est commun
  // à toutes les campagnes : c'est une estimation, on le dit simplement).
  const daysLeft = boostDaysFor(balance);

  return (
    <div className="rounded-xl border border-border p-3">
      {/* En-tête de campagne */}
      <div className="flex flex-wrap items-center gap-3">
        {boost.images?.[0] ? (
          <img src={boost.images[0]} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
        ) : (
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
            <Rocket className="h-5 w-5" />
          </span>
        )}

        <div className="min-w-0 flex-1">
          <Link
            to="/product/$id"
            params={{ id: boost.product_id }}
            className="block truncate text-sm font-semibold hover:text-primary"
          >
            {boost.product_name ?? "Produit"}
          </Link>
          <p className="text-[11px] text-muted-foreground">
            {formatFCFA(boost.daily_budget_fcfa)}/jour · payé {daysPaid} jour{daysPaid > 1 ? "s" : ""} ·{" "}
            {boost.total_spent_fcfa.toLocaleString("fr-FR")} F dépensés
          </p>
          <span
            className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              active ? "bg-success/15 text-success" : "bg-secondary text-muted-foreground"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-success" : "bg-muted-foreground"}`} />
            {active ? `En diffusion · ≈ ${daysLeft} j restants` : "En pause — rien n'est débité"}
          </span>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <Button variant="outline" size="sm" className="h-9" disabled={busy} onClick={() => onToggle(boost.id, active ? "paused" : "active")}>
            {active ? (
              <>
                <Pause className="mr-1 h-3.5 w-3.5" /> Pause
              </>
            ) : (
              <>
                <Play className="mr-1 h-3.5 w-3.5" /> Reprendre
              </>
            )}
          </Button>
          <Button variant="volt" size="sm" className="h-9" onClick={onExtend}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Prolonger
          </Button>
        </div>
      </div>

      {/* KPI de la campagne */}
      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
        <MiniKpi label="Vues" value={boost.impressions.toLocaleString("fr-FR")} icon={Eye} />
        <MiniKpi label="Clics" value={boost.clicks.toLocaleString("fr-FR")} icon={MousePointerClick} />
        <MiniKpi label="Taux" value={boost.impressions > 0 ? `${ctr.toFixed(1)} %` : "—"} icon={Percent} />
        <MiniKpi label="Fiche vue" value={(boost.product_views ?? 0).toLocaleString("fr-FR")} icon={Heart} />
        <MiniKpi
          label="Contacts"
          value={(boost.product_contacts ?? 0).toLocaleString("fr-FR")}
          icon={MessageCircle}
          highlight={(boost.product_contacts ?? 0) > 0}
        />
      </div>
    </div>
  );
}
