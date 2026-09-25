import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { formatFCFA } from "@/lib/format";
import type { BoostRow, WalletData } from "@/hooks/useWallet";
import { toggleBoostStatus } from "@/components/SellerMoneyProvider";
import { ArrowDownLeft, Eye, MousePointerClick, Pause, Play, Rocket, Wallet } from "lucide-react";

type Props = {
  wallet: WalletData | null;
  loading: boolean;
  onRecharge: () => void;
  onChanged?: () => void;
};

/** Présentation pure : solde, mises en avant en cours, derniers mouvements. */
export function WalletCard({ wallet, loading, onRecharge, onChanged }: Props) {
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

  return (
    <div className="space-y-4">
      {/* Solde */}
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

        <p className="mt-3 rounded-xl bg-muted/50 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
          Le solde est votre carburant : chaque jour de mise en avant est débité automatiquement
          ({formatFCFA(500)} par exemple). Aucun abonnement, aucun engagement — ce qui reste vous appartient.
        </p>
      </div>

      {/* Mises en avant */}
      <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold tracking-tight">
            Mises en avant {activeBoosts.length > 0 ? `(${activeBoosts.length} active${activeBoosts.length > 1 ? "s" : ""})` : ""}
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
          <div className="mt-3 space-y-2">
            {wallet.boosts.map((b) => (
              <BoostLine key={b.id} boost={b} busy={busyId === b.id} onToggle={onToggle} />
            ))}
          </div>
        )}
      </div>

      {/* Mouvements */}
      {wallet.transactions.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
          <h3 className="text-sm font-bold tracking-tight">Derniers mouvements</h3>
          <ul className="mt-3 space-y-1.5">
            {wallet.transactions.slice(0, 12).map((t, i) => (
              <li key={i} className="flex items-center justify-between gap-3 border-b border-border/60 pb-1.5 text-xs last:border-0">
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
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3">
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
          {formatFCFA(boost.daily_budget_fcfa)}/jour · {boost.days_served} jour{boost.days_served > 1 ? "s" : ""} ·{" "}
          {boost.total_spent_fcfa.toLocaleString("fr-FR")} F dépensés
        </p>
        <p className="mt-0.5 flex items-center gap-2 text-[11px]">
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Eye className="h-3 w-3" /> {boost.impressions}
          </span>
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <MousePointerClick className="h-3 w-3" /> {boost.clicks}
          </span>
          <span className={active ? "font-semibold text-success" : "font-semibold text-muted-foreground"}>
            {active ? "En diffusion" : "En pause"}
          </span>
        </p>
      </div>

      <Button
        variant="outline"
        size="sm"
        className="h-9"
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
  );
}
