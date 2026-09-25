import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { formatFCFA } from "@/lib/format";
import type { BoostRow, PendingPayment, WalletData } from "@/hooks/useWallet";
import { toggleBoostStatus } from "@/components/SellerMoneyProvider";
import {
  ArrowDownLeft,
  Clock,
  Eye,
  Heart,
  MessageCircle,
  MousePointerClick,
  Pause,
  Percent,
  Play,
  Rocket,
  Wallet,
} from "lucide-react";

type Props = {
  wallet: WalletData | null;
  loading: boolean;
  onRecharge: () => void;
  /** Reprendre un paiement en attente : on modifie le montant et on repart. */
  onEditPending: (pending: PendingPayment) => void;
  onChanged?: () => void;
};

/** Présentation pure : solde, performance des mises en avant, mouvements. */
export function WalletCard({ wallet, loading, onRecharge, onEditPending, onChanged }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);

  if (loading) return <div className="h-40 rounded-2xl shimmer bg-muted" />;
  if (!wallet) return null;

  const balance = wallet.balance_fcfa ?? 0;
  const activeBoosts = wallet.boosts.filter((b) => b.status === "active");
  const dailySpend = activeBoosts.reduce((s, b) => s + b.daily_budget_fcfa, 0);
  const daysLeft = dailySpend > 0 ? Math.floor(balance / dailySpend) : 0;

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
      return acc;
    },
    { impressions: 0, clicks: 0, contacts: 0, spent: 0 },
  );
  const globalCtr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
  const costPerContact = totals.contacts > 0 ? Math.round(totals.spent / totals.contacts) : null;

  return (
    <div className="space-y-4">
      {/* ---------- Solde ---------- */}
      <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-volt/15 text-volt">
              <Wallet className="h-6 w-6" />
            </span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Solde disponible
              </p>
              <p className="text-3xl font-bold tracking-tight">{formatFCFA(balance)}</p>
              {dailySpend > 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  {formatFCFA(dailySpend)} / jour engagés · ≈ {daysLeft} jour{daysLeft > 1 ? "s" : ""} restants
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  Rechargez pour mettre vos produits en avant, jour après jour.
                </p>
              )}
            </div>
          </div>
          <Button variant="volt" className="h-11" onClick={onRecharge}>
            <ArrowDownLeft className="mr-1.5 h-4 w-4" /> Recharger
          </Button>
        </div>
      </div>

      {/* ---------- Paiement en attente : on le reprend, on n'en crée pas un autre ---------- */}
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

      {/* ---------- Performance globale ---------- */}
      {wallet.boosts.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
          <h3 className="text-sm font-bold tracking-tight">Performance de vos mises en avant</h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Depuis le premier jour de diffusion.</p>

          <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <Kpi label="Vues annonce" value={totals.impressions.toLocaleString("fr-FR")} icon={Eye} />
            <Kpi label="Clics" value={totals.clicks.toLocaleString("fr-FR")} icon={MousePointerClick} />
            <Kpi
              label="Taux de clic"
              value={totals.impressions > 0 ? `${globalCtr.toFixed(1)} %` : "—"}
              icon={Percent}
              tone={globalCtr >= 2 ? "success" : "muted"}
            />
            <Kpi
              label="Contacts reçus"
              value={totals.contacts.toLocaleString("fr-FR")}
              icon={MessageCircle}
              tone={totals.contacts > 0 ? "success" : "muted"}
            />
          </div>

          <div className="mt-2.5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <Kpi label="Total dépensé" value={formatFCFA(totals.spent)} icon={Rocket} />
            <Kpi
              label="Coût par contact"
              value={costPerContact !== null ? formatFCFA(costPerContact) : "—"}
              icon={MessageCircle}
              hint={costPerContact === null ? "aucun contact encore" : "par personne intéressée"}
            />
            <Kpi label="Solde restant" value={formatFCFA(balance)} icon={Wallet} />
            <Kpi
              label="Jours restants"
              value={dailySpend > 0 ? String(daysLeft) : "—"}
              icon={Percent}
              hint={dailySpend > 0 ? `à ${formatFCFA(dailySpend)}/jour` : "aucun boost actif"}
            />
          </div>

          <p className="mt-3 rounded-xl bg-muted/50 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
            Repère : un taux de clic au-dessus de <strong className="text-foreground">2 %</strong> est bon sur une
            place de marché. Si les contacts restent à 0 après 2-3 jours, améliorez la <strong>photo principale</strong>{" "}
            et le <strong>prix</strong> — ce sont les deux leviers qui font écrire les acheteurs.
          </p>
        </div>
      )}

      {/* ---------- Campagnes ---------- */}
      <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold tracking-tight">
            Mes campagnes{" "}
            {activeBoosts.length > 0 ? `(${activeBoosts.length} active${activeBoosts.length > 1 ? "s" : ""})` : ""}
          </h3>
          <span className="text-[11px] text-muted-foreground">{wallet.boosts.length} au total</span>
        </div>

        {wallet.boosts.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-border p-6 text-center">
            <Rocket className="mx-auto h-6 w-6 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium">Aucune mise en avant</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Ouvrez l'onglet <strong>Produits</strong> et appuyez sur « Booster » : votre produit passe en tête de
              l'accueil tant qu'il reste du solde.
            </p>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            {wallet.boosts.map((b) => (
              <BoostLine key={b.id} boost={b} busy={busyId === b.id} onToggle={onToggle} />
            ))}
          </div>
        )}
      </div>

      {/* ---------- Mouvements ---------- */}
      {wallet.transactions.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
          <h3 className="text-sm font-bold tracking-tight">Derniers mouvements</h3>
          <ul className="mt-3 space-y-1.5">
            {wallet.transactions.slice(0, 12).map((t, i) => (
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
        </div>
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

function BoostLine({
  boost,
  busy,
  onToggle,
}: {
  boost: BoostRow;
  busy: boolean;
  onToggle: (campaignId: string, nextStatus: "active" | "paused") => void;
}) {
  const active = boost.status === "active";
  const ctr = boost.impressions > 0 ? (boost.clicks / boost.impressions) * 100 : 0;
  const costPerView = boost.product_views > 0 ? Math.round(boost.total_spent_fcfa / boost.product_views) : null;

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
            {formatFCFA(boost.daily_budget_fcfa)}/jour · {boost.days_served} jour
            {boost.days_served > 1 ? "s" : ""} · {boost.total_spent_fcfa.toLocaleString("fr-FR")} F dépensés
          </p>
          <span
            className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              active ? "bg-success/15 text-success" : "bg-secondary text-muted-foreground"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-success" : "bg-muted-foreground"}`} />
            {active ? "En diffusion" : "En pause"}
          </span>
        </div>

        <Button
          variant="outline"
          size="sm"
          className="h-9 shrink-0"
          disabled={busy}
          onClick={() => onToggle(boost.id, active ? "paused" : "active")}
        >
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
      </div>

      {/* KPI de la campagne */}
      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
        <MiniKpi label="Vues" value={boost.impressions.toLocaleString("fr-FR")} icon={Eye} />
        <MiniKpi label="Clics" value={boost.clicks.toLocaleString("fr-FR")} icon={MousePointerClick} />
        <MiniKpi label="Taux" value={boost.impressions > 0 ? `${ctr.toFixed(1)} %` : "—"} icon={Percent} />
        <MiniKpi
          label="Fiche vue"
          value={(boost.product_views ?? 0).toLocaleString("fr-FR")}
          icon={Heart}
        />
        <MiniKpi
          label="Contacts"
          value={(boost.product_contacts ?? 0).toLocaleString("fr-FR")}
          icon={MessageCircle}
          highlight={(boost.product_contacts ?? 0) > 0}
        />
      </div>

      {costPerView !== null && (
        <p className="mt-2 text-[10px] text-muted-foreground">
          {formatFCFA(costPerView)} dépensés par visite de votre fiche produit
          {(boost.product_contacts ?? 0) > 0
            ? ` · ${formatFCFA(Math.round(boost.total_spent_fcfa / (boost.product_contacts || 1)))} par contact`
            : ""}
        </p>
      )}
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
