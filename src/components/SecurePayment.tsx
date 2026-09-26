import { Link } from "@tanstack/react-router";
import { SERVICE_WHATSAPP } from "@/lib/constants";import {
  XAALISPAY,
  XAALISPAY_BENEFITS,
  XAALISPAY_OFFER,
  XAALISPAY_STEPS,
  claimMessage,
} from "@/lib/xaalispay";
import { Button } from "@/components/ui/button";
import { Check, ChevronDown, Gift, Lock, ShieldCheck, Smartphone, Store } from "lucide-react";

/**
 * LE BLOC DE CONFIANCE — pensé MOBILE D'ABORD.
 *
 * Sur une fiche produit, l'acheteur est au pouce, pressé, sur un petit écran.
 * Le bloc est donc :
 *   • COURT : la promesse + UN bouton plein largeur (44 px de haut minimum) ;
 *   • replié : les 4 étapes et les détails ne s'affichent que si on les demande ;
 *   • sans empilement de boutons : une seule action principale, les autres en
 *     liens texte discrets — jamais quatre boutons qui se battent pour la place.
 */
export function SecurePaymentBlock({
  variant = "buyer",
  proposalHref,
}: {
  variant?: "buyer" | "seller";
  /** Produit / prix, gardés pour compatibilité d'appel. */
  productName?: string;
  priceFcfa?: number | null;
  /** Lien WhatsApp pré-rempli avec la proposition de paiement protégé. */
  proposalHref?: string | null;
}) {
  const buyer = variant === "buyer";
  const benefits = buyer ? XAALISPAY_BENEFITS.buyer : XAALISPAY_BENEFITS.seller;

  return (
    <section className="mt-4 overflow-hidden rounded-2xl border border-cobalt/30 bg-cobalt/5">
      {/* ---------- Ce qu'on voit tout de suite ---------- */}
      <div className="flex items-start gap-3 p-3.5">
        <img
          src="/partners/xaalispay-mark.png"
          alt="XaalisPay"
          className="h-9 w-9 shrink-0 rounded-lg object-contain"
          loading="lazy"
          decoding="async"
        />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[13px] font-bold leading-tight">
            <Lock className="h-3.5 w-3.5 shrink-0 text-cobalt" />
            {buyer ? "Payer sans risque" : "Être payé avant de livrer"}
            <span className="text-muted-foreground">· XaalisPay</span>
          </p>
          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
            {buyer ? (
              <>
                Votre argent reste <strong className="text-foreground">bloqué</strong> jusqu'à la réception. S'il
                n'arrive pas, vous êtes remboursé.
              </>
            ) : (
              <>
                Le client paie <strong className="text-foreground">d'abord</strong> : vous livrez sans craindre les
                commandes fantômes.
              </>
            )}
          </p>
        </div>
      </div>

      {/* ---------- L'action principale, pleine largeur, sous le pouce ---------- */}
      <div className="space-y-2 px-3.5 pb-3.5">
        {buyer && proposalHref ? (
          <a href={proposalHref} target="_blank" rel="noopener noreferrer" className="block">
            <Button variant="volt" className="h-12 w-full text-sm font-bold">
              <ShieldCheck className="mr-1.5 h-4 w-4" /> Proposer le paiement protégé
            </Button>
          </a>
        ) : buyer ? (
          <a href={XAALISPAY.site} target="_blank" rel="noopener noreferrer" className="block">
            <Button variant="volt" className="h-12 w-full text-sm font-bold">
              <Smartphone className="mr-1.5 h-4 w-4" /> Installer XaalisPay
            </Button>
          </a>
        ) : (
          <a
            href={`https://wa.me/${SERVICE_WHATSAPP}?text=${encodeURIComponent(claimMessage("seller"))}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block"
          >
            <Button variant="volt" className="h-12 w-full text-sm font-bold">
              <Gift className="mr-1.5 h-4 w-4" /> Réclamer les 2 000 F de mise en avant
            </Button>
          </a>
        )}

        {/* Offre vendeur : elle ne concerne QUE le vendeur (StockMe ne paie
            jamais les frais de séquestre). */}
        {!buyer && (
          <p className="rounded-xl border border-volt/50 bg-volt/10 px-3 py-2 text-[11px] leading-snug">
            <strong className="text-foreground">{XAALISPAY_OFFER.seller.title}</strong>
            <span className="mt-0.5 block text-muted-foreground">{XAALISPAY_OFFER.seller.detail}</span>
          </p>
        )}

        {/* Liens secondaires : discrets, jamais en concurrence avec l'action */}
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pt-0.5 text-[11px]">
          <Link to="/paiement-securise" className="font-semibold text-cobalt underline underline-offset-2">
            Comment ça marche ?
          </Link>
          {buyer && (
            <a
              href={XAALISPAY.site}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground underline underline-offset-2"
            >
              Installer XaalisPay
            </a>
          )}
          {!buyer && (
            <a
              href={XAALISPAY.site}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground underline underline-offset-2"
            >
              Voir XaalisPay
            </a>
          )}
        </div>
      </div>

      {/* ---------- Les détails, repliés : on ne noie pas la page ---------- */}
      <details className="group border-t border-cobalt/20">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3.5 py-2.5 text-[11px] font-semibold">
          Les 4 étapes, et ce que ça change
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition group-open:rotate-180" />
        </summary>
        <div className="px-3.5 pb-3.5">
          <ol className="space-y-2">
            {XAALISPAY_STEPS.map((s) => (
              <li key={s.n} className="flex items-start gap-2.5">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-cobalt text-[10px] font-bold text-white">
                  {s.n}
                </span>
                <span className="min-w-0">
                  <span className="block text-[11px] font-bold leading-snug">{s.title}</span>
                  <span className="block text-[11px] leading-snug text-muted-foreground">{s.detail}</span>
                </span>
              </li>
            ))}
          </ol>

          <ul className="mt-3 space-y-1.5 border-t border-cobalt/20 pt-3">
            {benefits.map((b) => (
              <li key={b} className="flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                <span>{b}</span>
              </li>
            ))}
          </ul>

          <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
            XaalisPay facture sa protection à l'acheteur : le montant exact est affiché dans l'application avant que
            vous validiez. Aucun frais caché. Disponible au {XAALISPAY.countries.join(", ")} — paiement par{" "}
            {XAALISPAY.methods.join(", ")}.
          </p>
        </div>
      </details>
    </section>
  );
}

/**
 * Version ultra-courte pour les endroits où la place est comptée
 * (tableau de bord vendeur, encarts).
 */
export function SecurePaymentStrip({ variant = "buyer" }: { variant?: "buyer" | "seller" }) {
  return (
    <Link
      to="/paiement-securise"
      className="flex items-center gap-3 rounded-2xl border border-cobalt/30 bg-cobalt/5 p-3 transition hover:border-cobalt/60"
    >
      <img
        src="/partners/xaalispay-icon.png"
        alt=""
        className="h-9 w-9 shrink-0 rounded-lg object-contain"
        loading="lazy"
        decoding="async"
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-xs font-bold">
          {variant === "seller" ? (
            <Store className="h-3.5 w-3.5 text-cobalt" />
          ) : (
            <Lock className="h-3.5 w-3.5 text-cobalt" />
          )}
          {variant === "seller" ? "Soyez payé avant de livrer" : "Payez les yeux fermés"}
        </span>
        <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
          XaalisPay bloque l'argent jusqu'à la réception.{" "}
          <strong className="text-foreground">Voir comment ça marche →</strong>
        </span>
      </span>
    </Link>
  );
}
