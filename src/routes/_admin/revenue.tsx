import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/stockme-client";
import { formatFCFA } from "@/lib/format";
import { explainDbError } from "@/lib/db-errors";
import { Button } from "@/components/ui/button";
import { PRO_AVAILABLE } from "@/lib/pricing";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Banknote,
  CalendarDays,
  Check,
  Clock,
  Gift,
  Info,
  Loader2,
  Receipt,
  RefreshCw,
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

/** Un paiement, avec tout ce qu'il faut pour savoir quoi faire. */
type PaymentRow = {
  id: string;
  created_at: string;
  paid_at: string | null;
  status: string;
  purpose: string;
  amount_fcfa: number;
  provider: string;
  method: string | null;
  provider_ref: string | null;
  checkout_url: string | null;
  user_id: string;
  email: string | null;
  seller: string | null;
  seller_phone: string | null;
  seller_plan: string | null;
  seller_verified: boolean;
  seller_verified_until: string | null;
  plan_meta: string | null;
  jours: number | null;
  objet: string;
  /** Payé ET la personne a reçu ce qu'elle a payé. `null` = pas encore payé. */
  delivered: boolean | null;
};

const STATUS_LABEL: Record<string, string> = {
  paid: "Payé",
  pending: "En attente",
  failed: "Échoué",
  expired: "Expiré",
  cancelled: "Annulé",
};

const STATUS: Record<string, string> = {
  paid: "bg-success/15 text-success",
  pending: "bg-volt/15 text-volt",
  failed: "bg-destructive/15 text-destructive",
  expired: "bg-secondary text-muted-foreground",
  cancelled: "bg-secondary text-muted-foreground",
};

const dateLabel = (p: PaymentRow) =>
  new Date(p.paid_at ?? p.created_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });

export const Route = createFileRoute("/_admin/revenue")({
  component: AdminRevenuePage,
});

