import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { formatFCFA } from "@/lib/format";
import type { BoostRow, WalletData } from "@/hooks/useWallet";
import { ArrowDownLeft, Eye, MousePointerClick, Pause, Play, Rocket, Wallet } from "lucide-react";

type Props = {
  wallet: WalletData | null;
  loading: boolean;
  busyId: string | null;
  onRecharge: () => void;
  onToggleBoost: (campaignId: string, nextStatus: "active" | "paused") => void;
};

/** Présentation pure : le solde, les mises en avant en cours et les mouvements. */
export function WalletCard({ wallet, loading, busyId, onRecharge, onToggleBoost }: Props) {
  if (loading) return <div className="mt-6 h-40 rounded-2xl shimmer bg-muted" />;
  if (!wallet) return null;

  const balance = wallet.balance_fcfa ?? 0;
  const activeBoosts = wallet.boosts.filter((b) => b.status === "active");
  const dailySpend = activeBoosts.reduce((s, b) => s + b.daily_budget_fcfa, 0);
  const daysLeft = dailySpend > 0 ? Math.floor(balance / dailySpend) : 0;

  return (
    <section className="mt-6 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-volt/15 text-volt">
            <Wallet className="h-5 w-5" />
          </span>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Mon solde</p>
            <p className="text-2xl font-bold tracking-tight">{formatFCFA(balance)}</p>
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

      {wallet.boosts.length > 0 && (
        <div className="mt-4 space-y-2 border-t border-border pt-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Mes mises en avant ({activeBoosts.length} active{activeBoosts.length > 1 ? "s" : ""})
          </p>
          {wallet.boosts.slice(0, 6).map((b) => (
            <BoostLine key={b.id} boost={b} busy={busyId === b.id} onToggle={onToggleBoost} />
          ))}
        </div>
      )}

      {wallet.transactions.length > 0 && (
        <details className="mt-4 border-t border-border pt-3">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Derniers mouvements
          </summary>
          <ul className="mt-2 space-y-1.5">
            {wallet.transactions.slice(0, 10).map((t, i) => (
              <li key={i} className="flex items-center justify-between gap-3 text-xs">
                <span className="truncate text-muted-foreground">{t.label ?? t.kind}</span>
                <span className={t.amount_fcfa >= 0 ? "font-semibold text-success" : "font-semibold"}>
                  {t.amount_fcfa >= 0 ? "+" : ""}
                  {t.amount_fcfa.toLocaleString("fr-FR")} F
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
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
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-2.5">
      {boost.images?.[0] ? (
        <img src={boost.images[0]} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" />
      ) : (
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
          <Rocket className="h-4 w-4" />
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
        <p className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Eye className="h-3 w-3" /> {boost.impressions}
          </span>
          <span className="inline-flex items-center gap-1">
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
