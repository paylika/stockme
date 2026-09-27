import { Link } from "@tanstack/react-router";
import { formatFCFA } from "@/lib/format";
import type { WalletData } from "@/hooks/useWallet";
import { thumb } from "@/lib/img";
import { ChevronDown, Eye, Heart, MessageCircle, MousePointerClick, Percent, Rocket, Wallet } from "lucide-react";

/**
 * ONGLET STAT — les résultats, produit par produit, en clair.
 *
 * Objectif : que le vendeur puisse répondre en 5 secondes à « est-ce que ça
 * marche ? ». Donc peu de chiffres, mais les bons, et une phrase qui explique
 * quoi faire si ça ne marche pas.
 */
export function AdStats({ wallet, loading }: { wallet: WalletData | null; loading: boolean }) {
  if (loading) return <div className="h-40 rounded-2xl shimmer bg-muted" />;
  if (!wallet) return null;

  const boosts = wallet.boosts;
  if (boosts.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-center">
        <Rocket className="mx-auto h-7 w-7 text-muted-foreground" />
        <p className="mt-3 text-sm font-bold">Pas encore de chiffres</p>
        <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
          Dès qu'une mise en avant démarre, vous verrez ici les vues, les clics et les contacts reçus pour chaque
          produit.
        </p>
        <Link to="/profile" search={{ tab: "produits" }} className="mt-4 inline-block">
          <span className="text-xs font-bold text-volt underline underline-offset-2">Booster un produit →</span>
        </Link>
      </div>
    );
  }

  const totals = boosts.reduce(
    (acc, b) => {
      acc.impressions += b.impressions ?? 0;
      acc.clicks += b.clicks ?? 0;
      acc.contacts += b.product_contacts ?? 0;
      acc.views += b.product_views ?? 0;
      acc.spent += b.total_spent_fcfa ?? 0;
      acc.days += b.days_served ?? 0;
      return acc;
    },
    { impressions: 0, clicks: 0, contacts: 0, views: 0, spent: 0, days: 0 },
  );
  const ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
  const costPerContact = totals.contacts > 0 ? Math.round(totals.spent / totals.contacts) : null;

  return (
    <div className="space-y-4">
      {/* ---------- Le résumé, 4 chiffres ---------- */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <h3 className="text-sm font-bold tracking-tight">Tout confondu</h3>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Big label="Vues annonce" value={totals.impressions.toLocaleString("fr-FR")} icon={Eye} />
          <Big
            label="Contacts reçus"
            value={totals.contacts.toLocaleString("fr-FR")}
            icon={MessageCircle}
            highlight={totals.contacts > 0}
          />
          <Big
            label="Coût par contact"
            value={costPerContact !== null ? formatFCFA(costPerContact) : "—"}
            icon={Wallet}
            hint={costPerContact === null ? "aucun contact encore" : "pour un client intéressé"}
          />
          <Big label="Total dépensé" value={formatFCFA(totals.spent)} icon={Rocket} hint={`${totals.days} jours diffusés`} />
        </div>

        <details className="mt-3 rounded-xl bg-muted/50 px-3 py-2">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[11px] font-semibold">
            <ChevronDown className="h-3.5 w-3.5 shrink-0" /> Comment lire ces chiffres (et le taux de clic)
          </summary>
          <div className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-muted-foreground">
            <p>
              <strong className="text-foreground">Vues annonce</strong> : visiteurs <em>uniques</em> qui ont vu votre
              produit mis en avant (un même visiteur ne compte qu'une fois par jour).{" "}
              <strong className="text-foreground">Fiche vue</strong> : ouvertures de votre fiche, mise en avant
              comprise.
            </p>
            <p>
              <strong className="text-foreground">Taux de clic</strong> : {ctr.toFixed(1)} % — au-dessus de 2 %, c'est
              bon. Si les contacts restent à 0 après 2-3 jours, changez la{" "}
              <strong className="text-foreground">photo principale</strong> et le{" "}
              <strong className="text-foreground">prix</strong> : ce sont les deux leviers qui font écrire les
              acheteurs.
            </p>
          </div>
        </details>
      </div>

      {/* ---------- Une carte simple par produit ---------- */}
      <div className="space-y-3">
        {boosts.map((b) => {
          const adCtr = (b.impressions ?? 0) > 0 ? ((b.clicks ?? 0) / b.impressions) * 100 : 0;
          const perContact = (b.product_contacts ?? 0) > 0 ? Math.round(b.total_spent_fcfa / b.product_contacts) : null;
          const status =
            b.status === "active" ? "En diffusion" : b.status === "paused" ? "En pause" : "Terminée";
          return (
            <div key={b.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center gap-3">
                {b.images?.[0] ? (
                  <img src={thumb(b.images[0], 150)} alt="" loading="lazy" className="h-12 w-12 rounded-xl object-cover" />
                ) : (
                  <span className="grid h-12 w-12 place-items-center rounded-xl bg-muted text-muted-foreground">
                    <Rocket className="h-4 w-4" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <Link
                    to="/product/$id"
                    params={{ id: b.product_id }}
                    className="block truncate text-sm font-bold hover:text-primary"
                  >
                    {b.product_name ?? "Produit"}
                  </Link>
                  <p className="text-[11px] text-muted-foreground">
                    {status} · {b.days_served} jour{b.days_served > 1 ? "s" : ""} · {formatFCFA(b.daily_budget_fcfa)}{" "}
                    par jour
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${
                    b.status === "active"
                      ? "bg-success/15 text-success"
                      : b.status === "paused"
                        ? "bg-volt/20 text-foreground"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {status}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
                <Mini label="Vues" value={(b.impressions ?? 0).toLocaleString("fr-FR")} icon={Eye} />
                <Mini label="Clics" value={(b.clicks ?? 0).toLocaleString("fr-FR")} icon={MousePointerClick} />
                <Mini label="Taux" value={(b.impressions ?? 0) > 0 ? `${adCtr.toFixed(1)} %` : "—"} icon={Percent} />
                <Mini label="Fiche vue" value={(b.product_views ?? 0).toLocaleString("fr-FR")} icon={Heart} />
                <Mini
                  label="Contacts"
                  value={(b.product_contacts ?? 0).toLocaleString("fr-FR")}
                  icon={MessageCircle}
                  highlight={(b.product_contacts ?? 0) > 0}
                />
              </div>

              <p className="mt-2 text-[11px] text-muted-foreground">
                {formatFCFA(b.total_spent_fcfa)} dépensés
                {perContact !== null ? ` · ${formatFCFA(perContact)} par contact obtenu` : " · aucun contact pour l'instant"}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Big({
  label,
  value,
  icon: Icon,
  hint,
  highlight = false,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  hint?: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-background/60 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate text-[10px] font-semibold uppercase tracking-[0.12em]">{label}</span>
      </div>
      <p className={`mt-1 text-lg font-bold tracking-tight ${highlight ? "text-success" : ""}`}>{value}</p>
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Mini({
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