function AdminRevenuePage() {
  const [d, setD] = useState<Breakdown | null>(null);
  const [payments, setPayments] = useState<PaymentRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [at, setAt] = useState<Date | null>(null);

  /**
   * MISE À JOUR DES CHIFFRES.
   *
   * Avant : les totaux étaient chargés UNE SEULE FOIS à l'ouverture. Si un
   * vendeur rechargeait pendant que la page était ouverte, on lisait encore
   * l'ancien montant — d'où l'impression de chiffres faux.
   *
   * Maintenant : bouton « Actualiser », mise à jour automatique toutes les
   * 60 secondes, et rechargement dès qu'on revient sur l'onglet.
   */
  const load = useCallback(async () => {
    setBusy(true);
    const [b, list] = await Promise.all([
      supabase.rpc("admin_revenue_breakdown"),
      supabase.rpc("admin_payments_detail", { p_limit: 100 }),
    ]);
    setBusy(false);

    if (b.error) {
      setError(explainDbError(b.error.message, "20260820000000_revenus_separes_et_5_photos.sql"));
      return;
    }
    setError(null);
    setD((b.data as Breakdown | null) ?? null);
    // Le détail des paiements est un PLUS : s'il manque (SQL pas encore collé),
    // les totaux restent affichés, sans écran d'erreur.
    setPayments(list.error ? [] : ((list.data as PaymentRow[] | null) ?? []));
    setAt(new Date());
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

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

  /**
   * REVENU CERTIFICATION = badges que J'AI VALIDÉS MOI-MÊME × 2 000 F.
   *
   * Les badges PAYÉS EN LIGNE ne sont comptés NULLE PART : ces paiements ont dû
   * être activés à la main (l'automatique ne fonctionnait pas), donc les inclure
   * faussait les totaux. Ils ne sont même plus affichés, pour ne laisser aucune
   * ambiguïté.
   */
  const certifTotal = d.badges_manual * BADGE;

  const rechargeTotal = d.topups_collected + d.boosts_paid_online;
  const consumedTotal = d.boost_consumed + d.publication_consumed;

  const total = d.pro_collected + certifTotal + rechargeTotal;

  /** Paiements ENCAISSÉS mais dont la personne n'a rien reçu : à corriger. */
  const notDelivered = (payments ?? []).filter((p) => p.status === "paid" && p.delivered === false);
  /** Paiements pas encore aboutis : ce ne sont PAS des revenus. */
  const pending = (payments ?? []).filter((p) => p.status !== "paid");

  return (
    <div className="pb-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-volt" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Recettes</p>
          </div>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight sm:text-4xl">Revenus par source</h1>
        </div>

        {/* MISE À JOUR : bouton + heure du dernier calcul + rappel automatique. */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">
            {at
              ? `Mis à jour à ${at.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
              : "…"}
          </span>
          <Button variant="outline" size="sm" className="h-9" onClick={() => void load()} disabled={busy}>
            {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
            Actualiser
          </Button>
        </div>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Les chiffres se recalculent tout seuls toutes les 60 secondes, et dès que vous revenez sur cet onglet.
      </p>

      {/* Les paiements NON aboutis, bien séparés des revenus : ils ne comptent
          dans AUCUN total tant que le statut n'est pas « Payé ». */}
      {pending.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-volt/50 bg-volt/10 px-3.5 py-2.5 text-xs">
          <Clock className="h-4 w-4 shrink-0 text-volt" />
          <span className="font-bold">
            {pending.length} paiement{pending.length > 1 ? "s" : ""} en attente
          </span>
          <span className="text-muted-foreground">
            · {formatFCFA(pending.reduce((s, p) => s + p.amount_fcfa, 0))} non encaissés —{" "}
            <strong className="text-foreground">comptés nulle part</strong>. Détail en bas de page.
          </span>
        </div>
      )}

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
            hint={`${d.badges_manual} × ${formatFCFA(BADGE)} = ${formatFCFA(certifTotal)}`}
            tone="primary"
          />
          <Kpi
            icon={Banknote}
            label="Revenu certification"
            value={formatFCFA(certifTotal)}
            hint="badges que vous avez validés vous-même (× 2 000 F)"
            tone="volt"
          />
          {/* Les badges payés en ligne ne sont plus affichés NI comptés : ces
              paiements ont dû être activés à la main, donc les inclure faussait
              les totaux. */}
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

      {/* ============ 5. CHAQUE PAIEMENT, EN DÉTAIL ============
          C'est LA section qui répond aux questions du terrain : qui a payé,
          pour quoi, combien, et est-ce que la personne a bien reçu ce qu'elle a
          payé. Un paiement « en attente » n'est PAS un revenu : on le voit ici. */}
      <Section
        n="5"
        icon={Receipt}
        title="Chaque paiement, en détail"
        subtitle="Qui a payé, pour quoi, et si la personne a bien reçu ce qu'elle a payé."
      >
        {/* Ce qui doit être corrigé à la main, en premier */}
        {notDelivered.length > 0 && (
          <div className="mb-3 rounded-2xl border-2 border-destructive/50 bg-destructive/10 p-4">
            <p className="text-sm font-bold text-destructive">
              ⚠️ {notDelivered.length} paiement{notDelivered.length > 1 ? "s" : ""} encaissé
              {notDelivered.length > 1 ? "s" : ""} mais NON livré{notDelivered.length > 1 ? "s" : ""}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              Ces personnes ont payé et n'ont pas eu leur badge / abonnement. Activez-le depuis la page
              <strong className="text-foreground"> Utilisateurs</strong> (bouton « Vérifier »), puis actualisez ici.
            </p>
            <ul className="mt-2 space-y-1 text-[11px]">
              {notDelivered.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-x-2">
                  <span className="font-semibold">{p.seller ?? p.email ?? "—"}</span>
                  <span className="text-muted-foreground">
                    {p.objet} · {formatFCFA(p.amount_fcfa)} · {dateLabel(p)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full min-w-[880px] text-sm">
            <thead className="bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Qui a payé</th>
                <th className="px-4 py-3 text-left">Pour quoi</th>
                <th className="px-4 py-3 text-left">Moyen</th>
                <th className="px-4 py-3 text-left">Statut</th>
                <th className="px-4 py-3 text-left">Livré ?</th>
                <th className="px-4 py-3 text-right">Montant</th>
              </tr>
            </thead>
            <tbody>
              {payments === null ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                    Chargement…
                  </td>
                </tr>
              ) : payments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                    Aucun paiement pour le moment.
                  </td>
                </tr>
              ) : (
                payments.map((p) => (
                  <tr key={p.id} className="border-t border-border">
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">{dateLabel(p)}</td>
                    <td className="px-4 py-3">
                      <span className="block font-medium">{p.seller ?? "—"}</span>
                      <span className="block text-[11px] text-muted-foreground">{p.email ?? "email inconnu"}</span>
                      {p.seller_phone && (
                        <span className="block text-[11px] text-muted-foreground">{p.seller_phone}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="block">{p.objet}</span>
                      {p.jours ? <span className="block text-[11px] text-muted-foreground">{p.jours} jours</span> : null}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      <span className="block capitalize">{p.provider}</span>
                      {p.method ? <span className="block">{p.method}</span> : null}
                      {p.provider_ref && p.provider === "stripe" && (
                        <a
                          href={`https://dashboard.stripe.com/search?query=${encodeURIComponent(p.provider_ref)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-0.5 inline-block font-semibold text-primary underline underline-offset-2"
                        >
                          Voir sur Stripe
                        </a>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS[p.status] ?? "bg-secondary text-muted-foreground"}`}>
                        {STATUS_LABEL[p.status] ?? p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {p.status !== "paid" ? (
                        <span className="text-[11px] text-muted-foreground">—</span>
                      ) : p.delivered ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-success">
                          <Check className="h-3 w-3" /> Oui
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-semibold text-destructive">
                          <AlertTriangle className="h-3 w-3" /> Non
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold">{formatFCFA(p.amount_fcfa)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          Seuls les paiements au statut <strong className="text-foreground">Payé</strong> entrent dans les totaux
          ci-dessus. Un paiement « En attente » n'est pas un revenu : la personne n'a pas terminé son paiement.
        </p>
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
