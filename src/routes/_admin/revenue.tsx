import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/stockme-client";
import { formatFCFA } from "@/lib/format";
import { explainDbError } from "@/lib/db-errors";
import { PRO_AVAILABLE } from "@/lib/pricing";
import { toast } from "sonner";
import {
  ArrowRight,
  Banknote,
  BadgeCheck,
  CalendarDays,
  Clock,
  Gift,
  Info,
  Repeat,
  Rocket,
  TrendingUp,
  Wallet,
} from "lucide-react";

/**
 * REVENUS — SÉPARÉS PAR SOURCE, ET UN SEUL TOTAL.
 *
 * POURQUOI CETTE PAGE A ÉTÉ REFaite : tout était mélangé (abonnements, badges,
 * recharges, boosts) dans un seul « total encaissé ». Impossible de savoir d'où
 * venait l'argent, ni si l'activité récurrente grandissait.
 *
 * Ici, quatre sources clairement séparées, puis UN total :
 *   1. Abonnements Vendeur Pro   → avec le MRR et l'ARR (le revenu qui revient)
 *   2. Certifications (badges)   → badges validés à la main × 2 000 F + badges payés en ligne
 *   3. Recharges (mise en avant)  → l'argent réellement encaissé
 *   4. Mise en avant consommée    → ce qui a été dépensé depuis les soldes
 *
 * ⚠️ Le point 4 est DÉJÀ payé par le point 3 : il ne s'ajoute donc JAMAIS au
 * total. Le total = abonnements + certifications + recharges encaissées.
 */

const PRO_MONTHLY = 2900;
const PRO_ANNUAL = 29000;
const BADGE = 2000;

type Breakdown = {
  pro_monthly_active: number;
  pro_annual_active: number;
  pro_collected: number;
  badges_manual: number;
  badges_paid_online: number;
  badges_paid_count: number;
  topups_collected: number;
  topups_count: number;
  boosts_paid_online: number;
  boost_consumed: number;
  publication_consumed: number;
  wallet_liability: number;
  pro_credit_given: number;
  verification_bonus_given: number;
  xaalispay_escrow_count: number;
};

export const Route = createFileRoute("/_admin/revenue")({
  component: AdminRevenuePage,
});

