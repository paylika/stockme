import { formatFCFA } from "@/lib/format";
import type { WalletData } from "@/hooks/useWallet";
import { thumb } from "@/lib/img";
import { ProChip } from "@/components/VerifiedBadge";
import { ChevronDown, Eye, Heart, MessageCircle, MousePointerClick, Percent, Rocket, TrendingUp, Wallet } from "lucide-react";

export type TrendPoint = { day: string; value: number };

/**
 * ONGLET STATS — refonte complète, pensée pour être LU, pas décortiqué.
 *
 * Le vendeur veut répondre à une seule question : « est-ce que ça marche, et
 * qu'est-ce que je fais maintenant ? ». Donc trois blocs, dans cet ordre :
 *   1. La boutique en 4 chiffres + le taux de contact (le vrai indicateur santé).
 *   2. Le trafic jour par jour (barres, lisible d'un coup d'œil).
 *   3. Mes annonces, une ligne par produit, avec le coût par contact.
 * Le reste (pays, explications) est là mais replié : personne ne le lit tous les jours.
 */
export function AdStats({
  wallet,
  loading,
  sellerStats,
}: {
  wallet: WalletData | null;
  loading: boolean;
  sellerStats?: {
    total_views?: number;
    total_contacts?: number;
    total_favorites?: number;
    stock_value?: number;
    countries?: { country: string | null; value: number }[];
    trend?: TrendPoint[];
  } | null;
}) {
  const boosts = wallet?.boosts ?? [];
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

  const shopViews = sellerStats?.total_views ?? 0;
  const shopContacts = sellerStats?.total_contacts ?? 0;
  const contactRate = shopViews > 0 ? (shopContacts / shopViews) * 100 : 0;
  const costPerContact = totals.contacts > 0 ? Math.round(totals.spent / totals.contacts) : null;

  const trend = (sellerStats?.trend ?? []).slice(-14);
  const trendMax = Math.max(1, ...trend.map((t) => t.value ?? 0));

  return (
    <div className="space-y-4">
      {/* Rappel discret : ces chiffres sont un avantage Vendeur Pro. */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-volt/40 bg-volt/10 px-3.5 py-2.5">
        <ProChip />
        <p className="min-w-0 flex-1 text-[11px] leading-snug text-muted-foreground">
          Statistiques détaillées réservées aux Vendeurs Pro — vous voyez ce qui rapporte, produit par produit.
        </p>
      </div>

      {/* ---------- 1. Les 4 chiffres qui comptent ---------- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Big label="Vues de mes fiches" value={shopViews.toLocaleString("fr-FR")} icon={Eye} />
        <Big
          label="Contacts reçus"
          value={shopContacts.toLocaleString("fr-FR")}
          icon={MessageCircle}
          highlight={shopContacts > 0}
        />
        <Big
          label="Taux de contact"
          value={shopViews > 0 ? `${contactRate.toFixed(1)} %` : "—"}
          icon={TrendingUp}
          hint="au-dessus de 5 %, c'est bien"
          highlight={contactRate >= 5}
        />
        <Big label="Favoris" value={(sellerStats?.total_favorites ?? 0).toLocaleString("fr-FR")} icon={Heart} />
      </div>

      {/* ---------- 2. Le trafic, jour par jour ---------- */}
      {trend.length > 1 && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-bold tracking-tight">Vos vues, jour par jour</h3>
            <span className="text-[11px] text-muted-foreground">
              {trend.reduce((s, t) => s + (t.value ?? 0), 0).toLocaleString("fr-FR")} vues sur {trend.length} jours
            </span>
          </div>
          <div className="mt-3 flex h-24 items-end gap-1">
            {trend.map((t) => (
              <span
                key={t.day}
                title={`${t.day} : ${t.value} vue${t.value > 1 ? "s" : ""}`}
                className="flex-1 rounded-t bg-volt/70 transition hover:bg-volt"
                style={{ height: `${Math.max(4, ((t.value ?? 0) / trendMax) * 100)}%` }}
              />
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
            <span>{trend[0]?.day}</span>
            <span>{trend[trend.length - 1]?.day}</span>
          </div>
        </div>
      )}

      {/* ---------- 3. Mes mises en avant ---------- */}
      {boosts.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-bold tracking-tight">Mes mises en avant</h3>
            <span className="text-[11px] text-muted-foreground">
              {formatFCFA(totals.spent)} dépensés · {totals.days} jours diffusés
            </span>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Mini label="Vues annonce" value={totals.impressions.toLocaleString("fr-FR")} icon={Eye} />
            <Mini label="Clics" value={totals.clicks.toLocaleString("fr-FR")} icon={MousePointerClick} />
            <Mini
              label="Contacts"
              value={totals.contacts.toLocaleString("fr-FR")}
              icon={MessageCircle}
              highlight={totals.contacts > 0}
            />
            <Mini
              label="Prix du contact"
              value={costPerContact !== null ? formatFCFA(costPerContact) : "—"}
              icon={Wallet}
              highlight={costPerContact !== null && costPerContact <= 2000}
            />
          </div>

          <ul className="mt-4 space-y-2">
            {boosts.map((b) => {
              const ctr = (b.impressions ?? 0) > 0 ? ((b.clicks ?? 0) / b.impressions) * 100 : 0;
              const per = (b.product_contacts ?? 0) > 0 ? Math.round(b.total_spent_fcfa / b.product_contacts) : null;
              return (
                <li key={b.id} className="flex items-center gap-3 border-t border-border pt-2.5">
                  {b.images?.[0] ? (
                    <img
                      src={thumb(b.images[0], 150)}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="h-10 w-10 shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                      <Rocket className="h-4 w-4" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-bold">{b.product_name ?? "Produit"}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {b.days_served} j · {b.impressions ?? 0} vues · {b.clicks ?? 0} clics ({ctr.toFixed(1)} %) ·{" "}
                      {b.product_contacts ?? 0} contact{(b.product_contacts ?? 0) > 1 ? "s" : ""}
                      {per !== null ? ` · ${formatFCFA(per)}/contact` : ""}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 text-[10px] font-bold ${
                      b.status === "active" ? "text-success" : "text-muted-foreground"
                    }`}
                  >
                    {b.status === "active" ? "En ligne" : b.status === "paused" ? "En pause" : "Terminée"}
                  </span>
                </li>
              );
            })}
          </ul>

          <details className="mt-3 rounded-xl bg-muted/50 px-3 py-2">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[11px] font-semibold">
              <ChevronDown className="h-3.5 w-3.5 shrink-0" /> Comment lire ces chiffres
            </summary>
            <div className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-muted-foreground">
              <p>
                <strong className="text-foreground">Vues annonce</strong> : visiteurs <em>uniques</em> qui ont vu votre
                produit mis en avant. <strong className="text-foreground">Fiche vue</strong> : ouvertures de votre
                fiche, mise en avant comprise.
              </p>
              <p>
                Un taux de clic au-dessus de <strong className="text-foreground">2 %</strong> est bon. Si les contacts
                restent à 0 après 2-3 jours, changez la <strong className="text-foreground">photo principale</strong>{" "}
                et le <strong className="text-foreground">prix</strong> : ce sont les deux leviers qui font écrire les
                acheteurs.
              </p>
            </div>
          </details>
        </div>
      )}

      {/* ---------- 4. D'où viennent les acheteurs + valeur du stock (replié) ---------- */}
      {((sellerStats?.countries?.length ?? 0) > 0 || sellerStats?.stock_value) && (
        <details className="rounded-2xl border border-border bg-card p-4">
          <summary className="cursor-pointer text-sm font-bold">
            Détails : pays des acheteurs{sellerStats?.stock_value ? " et valeur du stock" : ""}
          </summary>
          {sellerStats?.stock_value ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Valeur de votre stock en ligne :{" "}
              <strong className="text-foreground">{formatFCFA(sellerStats.stock_value)}</strong>
            </p>
          ) : null}
          {(sellerStats?.countries?.length ?? 0) > 0 && (
            <ul className="mt-3 space-y-2">
              {(sellerStats?.countries ?? []).slice(0, 8).map((c) => {
                const total = (sellerStats?.countries ?? []).reduce((s, x) => s + x.value, 0) || 1;
                const pct = Math.round((c.value / total) * 100);
                return (
                  <li key={c.country ?? "?"}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium">{c.country || "Non identifié"}</span>
                      <span className="text-muted-foreground">
                        {c.value} vue{c.value > 1 ? "s" : ""} · {pct} %
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-volt" style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </details>
      )}

      {loading && boosts.length === 0 && (
        <div className="h-24 rounded-2xl shimmer bg-muted" />
      )}
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
    <div className="rounded-2xl border border-border bg-card p-3.5">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4 shrink-0" />
        <span className="truncate text-[10px] font-semibold uppercase tracking-[0.14em]">{label}</span>
      </div>
      <p className={`mt-1.5 text-2xl font-bold tracking-tight ${highlight ? "text-success" : ""}`}>{value}</p>
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
    <div className="rounded-xl bg-muted/50 px-3 py-2">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-[10px] font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <p className={`mt-0.5 text-base font-bold ${highlight ? "text-success" : ""}`}>{value}</p>
    </div>
  );
}
