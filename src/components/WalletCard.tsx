import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { formatFCFA } from "@/lib/format";
import { supabase } from "@/integrations/supabase/stockme-client";
import type { BoostRow, WalletData } from "@/hooks/useWallet";
import { toggleBoostStatus } from "@/components/SellerMoneyProvider";
import { BOOST_DAY_PRICE, BOOST_PACKS, boostDaysFor, boostPriceFor } from "@/lib/pricing";
import {
  ArrowDownLeft,
  ChevronDown,
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
  /** Ouvre le rechargement (montant et formules pré-remplis si fournis). */
  onRecharge: (amount?: number, presets?: number[]) => void;
  /** Rouvre la fenêtre de mise en avant d'un produit (prolonger / reprendre). */
  onProlong: (product: { id: string; name: string }) => void;
  onChanged?: () => void;
};

/** Montants des 3 formules : 7 000 / 15 000 / 30 000 F. */
const PACK_AMOUNTS = BOOST_PACKS.map((p) => boostPriceFor(p.days));

/**
 * Ce qui tourne et ce que ça rapporte.
 *
 * Les paiements abandonnés ne sont PAS ici : ils s'affichent dans la fenêtre de
 * paiement, au moment où le vendeur achète réellement (avant, ils occupaient la
 * page en permanence pour rien).
 */
export function WalletCard({ wallet, loading, onRecharge, onProlong, onChanged }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);

  // Réparation automatique : campagne active et financée mais annonce plus
  // servie (annonce expirée, journée manquée) → on la remet en service.
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
  const daysAvailable = boostDaysFor(balance);

  const onToggle = async (campaignId: string, next: "active" | "paused") => {
    setBusyId(campaignId);
    const ok = await toggleBoostStatus(campaignId, next);
    setBusyId(null);
    if (ok) onChanged?.();
  };

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
      {/* ---------- Mon solde ---------- */}
      <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-volt/15 text-volt">
              <Wallet className="h-6 w-6" />
            </span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Mon solde</p>
              <p className="text-3xl font-bold tracking-tight">{formatFCFA(balance)}</p>
              <p className="text-[11px] text-muted-foreground">
                {dailySpend > 0
                  ? `${formatFCFA(dailySpend)} engagés par jour · ≈ ${daysLeft} jour${daysLeft > 1 ? "s" : ""} de diffusion`
                  : daysAvailable > 0
                    ? `de quoi tenir ${daysAvailable} jour${daysAvailable > 1 ? "s" : ""} de mise en avant`
                    : `1 mise en avant coûte ${formatFCFA(BOOST_DAY_PRICE)} par jour`}
              </p>
            </div>
          </div>
          <Button variant="volt" className="h-11" onClick={() => onRecharge(undefined, PACK_AMOUNTS)}>
            <ArrowDownLeft className="mr-1.5 h-4 w-4" /> Recharger
          </Button>
        </div>
      </div>

      {/* ---------- Continuer la diffusion (jamais un cul-de-sac) ---------- */}
      {dailySpend > 0 && daysLeft <= 2 && (
        <div className="rounded-2xl border border-volt/50 bg-volt/10 p-4">
          <div className="flex items-start gap-3">
            <Rocket className="mt-0.5 h-5 w-5 shrink-0 text-volt" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">
                {daysLeft === 0
                  ? "Votre mise en avant va s'arrêter aujourd'hui"
                  : `Il reste ${daysLeft} jour${daysLeft > 1 ? "s" : ""} de diffusion`}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                Choisissez la durée à ajouter : {formatFCFA(BOOST_DAY_PRICE)} par jour, rien d'autre à faire ensuite.
                Le produit reste en tête de l'accueil tant qu'il reste du solde.
              </p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {BOOST_PACKS.map((p) => (
              <button
                key={p.days}
                type="button"
                onClick={() => onRecharge(boostPriceFor(p.days), PACK_AMOUNTS)}
                className="rounded-xl border border-volt/50 bg-background px-2 py-2 text-center transition hover:bg-volt/15"
              >
                <span className="block text-sm font-bold">{p.days} jours</span>
                <span className="block text-[11px] font-semibold text-foreground">
                  {formatFCFA(boostPriceFor(p.days))}
                </span>
                <span className="block text-[10px] text-muted-foreground">{p.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ---------- Ce qui tourne en ce moment ---------- */}
      <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold tracking-tight">
            Mes produits en avant {activeBoosts.length > 0 ? `(${activeBoosts.length} en diffusion)` : ""}
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
              Choisissez un produit dans la liste ci-dessus, puis la durée : il passe en tête de l'accueil.
            </p>
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
                onProlong={() => onProlong({ id: b.product_id, name: b.product_name ?? "Produit" })}
              />
            ))}
          </div>
        )}
      </div>

      {/* ---------- Ce que ça rapporte ---------- */}
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

      {/* ---------- Mouvements (repliés) ---------- */}
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
  onProlong,
}: {
  boost: BoostRow;
  busy: boolean;
  balance: number;
  onToggle: (campaignId: string, nextStatus: "active" | "paused") => void;
  onProlong: () => void;
}) {
  const active = boost.status === "active";
  const ctr = boost.impressions > 0 ? (boost.clicks / boost.impressions) * 100 : 0;
  const daysPaid = boost.days_served;
  const daysLeft = boostDaysFor(balance);

  return (
    <div className="rounded-xl border border-border p-3">
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
            {active ? `En diffusion · ≈ ${daysLeft} j` : "En pause — rien n'est débité"}
          </span>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
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
          <Button variant="volt" size="sm" className="h-9" onClick={onProlong}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Ajouter des jours
          </Button>
        </div>
      </div>

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