function AdminRevenuePage() {
  const [d, setD] = useState<Breakdown | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    supabase.rpc("admin_revenue_breakdown").then(({ data, error: err }) => {
      if (cancel) return;
      if (err) {
        setError(explainDbError(err.message, "20260820000000_revenus_separes_et_5_photos.sql"));
        return;
      }
      setD((data as Breakdown | null) ?? null);
    });
    return () => {
      cancel = true;
    };
  }, []);

  if (error) {
    return (
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-4xl">Revenus</h1>
        <pre className="mt-4 whitespace-pre-wrap rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-xs text-destructive">
          {error}
        </pre>
      </div>
    );
  }

  if (!d) return <p className="mt-6 text-sm text-muted-foreground">Chargement…</p>;

  const mrr = d.pro_monthly_active * PRO_MONTHLY;
  const arrFromMonthly = mrr * 12;
  const arrFromAnnual = d.pro_annual_active * PRO_ANNUAL;
  const arr = arrFromMonthly + arrFromAnnual;

  const manualBadgeRevenue = d.badges_manual * BADGE;
  /**
   * REVENU CERTIFICATION = badges validés À LA MAIN × 2 000 F.
   *
   * ⚠️ Les badges PAYÉS EN LIGNE ne sont PAS additionnés ici (décision du
   * fondateur) : ces paiements ont dû être activés à la main, donc les compter
   * une deuxième fois faussait le total. Ils restent affichés à titre
   * d'information, sans jamais entrer dans un total.
   */
  const certifTotal = manualBadgeRevenue;

  const rechargeTotal = d.topups_collected + d.boosts_paid_online;
  const consumedTotal = d.boost_consumed + d.publication_consumed;

  const total = d.pro_collected + certifTotal + rechargeTotal;

  return (
    <div className="pb-10">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-5 w-5 text-volt" />
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Recettes</p>
      </div>
      <h1 className="mt-1 font-display text-2xl font-bold tracking-tight sm:text-4xl">Revenus par source</h1>

      {/* ============ LE TOTAL, EN PREMIER ============ */}
      <div className="mt-5 overflow-hidden rounded-3xl border-2 border-volt bg-card">
        <div className="flex flex-wrap items-end justify-between gap-3 p-5">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
              Total encaissé, toutes sources
            </p>
            <p className="mt-1 font-display text-3xl font-bold tracking-tight sm:text-4xl">{formatFCFA(total)}</p>
          </div>
          <p className="max-w-md text-[11px] leading-relaxed text-muted-foreground">
            = abonnements Vendeur Pro {formatFCFA(d.pro_collected)} + certifications {formatFCFA(certifTotal)} +
            recharges {formatFCFA(rechargeTotal)}.{" "}
            <strong className="text-foreground">
              La mise en avant consommée ne s'ajoute pas
            </strong>{" "}
            : elle est déjà payée par les recharges.
          </p>
        </div>

        <div className="grid border-t border-border sm:grid-cols-3">
          <Sum label="Abonnements Vendeur Pro" value={formatFCFA(d.pro_collected)} tone="primary" />
          <Sum label="Certifications (badges)" value={formatFCFA(certifTotal)} tone="primary" />
          <Sum label="Recharges (mise en avant)" value={formatFCFA(rechargeTotal)} tone="volt" />
        </div>
      </div>

      {/* ============ 1. ABONNEMENTS VENDEUR PRO + MRR / ARR ============ */}
      <Section
        n="1"
        icon={Repeat}
        title="Abonnements Vendeur Pro"
        subtitle="Le revenu qui REVIENT chaque mois : c'est lui qui compte le plus."
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi
            icon={Repeat}
            label="MRR"
            value={`${formatFCFA(mrr)} / mois`}
            hint={`${d.pro_monthly_active} abonné(s) mensuel(s) × ${formatFCFA(PRO_MONTHLY)}`}
            tone="primary"
          />
          <Kpi
            icon={CalendarDays}
            label="ARR"
            value={`${formatFCFA(arr)} / an`}
            hint={`MRR × 12 + ${d.pro_annual_active} abonné(s) annuel(s)`}
            tone="primary"
          />
          <Kpi
            icon={Banknote}
            label="Encaissé (Pro)"
            value={formatFCFA(d.pro_collected)}
            hint="depuis le début, paiements confirmés"
            tone="muted"
          />
          <Kpi
            icon={BadgeCheck}
            label="Abonnés actifs"
            value={String(d.pro_monthly_active + d.pro_annual_active)}
            hint={`${d.pro_monthly_active} mensuel(s) · ${d.pro_annual_active} annuel(s)`}
            tone="muted"
          />
        </div>
      </Section>

      {/* ============ 2. CERTIFICATIONS ============ */}
      <Section
        n="2"
        icon={BadgeCheck}
        title="Certifications (badge Fournisseur vérifié)"
        subtitle="Badges que vous activez à la main (Wave / Orange Money) et badges payés par carte."
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi
            icon={BadgeCheck}
            label="Badges activés à la main"
            value={String(d.badges_manual)}
            hint={`${d.badges_manual} × ${formatFCFA(BADGE)} = ${formatFCFA(manualBadgeRevenue)}`}
            tone="primary"
          />
          <Kpi
            icon={Banknote}
            label="Revenu certification"
            value={formatFCFA(certifTotal)}
            hint="badges que vous avez validés vous-même (× 2 000 F)"
            tone="volt"
          />
          <Kpi
            icon={Wallet}
            label="Badges payés en ligne"
            value={String(d.badges_paid_count)}
            hint="information seule — activés à la main, NON comptés dans ce revenu"
            tone="muted"
          />
          <Kpi
            icon={Gift}
            label="Cadeaux offerts"
            value={formatFCFA(d.verification_bonus_given)}
            hint="1 500 F de bienvenue — offert, pas gagné"
            tone="muted"
          />
        </div>
      </Section>

      {/* ============ 3. RECHARGES ============ */}
      <Section
        n="3"
        icon={Wallet}
        title="Recharges des vendeurs (mise en avant)"
        subtitle="L'argent réellement encaissé pour alimenter les soldes."
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi
            icon={Wallet}
            label="Recharges encaissées"
            value={formatFCFA(d.topups_collected)}
            hint={`${d.topups_count} paiement(s) confirmé(s)`}
            tone="volt"
          />
          <Kpi
            icon={Rocket}
            label="Mise en avant par carte"
            value={formatFCFA(d.boosts_paid_online)}
            hint="payée directement, sans passer par le solde"
            tone="muted"
          />
          <Kpi
            icon={Clock}
            label="Soldes encore chez nous"
            value={formatFCFA(d.wallet_liability)}
            hint="rechargé, pas encore dépensé — c'est une dette"
            tone="muted"
          />
          <Kpi
            icon={Gift}
            label="Crédit Pro offert chaque mois"
            value={formatFCFA(d.pro_credit_given)}
            hint="versé aux abonnés Pro — offert, pas encaissé"
            tone="muted"
          />
        </div>
      </Section>

      {/* ============ 4. MISE EN AVANT CONSOMMÉE ============ */}
      <Section
        n="4"
        icon={Rocket}
        title="Mise en avant consommée"
        subtitle="Ce qui a été dépensé depuis les soldes. DÉJÀ payé par les recharges : ne s'ajoute pas au total."
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi
            icon={Rocket}
            label="Mise en avant (jours diffusés)"
            value={formatFCFA(d.boost_consumed)}
            hint="débité des soldes, jour après jour"
            tone="volt"
          />
          <Kpi
            icon={Banknote}
            label="Publications supplémentaires"
            value={formatFCFA(d.publication_consumed)}
            hint="500 F par produit au-delà de 20"
            tone="muted"
          />
          <Kpi
            icon={TrendingUp}
            label="Total consommé"
            value={formatFCFA(consumedTotal)}
            hint="somme des deux ci-dessus"
            tone="primary"
          />
          <Kpi
            icon={Info}
            label="Taux de consommation"
            value={d.topups_collected + d.boosts_paid_online > 0 ? `${Math.round((consumedTotal / (d.topups_collected + d.boosts_paid_online)) * 100)} %` : "—"}
            hint="part des recharges déjà utilisée en publicité"
            tone="muted"
          />
        </div>
      </Section>

      {/* ============ XAALISPAY ============ */}
      <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-secondary text-muted-foreground">
          <Info className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">XaalisPay — ventes protégées</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
            {d.xaalispay_escrow_count > 0
              ? `${d.xaalispay_escrow_count} vente(s) protégée(s) enregistrée(s). Aucun revenu StockMe : XaalisPay est notre partenaire de séquestre, et StockMe ne prend AUCUN frais.`
              : "Aucune vente protégée enregistrée pour l'instant. Rappel : StockMe ne prend aucun frais sur le séquestre — c'est XaalisPay qui facture sa protection, à l'acheteur."}
          </p>
        </div>
        {PRO_AVAILABLE && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-volt/15 px-2.5 py-1 text-[11px] font-semibold text-foreground">
            <ArrowRight className="h-3 w-3" /> Les abonnements Pro alimentent le MRR ci-dessus
          </span>
        )}
      </div>
    </div>
  );
}

/** Bloc d'une source de revenu. */
function Section({
  n,
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  n: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-7">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-volt text-sm font-black text-volt-foreground">
          {n}
        </span>
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <Icon className="h-4 w-4 text-volt" /> {title}
          </h2>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** Ligne de total, sous le grand total. */
function Sum({ label, value, tone }: { label: string; value: string; tone: "primary" | "volt" }) {
  return (
    <div className="border-t border-border p-4 first:border-t-0 sm:border-l sm:border-t-0 sm:first:border-l-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-bold tracking-tight ${tone === "volt" ? "text-foreground" : "text-foreground"}`}>
        {value}
      </p>
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
      {hint && <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{hint}</p>}
    </div>
  );
}
