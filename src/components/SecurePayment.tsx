import { Link } from "@tanstack/react-router";
import { formatFCFA } from "@/lib/format";
import { SERVICE_WHATSAPP } from "@/lib/constants";
import {
  XAALISPAY,
  XAALISPAY_BENEFITS,
  XAALISPAY_OFFER,
  XAALISPAY_STEPS,
  claimMessage,
} from "@/lib/xaalispay";
import { Button } from "@/components/ui/button";
import { Check, Gift, Lock, ShieldCheck, Smartphone, Store } from "lucide-react";

const SUPPORT_TEL = SERVICE_WHATSAPP;

/**
 * LE BLOC DE CONFIANCE — affiché au moment exact où l'argent se décide.
 *
 * Sur une fiche produit, juste sous le bouton WhatsApp : c'est là que l'acheteur
 * se demande « et si je paie et qu'il ne livre pas ? ». Une bannière en haut de
 * page ne sert à rien ; ce bloc-là répond à la question au bon moment.
 *
 * `variant="buyer"`  → sur les fiches produits et les boutiques
 * `variant="seller"` → dans l'espace vendeur (leur bénéfice, à eux)
 */
export function SecurePaymentBlock({
  variant = "buyer",
  productName,
  priceFcfa,
  proposalHref,
}: {
  variant?: "buyer" | "seller";
  productName?: string;
  priceFcfa?: number | null;
  /** Lien WhatsApp pré-rempli avec la proposition de paiement protégé. */
  proposalHref?: string | null;
}) {
  const benefits = variant === "seller" ? XAALISPAY_BENEFITS.seller : XAALISPAY_BENEFITS.buyer;

  return (
    <section className="mt-4 overflow-hidden rounded-2xl border border-cobalt/30 bg-cobalt/5">
      {/* En-tête : logo partenaire + promesse */}
      <div className="flex items-start gap-3 border-b border-cobalt/20 bg-white/60 p-4">
        <img
          src="/partners/xaalispay-mark.png"
          alt="XaalisPay"
          className="h-10 w-10 shrink-0 rounded-xl object-contain"
          loading="lazy"
          decoding="async"
        />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-bold">
            <Lock className="h-3.5 w-3.5 text-cobalt" />
            {variant === "seller"
              ? "Encaissez avant de livrer, en toute sécurité"
              : "Payer sans risque, avec XaalisPay"}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {variant === "seller" ? (
              <>
                Le client paie d'abord : l'argent est <strong className="text-foreground">bloqué chez XaalisPay</strong>{" "}
                (Wave, Orange Money, Free Money). Vous livrez sans craindre les commandes fantômes, et vous êtes payé
                automatiquement à la réception.
              </>
            ) : (
              <>
                Ici, on ne vous demande pas de faire confiance : votre argent reste{" "}
                <strong className="text-foreground">bloqué chez XaalisPay</strong> jusqu'à ce que vous ayez reçu et
                vérifié la marchandise.
              </>
            )}
          </p>
        </div>
      </div>

      {/* Les 4 étapes, en clair */}
      <ol className="grid gap-2 p-4 sm:grid-cols-2">
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

      {/* Ce que ça change concrètement */}
      <ul className="grid gap-1.5 px-4 sm:grid-cols-2">
        {benefits.map((b) => (
          <li key={b} className="flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
            <span>{b}</span>
          </li>
        ))}
      </ul>

      {/* L'offre de lancement : la raison de faire le premier pas aujourd'hui */}
      <div className="mx-4 mt-4 flex items-start gap-2.5 rounded-xl border border-volt/50 bg-volt/10 px-3 py-2.5">
        <Gift className="mt-0.5 h-4 w-4 shrink-0 text-volt" />
        <span className="min-w-0 text-xs leading-relaxed">
          <strong className="text-foreground">
            {variant === "seller" ? XAALISPAY_OFFER.seller.title : XAALISPAY_OFFER.buyer.title}
          </strong>
          <span className="mt-0.5 block text-muted-foreground">
            {variant === "seller" ? XAALISPAY_OFFER.seller.detail : XAALISPAY_OFFER.buyer.detail}
          </span>
        </span>
      </div>

      {/* Actions : la proposition à envoyer, puis l'installation */}
      <div className="mt-4 flex flex-wrap gap-2 border-t border-cobalt/20 p-4">
        {proposalHref && variant === "buyer" ? (
          <a href={proposalHref} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1">
            <Button variant="volt" className="h-12 w-full text-sm font-bold">
              <ShieldCheck className="mr-1.5 h-4 w-4" /> Proposer le paiement protégé
            </Button>
          </a>
        ) : null}

        <a href={XAALISPAY.site} target="_blank" rel="noopener noreferrer">
          <Button variant={proposalHref && variant === "buyer" ? "outline" : "volt"} className="h-12 text-sm font-bold">
            <Smartphone className="mr-1.5 h-4 w-4" /> Installer XaalisPay
          </Button>
        </a>

        <a
          href={`https://wa.me/${SUPPORT_TEL}?text=${encodeURIComponent(claimMessage(variant))}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Button variant="ghost" className="h-12 text-xs font-semibold">
            <Gift className="mr-1.5 h-3.5 w-3.5 text-volt" /> Réclamer l'offre
          </Button>
        </a>

        <Link to="/paiement-securise" className="min-w-0">
          <Button variant="ghost" className="h-12 text-xs">
            Comment ça marche ?
          </Button>
        </Link>
      </div>

      {variant === "buyer" && (
        <p className="px-4 pb-4 text-[11px] leading-relaxed text-muted-foreground">
          Frais de protection : {formatFCFA(XAALISPAY.protectionFee)} par commande protégée
          {priceFcfa ? ` — soit ${formatFCFA(XAALISPAY.protectionFee)} sur ${formatFCFA(priceFcfa)}` : ""}. Disponible au{" "}
          {XAALISPAY.countries.join(", ")}.
        </p>
      )}
    </section>
  );
}

/**
 * Version ultra-courte, à poser partout où la place manque
 * (encart produit, espace vendeur, tunnel de paiement).
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
          {variant === "seller" ? <Store className="h-3.5 w-3.5 text-cobalt" /> : <Lock className="h-3.5 w-3.5 text-cobalt" />}
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
