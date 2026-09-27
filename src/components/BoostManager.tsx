import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { formatFCFA } from "@/lib/format";
import type { BoostRow, WalletData } from "@/hooks/useWallet";
import { toggleBoostStatus } from "@/components/SellerMoneyProvider";
import { BOOST_PACKS, boostDaysFor, boostPriceFor, boostSavingsFor } from "@/lib/pricing";
import { thumb } from "@/lib/img";
import {
  Ban,
  Eye,
  MessageCircle,
  Pause,
  Play,
  Plus,
  Rocket,
  Wallet,
} from "lucide-react";

type Props = {
  wallet: WalletData | null;
  loading: boolean;
  /** Recharge : ouvre le portefeuille avec un montant pré-rempli. */
  onRecharge: (amount?: number, presets?: number[]) => void;
  /** Ajouter des jours à une annonce existante (ouvre la fenêtre de mise en avant). */
  onExtend: (product: { id: string; name: string }) => void;
  onChanged: () => void;
};

const PACK_AMOUNTS = BOOST_PACKS.map((p) => boostPriceFor(p.days));

/**
 * GESTIONNAIRE D'ANNONCES — l'onglet Sponsorisation.
 *
 * Comme un gestionnaire de publicités : on y voit ce qui TOURNE et ce qui est
 * ARRÊTÉ, avec les actions au bon endroit. Rien d'autre : le solde vit dans
 * l'onglet Portefeuille, les chiffres détaillés dans l'onglet Stat.
 *
 * Règle métier affichée noir sur blanc : quand le solde ne couvre plus la
 * journée, la diffusion s'arrête TOUTE SEULE (la tâche quotidienne la met en
 * pause). On ne laisse jamais le vendeur avec un message sans bouton : chaque
 * annonce arrêtée propose « Ajouter des jours » ou « Recharger ».
 */
