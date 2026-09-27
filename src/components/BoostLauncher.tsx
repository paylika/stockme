import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/stockme-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatFCFA } from "@/lib/format";
import {
  BOOST_DAY_PRICE,
  BOOST_DEFAULT_DAYS,
  BOOST_MAX_DAYS,
  BOOST_MIN_DAYS,
  BOOST_PACKS,
  boostDayPrice,
  boostDaysFor,
  boostPriceFor,
  boostSavingsFor,
} from "@/lib/pricing";
import { clearBoostIntent, readBoostIntent, saveBoostIntent } from "@/lib/boost-intent";
import { thumb } from "@/lib/img";
import { CheckCircle2, ImageOff, Pause, Rocket, Sparkles, Wallet } from "lucide-react";
import { toast } from "sonner";

type ProductLite = {
  id: string;
  name: string;
  images: string[] | null;
  published: boolean;
};

type CampaignLite = {
  product_id: string;
  status: string;
  days_served: number;
};

type Props = {
  /** Produits du vendeur (on ne propose que ceux réellement en ligne). */
  products: ProductLite[] | null;
  balance: number;
  campaigns: CampaignLite[];
  onTopUp: (amount?: number, presets?: number[]) => void;
  onStarted: () => void;
};

/** Montants des 3 formules : 7 000 / 15 000 / 30 000 F. */
const PACK_AMOUNTS = BOOST_PACKS.map((p) => boostPriceFor(p.days));

/**
 * Lancer une mise en avant SANS quitter la page Sponsorisation :
 *   ① le produit — ② la durée — ③ payer ou activer.
 *
 * Le prix est le même pour tout le monde (1 000 F par jour) : la durée EST le
 * montant (7 jours = 7 000 F, 30 jours = 30 000 F), il n'y a donc rien à
 * comprendre. Si le solde ne suffit pas, on paie exactement ce qu'il faut et le
 * choix (produit + durée) est mémorisé pour le retour du paiement.
 */
