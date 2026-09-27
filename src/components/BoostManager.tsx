import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { formatFCFA } from "@/lib/format";
import type { BoostRow, WalletData } from "@/hooks/useWallet";
import { toggleBoostStatus } from "@/components/SellerMoneyProvider";
import { boostDaysFor } from "@/lib/pricing";
import { thumb } from "@/lib/img";
import { Ban, Eye, MessageCircle, Pause, Play, Plus, Rocket, Wallet } from "lucide-react";

type Props = {
  wallet: WalletData | null;
  loading: boolean;
  /** Recharge : ouvre le portefeuille avec un montant pré-rempli. */
  onRecharge: (amount?: number, presets?: number[]) => void;
  /** Ajouter des jours à une annonce (ouvre la fenêtre de mise en avant). */
  onExtend: (product: { id: string; name: string }) => void;
  onChanged: () => void;
};

/**
 * GESTIONNAIRE D'ANNONCES — l'onglet Sponsorisation.
 *
 * VOLONTAIREMENT NU : on regarde ses annonces et on agit. Rien d'autre.
 *   • créer une annonce → onglet Produits (bouton Booster sur l'article)
 *   • le solde, les formules → onglet Portefeuille
 *   • les chiffres détaillés → onglet Stats
 * Chaque ligne : le produit, son état, deux chiffres (vues, contacts) et les
 * actions utiles. Aucun paragraphe, aucune explication au milieu.
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
        <p className="mt-3 text-sm font-bold">Aucune annonce</p>
        <p className="mx-auto mt-1 max-w-xs text-xs text-muted-foreground">
          Appuyez sur <strong className="text-foreground">Booster</strong> sur un de vos produits pour le mettre en
          tête de l'accueil.
        </p>
        <Link to="/profile" search={{ tab: "produits" }} className="mt-4 inline-block">
          <Button variant="volt" className="h-11">
            <Plus className="mr-1.5 h-4 w-4" /> Booster un produit
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Une seule ligne d'état, un seul bouton : le solde se gère dans Portefeuille. */}
      {dailySpend > 0 && daysLeft <= 2 && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-volt/50 bg-volt/10 px-3.5 py-3">
          <Wallet className="h-4 w-4 shrink-0 text-volt" />
          <span className="min-w-0 flex-1 text-xs">
            {daysLeft === 0 ? "Diffusion arrêtée : solde épuisé." : `Il reste ${daysLeft} jour${daysLeft > 1 ? "s" : ""}.`}{" "}
            <span className="text-muted-foreground">Rechargez pour continuer.</span>
          </span>
          <Button variant="volt" size="sm" className="h-9 shrink-0" onClick={() => onRecharge()}>
            Recharger
          </Button>
        </div>
      )}

      {/* EN DIFFUSION */}
      {running.length > 0 && (
        <ul className="space-y-2">
          {running.map((b) => (
            <AdRow
              key={b.id}
              boost={b}
              busy={busyId === b.id}
              live
              extra={
                <span className="font-semibold text-success">
                  ≈ {boostDaysFor(balance)} jour{boostDaysFor(balance) > 1 ? "s" : ""} restant
                  {boostDaysFor(balance) > 1 ? "s" : ""}
                </span>
              }
              onAct={act}
              onRecharge={onRecharge}
              onExtend={onExtend}
            />
          ))}
        </ul>
      )}

      {/* EN PAUSE */}
      {stopped.length > 0 && (
        <div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            En pause ({stopped.length})
          </p>
          <ul className="space-y-2">
            {stopped.map((b) => (
              <AdRow
                key={b.id}
                boost={b}
                busy={busyId === b.id}
                canResume={balance >= b.daily_budget_fcfa}
                onAct={act}
                onRecharge={onRecharge}
                onExtend={onExtend}
              />
            ))}
          </ul>
        </div>
      )}

      {/* TERMINÉES */}
      {ended.length > 0 && (
        <div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Terminées ({ended.length})
          </p>
          <ul className="space-y-2">
            {ended.map((b) => (
              <AdRow key={b.id} boost={b} busy={busyId === b.id} onAct={act} onRecharge={onRecharge} onExtend={onExtend} />
            ))}
          </ul>
        </div>
      )}

      <Link to="/profile" search={{ tab: "produits" }} className="block">
        <Button variant="outline" className="h-11 w-full text-sm font-bold">
          <Plus className="mr-1.5 h-4 w-4" /> Booster un autre produit
        </Button>
      </Link>
    </div>
  );
}