export function BoostManager({ wallet, loading, onRecharge, onExtend, onChanged }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);

  if (loading) return <div className="h-40 rounded-2xl shimmer bg-muted" />;
  if (!wallet) return null;

  const balance = wallet.balance_fcfa ?? 0;
  const running = wallet.boosts.filter((b) => b.status === "active");
  const stopped = wallet.boosts.filter((b) => b.status === "paused");
  const ended = wallet.boosts.filter((b) => b.status === "ended" || b.status === "completed");

  const dailySpend = running.reduce((s, b) => s + b.daily_budget_fcfa, 0);
  const daysLeft = dailySpend > 0 ? Math.floor(balance / dailySpend) : 0;

  const act = async (id: string, next: "active" | "paused" | "ended") => {
    setBusyId(id);
    const ok = await toggleBoostStatus(id, next);
    setBusyId(null);
    if (ok) onChanged();
  };

  if (wallet.boosts.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-center">
        <Rocket className="mx-auto h-7 w-7 text-muted-foreground" />
        <p className="mt-3 text-sm font-bold">Aucune annonce pour l'instant</p>
        <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
          Ouvrez l'onglet <strong className="text-foreground">Produits</strong>, appuyez sur{" "}
          <strong className="text-foreground">Booster</strong> sur un article : il passe en tête de l'accueil pour{" "}
          {formatFCFA(1000)} par jour.
        </p>
        <Link to="/profile" search={{ tab: "produits" }} className="mt-4 inline-block">
          <Button variant="volt" className="h-11">
            <Rocket className="mr-1.5 h-4 w-4" /> Choisir un produit à booster
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ---------- Solde insuffisant : on prévient AVANT l'arrêt ---------- */}
      {dailySpend > 0 && daysLeft <= 2 && (
        <div className="rounded-2xl border border-volt/50 bg-volt/10 p-4">
          <p className="text-sm font-bold">
            {daysLeft === 0
              ? "La diffusion va s'arrêter : le solde ne couvre plus la journée"
              : `Il reste ${daysLeft} jour${daysLeft > 1 ? "s" : ""} de diffusion`}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            Il faut {formatFCFA(dailySpend)} par jour. Rechargez pour que vos annonces continuent :{" "}
            {formatFCFA(900)} par jour dès 11 jours, {formatFCFA(800)} dès 21 jours.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {BOOST_PACKS.slice(2, 5).map((p) => (
              <Button
                key={p.days}
                variant="volt"
                className="h-10"
                onClick={() => onRecharge(boostPriceFor(p.days), PACK_AMOUNTS)}
              >
                <Wallet className="mr-1.5 h-4 w-4" /> {p.days} jours — {formatFCFA(boostPriceFor(p.days))}
                {boostSavingsFor(p.days) > 0 ? ` (−${formatFCFA(boostSavingsFor(p.days))})` : ""}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* ---------- 1. EN DIFFUSION ---------- */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-bold tracking-tight">
            <span className="h-2 w-2 rounded-full bg-success" /> En diffusion
            <span className="font-normal text-muted-foreground">({running.length})</span>
          </h3>
          {dailySpend > 0 && (
            <span className="text-[11px] text-muted-foreground">
              {formatFCFA(dailySpend)} par jour · ≈ {daysLeft} jour{daysLeft > 1 ? "s" : ""} restant
              {daysLeft > 1 ? "s" : ""} avec votre solde
            </span>
          )}
        </div>

        {running.length === 0 ? (
          <p className="mt-2 rounded-xl bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground">
            Aucune annonce en diffusion. Reprenez-en une ci-dessous ou boostez un produit depuis l'onglet Produits.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {running.map((b) => (
              <AdCard
                key={b.id}
                boost={b}
                balance={balance}
                busy={busyId === b.id}
                onAct={act}
                onRecharge={onRecharge}
                onExtend={onExtend}
                live
              />
            ))}
          </ul>
        )}
      </section>

      {/* ---------- 2. EN PAUSE (solde épuisé, ou mise en pause manuelle) ---------- */}
      {stopped.length > 0 && (
        <section>
          <h3 className="flex items-center gap-2 text-sm font-bold tracking-tight">
            <span className="h-2 w-2 rounded-full bg-muted-foreground" /> En pause
            <span className="font-normal text-muted-foreground">({stopped.length})</span>
          </h3>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            Une annonce s'arrête d'elle-même quand le solde ne couvre plus la journée. Ajoutez des jours pour la
            remettre en tête de l'accueil — rien n'est perdu.
          </p>
          <ul className="mt-3 space-y-3">
            {stopped.map((b) => (
              <AdCard
                key={b.id}
                boost={b}
                balance={balance}
                busy={busyId === b.id}
                onAct={act}
                onRecharge={onRecharge}
                onExtend={onExtend}
              />
            ))}
          </ul>
        </section>
      )}

      {/* ---------- 3. TERMINÉES ---------- */}
      {ended.length > 0 && (
        <details className="rounded-2xl border border-border bg-card p-4">
          <summary className="cursor-pointer text-sm font-bold">
            Annonces terminées <span className="font-normal text-muted-foreground">({ended.length})</span>
          </summary>
          <ul className="mt-3 space-y-2">
            {ended.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-2 text-xs">
                <span className="min-w-0 flex-1 truncate">{b.product_name ?? "Produit"}</span>
                <span className="text-muted-foreground">
                  {b.days_served} jour{b.days_served > 1 ? "s" : ""} · {formatFCFA(b.total_spent_fcfa)} dépensés
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  disabled={busyId === b.id}
                  onClick={() => onExtend({ id: b.product_id, name: b.product_name ?? "Produit" })}
                >
                  <Play className="mr-1 h-3 w-3" /> Relancer
                </Button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/** Une annonce : ce qu'elle fait, ce qu'elle a produit, et les actions. */
function AdCard({
  boost,
  balance,
  busy,
  onAct,
  onRecharge,
  onExtend,
  live = false,
}: {
  boost: BoostRow;
  balance: number;
  busy: boolean;
  onAct: (id: string, next: "active" | "paused" | "ended") => void;
  onRecharge: (amount?: number, presets?: number[]) => void;
  onExtend: (product: { id: string; name: string }) => void;
  live?: boolean;
}) {
  const daysLeft = boostDaysFor(balance);
  const canResume = balance >= boost.daily_budget_fcfa;

  return (
    <li className={`rounded-2xl border p-3.5 ${live ? "border-border bg-card" : "border-volt/40 bg-volt/5"}`}>
      <div className="flex flex-wrap items-center gap-3">
        {boost.images?.[0] ? (
          <img
            src={thumb(boost.images[0], 150)}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-14 w-14 shrink-0 rounded-xl object-cover"
          />
        ) : (
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
            <Rocket className="h-5 w-5" />
          </span>
        )}

        <div className="min-w-0 flex-1">
          <Link
            to="/product/$id"
            params={{ id: boost.product_id }}
            className="block truncate text-sm font-bold hover:text-primary"
          >
            {boost.product_name ?? "Produit"}
          </Link>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {formatFCFA(boost.daily_budget_fcfa)} par jour · {boost.days_served} jour
            {boost.days_served > 1 ? "s" : ""} payé{boost.days_served > 1 ? "s" : ""} ·{" "}
            {formatFCFA(boost.total_spent_fcfa)} dépensés
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Eye className="h-3 w-3" /> {(boost.impressions ?? 0).toLocaleString("fr-FR")} vues
            </span>
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <MessageCircle className="h-3 w-3" /> {boost.product_contacts ?? 0} contact
              {(boost.product_contacts ?? 0) > 1 ? "s" : ""}
            </span>
            {live && (
              <span className="font-semibold text-success">
                ≈ {daysLeft} jour{daysLeft > 1 ? "s" : ""} de diffusion restants
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Les actions, dans l'ordre d'utilité */}
      <div className="mt-3 flex flex-wrap gap-2">
        {live ? (
          <>
            <Button variant="volt" className="h-9" onClick={() => onExtend({ id: boost.product_id, name: boost.product_name ?? "Produit" })}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Ajouter des jours
            </Button>
            <Button variant="outline" className="h-9" disabled={busy} onClick={() => onAct(boost.id, "paused")}>
              <Pause className="mr-1 h-3.5 w-3.5" /> Mettre en pause
            </Button>
          </>
        ) : (
          <>
            {canResume ? (
              <Button variant="volt" className="h-9" disabled={busy} onClick={() => onAct(boost.id, "active")}>
                <Play className="mr-1 h-3.5 w-3.5" /> Reprendre la diffusion
              </Button>
            ) : (
              <Button
                variant="volt"
                className="h-9"
                onClick={() => onRecharge(Math.max(0, boost.daily_budget_fcfa - balance), PACK_AMOUNTS)}
              >
                <Wallet className="mr-1 h-3.5 w-3.5" /> Recharger pour reprendre
              </Button>
            )}
            <Button
              variant="outline"
              className="h-9"
              onClick={() => onExtend({ id: boost.product_id, name: boost.product_name ?? "Produit" })}
            >
              <Plus className="mr-1 h-3.5 w-3.5" /> Ajouter {7} jours — {formatFCFA(boostPriceFor(7))}
            </Button>
          </>
        )}
        <Button
          variant="ghost"
          className="h-9 text-muted-foreground"
          disabled={busy}
          onClick={() => {
            if (confirm("Arrêter définitivement cette mise en avant ? Le solde restant vous appartient.")) {
              onAct(boost.id, "ended");
            }
          }}
        >
          <Ban className="mr-1 h-3.5 w-3.5" /> Arrêter
        </Button>
      </div>
    </li>
  );
}