export function BoostLauncher({ products, balance, campaigns, onTopUp, onStarted }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [days, setDays] = useState(BOOST_DEFAULT_DAYS);
  /** Le sélecteur de durée est replié par défaut : un seul choix à comprendre. */
  const [showDays, setShowDays] = useState(false);
  const [customDays, setCustomDays] = useState("");
  const [busy, setBusy] = useState(false);
  const [resumed, setResumed] = useState<string | null>(null);
  /**
   * LE MEILLEUR CANDIDAT À BOOSTER.
   * Le vendeur ne sait pas quel produit mettre en avant : on lui DÉSIGNE celui
   * que les acheteurs regardent déjà (vues + favoris des 30 derniers jours).
   * On lui évite la seule question qui le bloquait : « lequel ? ».
   */
  const [best, setBest] = useState<{ id: string; name: string; views: number; favorites: number } | null>(null);

  const live = (products ?? []).filter((p) => p.published);

  useEffect(() => {
    const mine = new Set((products ?? []).map((p) => p.id));
    if (mine.size === 0) return;
    let cancel = false;
    supabase
      .rpc("get_ranked_products", { p_sort: "populaire", p_limit: 60, p_offset: 0 })
      .then(({ data }) => {
        if (cancel) return;
        const rows = (data as { id: string; views_30?: number; favorites?: number }[] | null) ?? [];
        const mineRows = rows
          .filter((r) => mine.has(r.id))
          .map((r) => ({ ...r, score: (r.views_30 ?? 0) + (r.favorites ?? 0) * 3 }))
          .sort((a, b) => b.score - a.score);
        const top = mineRows[0];
        if (!top || top.score <= 0) return;
        const product = (products ?? []).find((p) => p.id === top.id);
        if (!product) return;
        setBest({
          id: top.id,
          name: product.name,
          views: top.views_30 ?? 0,
          favorites: top.favorites ?? 0,
        });
        setSelectedId((prev) => prev ?? top.id);
      });
    return () => {
      cancel = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products]);

  // Au retour d'un paiement, on retrouve le produit et la durée déjà choisis.
  useEffect(() => {
    const intent = readBoostIntent();
    if (!intent) return;
    setSelectedId(intent.productId);
    setDays(intent.days);
    setCustomDays("");
    setResumed(intent.productName);
  }, []);

  const selected = live.find((p) => p.id === selectedId) ?? live[0] ?? null;
  const campaign = selected ? campaigns.find((c) => c.product_id === selected.id) : undefined;
  const campaignActive = campaign?.status === "active";

  const wanted = customDays ? Math.floor(Number(customDays)) : days;
  const validDays = Number.isFinite(wanted) && wanted >= BOOST_MIN_DAYS ? Math.min(wanted, BOOST_MAX_DAYS) : 0;
  /** Tarif dégressif : 1 000 F/jour jusqu'à 10 jours, puis 900, puis 800. */
  const dayPrice = boostDayPrice(validDays);
  const needed = boostPriceFor(validDays);
  const saving = boostSavingsFor(validDays);
  const missing = Math.max(0, needed - balance);
  const canStart = balance >= dayPrice;
  const covers = validDays > 0 && balance >= needed;
  const daysWithBalance = boostDaysFor(balance);

  const activate = async () => {
    if (!selected) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("boost_start", {
      p_product_id: selected.id,
      // On transmet le TARIF DU JOUR de la durée choisie : c'est lui qui est
      // débité chaque jour, donc la remise s'applique pour de vrai.
      p_daily_budget: boostDayPrice(validDays),
    });
    setBusy(false);
    if (error) return toast.error(error.message);

    const res = data as { ok?: boolean; reason?: string } | null;
    if (res?.ok === false && res.reason === "insufficient_balance") {
      toast.error(`Il faut au moins ${formatFCFA(dayPrice)} de solde pour démarrer.`);
      return;
    }

    clearBoostIntent();
    setResumed(null);
    toast.success(
      `« ${selected.name} » passe en tête de l'accueil — ${formatFCFA(dayPrice)} par jour, environ ${daysWithBalance} jour${daysWithBalance > 1 ? "s" : ""}.`,
      { duration: 7000 },
    );
    onStarted();
  };

  const pay = () => {
    if (!selected) return;
    saveBoostIntent({ productId: selected.id, productName: selected.name, days: validDays });
    onTopUp(needed, PACK_AMOUNTS);
  };

  if (products !== null && live.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-5 text-center">
        <Rocket className="mx-auto h-6 w-6 text-muted-foreground" />
        <p className="mt-2 text-sm font-semibold">Publiez d'abord un produit</p>
        <p className="mt-1 text-xs text-muted-foreground">
          La mise en avant s'applique à un produit en ligne : publiez-en un, puis revenez ici.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-volt/40 bg-volt/5 p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="inline-flex items-center gap-2 text-base font-bold tracking-tight">
          <Rocket className="h-5 w-5 text-volt" /> Mettre un produit en avant
        </h3>
        <span className="text-xs font-semibold text-muted-foreground">
          {formatFCFA(BOOST_DAY_PRICE)} pour 1 jour · moins cher si vous prenez plus de jours
        </span>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        Votre produit passe <strong className="text-foreground">en tête de l'accueil</strong> et dans le carrousel, vu
        par les acheteurs de votre région. Vous suivez les vues et les contacts reçus, et vous mettez en pause quand
        vous voulez.
      </p>

      {resumed && (
        <p className="mt-3 flex items-start gap-2 rounded-xl border border-volt/40 bg-background px-3 py-2 text-[11px] leading-relaxed">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-volt" />
          <span>
            Votre choix est conservé : <strong className="text-foreground">{resumed}</strong>. Si votre paiement vient
            d'être confirmé, appuyez sur <strong className="text-foreground">Activer</strong> ci-dessous.
          </span>
        </p>
      )}

      {/* ① Le produit */}
      <p className="mt-4 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">1. Le produit</p>

      {/* Le conseil : on désigne LE produit à booster au lieu de laisser choisir
          au hasard. C'est la question qui bloquait le vendeur. */}
      {best && (
        <div className="mt-2 flex items-start gap-2.5 rounded-xl border border-volt/50 bg-background px-3 py-2.5">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-volt" />
          <span className="min-w-0 flex-1 text-[11px] leading-relaxed">
            <strong className="text-foreground">Commencez par « {best.name} »</strong> : c'est votre produit le plus
            regardé ({best.views} vue{best.views > 1 ? "s" : ""}
            {best.favorites > 0 ? `, ${best.favorites} favori${best.favorites > 1 ? "s" : ""}` : ""} ces 30 derniers
            jours) — donc celui qui a le plus de chances de rapporter.
          </span>
        </div>
      )}

      {live.length === 1 ? (
        <p className="mt-2 flex items-center gap-2 text-sm font-semibold">
          {live[0].images?.[0] ? (
            <img src={thumb(live[0].images[0], 150)} alt="" decoding="async" className="h-10 w-10 rounded-lg object-cover" />
          ) : (
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-muted text-muted-foreground">
              <ImageOff className="h-4 w-4" />
            </span>
          )}
          {live[0].name}
        </p>
      ) : (
        <div className="no-scrollbar -mx-1 mt-2 flex snap-x gap-2.5 overflow-x-auto px-1 pb-1">
          {live.map((p) => {
            const active = selected?.id === p.id;
            const state = campaigns.find((c) => c.product_id === p.id)?.status;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedId(p.id)}
                className={`w-24 shrink-0 snap-start overflow-hidden rounded-xl border-2 bg-background text-left transition sm:w-28 ${
                  active ? "border-volt" : "border-border hover:border-foreground/30"
                }`}
              >
                <span className="block aspect-square w-full overflow-hidden bg-muted">
                  {p.images?.[0] ? (
                    <img src={thumb(p.images[0], 150)} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                  ) : (
                    <span className="grid h-full place-items-center text-muted-foreground">
                      <ImageOff className="h-4 w-4" />
                    </span>
                  )}
                </span>
                <span className="flex items-center justify-between gap-1 px-1.5 py-1">
                  <span className="truncate text-[10px] font-semibold">{p.name}</span>
                  {state === "active" && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-success" />}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* ② La durée — PAR DÉFAUT 1 JOUR = 1 000 F (le prix d'entrée).
          Il est beaucoup plus facile de sortir 1 000 F que 7 000 F : le vendeur
          essaie un jour, voit l'effet, puis allonge s'il veut. Plus la durée est
          longue, moins la journée coûte (900 F/jour dès 11 jours, 800 F dès 21). */}
      <p className="mt-4 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
        2. Combien de jours
      </p>
      <div className="mt-2 rounded-xl border-2 border-volt bg-volt/10 p-3">
        <div className="flex items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="block text-base font-bold leading-tight">
              {validDays} jour{validDays > 1 ? "s" : ""} — {formatFCFA(needed)}
            </span>
            <span className="mt-0.5 block text-[11px] text-muted-foreground">
              soit {formatFCFA(dayPrice)} par jour
              {saving > 0 ? (
                <span className="font-semibold text-success"> · vous économisez {formatFCFA(saving)}</span>
              ) : (
                " · le prix d'entrée"
              )}
            </span>
          </span>
          <button
            type="button"
            onClick={() => setShowDays((v) => !v)}
            className="shrink-0 text-[11px] font-semibold text-cobalt underline underline-offset-2"
          >
            {showDays ? "Réduire" : "Changer la durée"}
          </button>
        </div>

        {showDays && (
          <>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {BOOST_PACKS.map((p) => {
                const active = !customDays && days === p.days;
                const packPrice = boostPriceFor(p.days);
                const packSaving = boostSavingsFor(p.days);
                return (
                  <button
                    key={p.days}
                    type="button"
                    onClick={() => {
                      setDays(p.days);
                      setCustomDays("");
                    }}
                    className={`relative rounded-xl border-2 px-1.5 py-2.5 text-center transition ${
                      active ? "border-volt bg-volt text-volt-foreground" : "border-border bg-background hover:bg-accent"
                    }`}
                  >
                    {p.popular && !active && (
                      <span className="absolute -top-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-foreground px-1.5 py-0.5 text-[9px] font-bold text-background">
                        conseillé
                      </span>
                    )}
                    <span className="block text-lg font-bold leading-tight">{p.days} j</span>
                    <span className={`block text-sm font-bold ${active ? "" : "text-foreground"}`}>
                      {formatFCFA(packPrice)}
                    </span>
                    <span className={`block text-[10px] ${active ? "opacity-80" : "text-muted-foreground"}`}>
                      {packSaving > 0 ? `−${formatFCFA(packSaving)}` : p.label}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Input
                type="number"
                inputMode="numeric"
                min={BOOST_MIN_DAYS}
                max={BOOST_MAX_DAYS}
                placeholder={`Autre durée (${BOOST_MIN_DAYS} à ${BOOST_MAX_DAYS} jours)`}
                value={customDays}
                onChange={(e) => setCustomDays(e.target.value)}
                className="h-10 w-40"
              />
              <span className="text-[11px] text-muted-foreground">
                {formatFCFA(BOOST_DAY_PRICE)} le jour, puis {formatFCFA(900)} dès 11 jours et{" "}
                {formatFCFA(800)} dès 21 jours.
              </span>
            </div>
          </>
        )}
      </div>

      {/* ③ Payer, ou activer si le solde suffit */}
      <p className="mt-4 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">3. Lancer</p>
      <div className="mt-2 space-y-2">
        {campaignActive ? (
          <>
            <p className="flex items-center gap-1.5 text-xs font-semibold text-success">
              <CheckCircle2 className="h-3.5 w-3.5" /> « {selected?.name} » est déjà en diffusion (
              {campaign?.days_served} jour{(campaign?.days_served ?? 0) > 1 ? "s" : ""} payé
              {(campaign?.days_served ?? 0) > 1 ? "s" : ""}).
            </p>
            <Button variant="volt" className="h-12 w-full text-sm font-bold" disabled={validDays < 1} onClick={pay}>
              <Wallet className="mr-1.5 h-4 w-4" /> Ajouter {validDays} jour{validDays > 1 ? "s" : ""} —{" "}
              {formatFCFA(needed)}
            </Button>
            <p className="text-[11px] text-muted-foreground">
              Chaque jour coûte {formatFCFA(dayPrice)} : recharger revient à ajouter des jours de diffusion.
            </p>
          </>
        ) : covers ? (
          <Button variant="volt" className="h-12 w-full text-sm font-bold" disabled={busy || !selected} onClick={activate}>
            {busy
              ? "Activation…"
              : `${campaign ? "Relancer" : "Activer"} — ${validDays} jour${validDays > 1 ? "s" : ""} (${formatFCFA(needed)})`}
          </Button>
        ) : (
          <>
            <Button variant="volt" className="h-12 w-full text-sm font-bold" disabled={validDays < 1 || !selected} onClick={pay}>
              <Wallet className="mr-1.5 h-4 w-4" /> Payer {formatFCFA(needed)} — {validDays} jour
              {validDays > 1 ? "s" : ""}
            </Button>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Solde actuel : {formatFCFA(balance)} · il manque{" "}
              <strong className="text-destructive">{formatFCFA(missing)}</strong>. Après le paiement, votre choix est
              conservé : la mise en avant démarre d'un seul appui.
            </p>
            {canStart && (
              <Button variant="outline" className="h-11 w-full" disabled={busy || !selected} onClick={activate}>
                Démarrer tout de suite avec mon solde (≈ {daysWithBalance} jour
                {daysWithBalance > 1 ? "s" : ""})
              </Button>
            )}
          </>
        )}
        {campaign && !campaignActive && (
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Pause className="h-3.5 w-3.5" /> Cette mise en avant est en pause : elle reprendra à l'activation, sans
            rien perdre.
          </p>
        )}
      </div>
    </div>
  );
}