/** Une annonce = une ligne : produit, état, 2 chiffres, actions. */
function AdRow({
  boost,
  busy,
  live = false,
  canResume,
  extra,
  onAct,
  onRecharge,
  onExtend,
}: {
  boost: BoostRow;
  busy: boolean;
  live?: boolean;
  canResume?: boolean;
  extra?: React.ReactNode;
  onAct: (id: string, next: "active" | "paused" | "ended") => void;
  onRecharge: (amount?: number, presets?: number[]) => void;
  onExtend: (product: { id: string; name: string }) => void;
}) {
  const paused = boost.status === "paused";
  const finished = boost.status === "ended" || boost.status === "completed";
  const product = { id: boost.product_id, name: boost.product_name ?? "Produit" };

  return (
    <li className="rounded-2xl border border-border bg-card p-3">
      <div className="flex items-center gap-3">
        {boost.images?.[0] ? (
          <img
            src={thumb(boost.images[0], 150)}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-12 w-12 shrink-0 rounded-xl object-cover"
          />
        ) : (
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
            <Rocket className="h-4 w-4" />
          </span>
        )}

        <div className="min-w-0 flex-1">
          <Link
            to="/product/$id"
            params={{ id: boost.product_id }}
            className="block truncate text-sm font-bold hover:text-primary"
          >
            {product.name}
          </Link>
          <p className="flex flex-wrap items-center gap-x-3 text-[11px] text-muted-foreground">
            <span>
              {formatFCFA(boost.daily_budget_fcfa)}/jour · {boost.days_served} j
            </span>
            <span className="inline-flex items-center gap-1">
              <Eye className="h-3 w-3" /> {(boost.impressions ?? 0).toLocaleString("fr-FR")}
            </span>
            <span className="inline-flex items-center gap-1">
              <MessageCircle className="h-3 w-3" /> {boost.product_contacts ?? 0}
            </span>
            {live && extra}
          </p>
        </div>

        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
            live
              ? "bg-success/15 text-success"
              : paused
                ? "bg-volt/20 text-foreground"
                : "bg-muted text-muted-foreground"
          }`}
        >
          {live ? "En ligne" : paused ? "En pause" : "Terminée"}
        </span>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-2">
        {live && (
          <>
            <Button variant="volt" size="sm" className="h-9" onClick={() => onExtend(product)}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Ajouter des jours
            </Button>
            <Button variant="outline" size="sm" className="h-9" disabled={busy} onClick={() => onAct(boost.id, "paused")}>
              <Pause className="mr-1 h-3.5 w-3.5" /> Pause
            </Button>
          </>
        )}

        {paused &&
          (canResume ? (
            <Button variant="volt" size="sm" className="h-9" disabled={busy} onClick={() => onAct(boost.id, "active")}>
              <Play className="mr-1 h-3.5 w-3.5" /> Reprendre
            </Button>
          ) : (
            <Button variant="volt" size="sm" className="h-9" onClick={() => onRecharge(balance0(boost, canResume))}>
              <Wallet className="mr-1 h-3.5 w-3.5" /> Recharger pour reprendre
            </Button>
          ))}

        {(paused || finished) && (
          <Button variant="outline" size="sm" className="h-9" onClick={() => onExtend(product)}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Ajouter des jours
          </Button>
        )}

        {!finished && (
          <Button
            variant="ghost"
            size="sm"
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
        )}
      </div>
    </li>
  );
}

/** Montant à recharger pour couvrir une journée (utilisé par « Recharger pour reprendre »). */
function balance0(boost: BoostRow, _canResume?: boolean) {
  return boost.daily_budget_fcfa * 7;
}
