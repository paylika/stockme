import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/stockme-client";
import { formatFCFA } from "@/lib/format";
import { explainDbError } from "@/lib/db-errors";
import { toast } from "sonner";
import { Banknote, CalendarDays, Clock, Rocket, TrendingUp, Wallet } from "lucide-react";

type Overview = {
  revenue_total: number;
  revenue_30d: number;
  revenue_today: number;
  paid_count: number;
  pending_count: number;
  wallet_liability: number;
  active_boosts: number;
  daily_boost_revenue: number;
  by_provider: { provider: string; paid_count: number; amount: number }[];
  recent: {
    id: string;
    purpose: string;
    amount_fcfa: number;
    provider: string;
    method: string | null;
    status: string;
    created_at: string;
    paid_at: string | null;
    seller: string | null;
  }[];
};

export const Route = createFileRoute("/_admin/revenue")({
  component: AdminRevenuePage,
});

const PURPOSE_LABELS: Record<string, string> = {
  wallet_topup: "Rechargement",
  subscription: "Abonnement vérifié",
  boost: "Boost",
};

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  paid: { label: "Payé", cls: "bg-success/15 text-success" },
  pending: { label: "En attente", cls: "bg-volt/15 text-volt" },
  failed: { label: "Échoué", cls: "bg-destructive/15 text-destructive" },
  expired: { label: "Expiré", cls: "bg-secondary text-muted-foreground" },
  cancelled: { label: "Annulé", cls: "bg-secondary text-muted-foreground" },
};

function AdminRevenuePage() {
  const [data, setData] = useState<Overview | null>(null);

  useEffect(() => {
    let cancel = false;
    supabase.rpc("admin_payments_overview").then(({ data: d, error }) => {
      if (cancel) return;
      if (error) {
        toast.error(explainDbError(error.message, "20260724000000_wallet_payments_boosts.sql"));
        return;
      }
      setData((d as Overview | null) ?? null);
    });
    return () => {
      cancel = true;
    };
  }, []);

  return (
    <div>
      <div className="flex items-center gap-2">
        <TrendingUp className="h-5 w-5 text-volt" />
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Recettes</p>
      </div>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-4xl">Revenus</h1>
        <span className="text-xs text-muted-foreground">
          {data ? `${data.paid_count} paiement(s) encaissé(s)` : "…"}
        </span>
      </div>

      {!data ? (
        <p className="mt-6 text-sm text-muted-foreground">Chargement…</p>
      ) : (
        <>
          {/* Revenus */}
          <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi icon={CalendarDays} label="Aujourd'hui" value={formatFCFA(data.revenue_today)} tone="volt" />
            <Kpi icon={TrendingUp} label="30 derniers jours" value={formatFCFA(data.revenue_30d)} tone="primary" />
            <Kpi icon={Banknote} label="Total encaissé" value={formatFCFA(data.revenue_total)} tone="muted" />
            <Kpi
              icon={Clock}
              label="En attente"
              value={String(data.pending_count)}
              hint="paiements non confirmés"
              tone="muted"
            />
          </div>

          {/* Activité récurrente */}
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Kpi
              icon={Rocket}
              label="Boosts actifs"
              value={String(data.active_boosts)}
              hint={`${formatFCFA(data.daily_boost_revenue)} / jour engagés`}
              tone="volt"
            />
            <Kpi
              icon={Wallet}
              label="Soldes vendeurs (engagement)"
              value={formatFCFA(data.wallet_liability)}
              hint="rechargé, pas encore consommé"
              tone="muted"
            />
            <Kpi
              icon={TrendingUp}
              label="Revenu récurrent estimé"
              value={`${formatFCFA(data.daily_boost_revenue * 30)} / mois`}
              hint="si les boosts actuels continuent"
              tone="primary"
            />
          </div>

          {/* Par fournisseur */}
          {data.by_provider.length > 0 && (
            <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left">Fournisseur</th>
                    <th className="px-4 py-3 text-right">Paiements</th>
                    <th className="px-4 py-3 text-right">Montant</th>
                  </tr>
                </thead>
                <tbody>
                  {data.by_provider.map((p) => (
                    <tr key={p.provider} className="border-t border-border">
                      <td className="px-4 py-3 font-medium capitalize">{p.provider}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{p.paid_count}</td>
                      <td className="px-4 py-3 text-right font-semibold">{formatFCFA(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Derniers paiements */}
          <h2 className="mt-8 text-lg font-semibold tracking-tight">Derniers paiements</h2>
          <div className="mt-3 overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left">Vendeur</th>
                  <th className="px-4 py-3 text-left">Objet</th>
                  <th className="px-4 py-3 text-left">Moyen</th>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Statut</th>
                  <th className="px-4 py-3 text-right">Montant</th>
                </tr>
              </thead>
              <tbody>
                {data.recent.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                      Aucun paiement pour le moment.
                    </td>
                  </tr>
                ) : (
                  data.recent.map((r) => {
                    const st = STATUS_LABELS[r.status] ?? {
                      label: r.status,
                      cls: "bg-secondary text-muted-foreground",
                    };
                    return (
                      <tr key={r.id} className="border-t border-border">
                        <td className="px-4 py-3">{r.seller ?? "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {PURPOSE_LABELS[r.purpose] ?? r.purpose}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {r.method ? `${r.provider} · ${r.method}` : r.provider}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                          {new Date(r.paid_at ?? r.created_at).toLocaleString("fr-FR", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.cls}`}>
                            {st.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold">{formatFCFA(r.amount_fcfa)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
  tone: "volt" | "primary" | "muted";
}) {
  const tones = {
    volt: "bg-volt/15 text-volt",
    primary: "bg-primary/10 text-primary",
    muted: "bg-secondary text-muted-foreground",
  } as const;

  return (
    <div className="rounded-2xl border border-border bg-card p-3 sm:p-4">
      <div className="flex items-center gap-2">
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl ${tones[tone]}`}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground sm:text-[11px]">
          {label}
        </span>
      </div>
      <p className="mt-2 text-lg font-bold tracking-tight sm:text-xl">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
