import { createFileRoute, Link } from "@tanstack/react-router";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { MobileNav } from "@/components/MobileNav";
import { MobileFooter } from "@/components/MobileFooter";
import { Button } from "@/components/ui/button";
import { buildSeoHead } from "@/lib/seo";
import { XAALISPAY, XAALISPAY_BENEFITS, XAALISPAY_OFFER, XAALISPAY_STEPS } from "@/lib/xaalispay";
import { AlertTriangle, Check, Gift, Lock, ShieldCheck, Smartphone, Store } from "lucide-react";

export const Route = createFileRoute("/paiement-securise")({
  head: () => {
    const { meta, links } = buildSeoHead({
      title: "Paiement sécurisé en gros — payez sans risque avec XaalisPay | StockMe",
      description:
        "Comment payer un fournisseur sans se faire arnaquer : XaalisPay bloque votre argent jusqu'à la réception de la marchandise. 4 étapes, Wave et Orange Money, remboursé si le colis n'arrive pas. Pour les acheteurs et pour les vendeurs de StockMe.",
      path: "/paiement-securise",
      keywords:
        "paiement sécurisé grossiste, éviter arnaque achat en gros, XaalisPay, séquestre, Wave, Orange Money, Sénégal, Côte d'Ivoire, Mali, Bénin, Togo, payer en ligne sans risque",
    });
    return { meta, links };
  },
  component: SecurePaymentPage,
});

const FAQ = [
  {
    q: "Pourquoi payer avant la livraison ?",
    a: "Parce que l'argent ne va PAS au vendeur : il reste bloqué chez XaalisPay. Vous engagez votre commande, mais vous gardez le contrôle. Vous avez 30 minutes après la réception pour vérifier et ouvrir un litige si ça ne va pas ; sinon le vendeur est payé automatiquement.",
  },
  {
    q: "Que se passe-t-il si le vendeur ne livre jamais ?",
    a: "Vous êtes remboursé. C'est XaalisPay qui garde les fonds, donc personne ne peut disparaître avec votre argent.",
  },
  {
    q: "Et si la marchandise n'est pas conforme ?",
    a: "Vous ouvrez un litige pendant les 30 minutes de vérification : l'argent reste bloqué le temps que la situation soit réglée.",
  },
  {
    q: "Combien ça coûte ?",
    a: `Les frais de protection sont affichés avant que vous validiez (constatés à ${XAALISPAY.protectionFee.toLocaleString("fr-FR")} FCFA par commande protégée chez XaalisPay). Aucun frais caché, et vous voyez le montant exact avant de payer.`,
  },
  {
    q: "Qui détient l'argent pendant la transaction ?",
    a: "XaalisPay, tiers de confiance basé à Dakar. Ni le vendeur, ni vous.",
  },
  {
    q: "Mes informations sont-elles partagées avec le vendeur ?",
    a: "Non. Le vendeur voit la commande, pas vos moyens de paiement. Vous payez via Wave, Orange Money ou Free Money.",
  },
  {
    q: "Le vendeur reçoit son argent quand ?",
    a: "Dès que vous validez la réception — ou automatiquement 30 minutes après la livraison si vous ne signalez rien.",
  },
];

function SecurePaymentPage() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
        {/* ---------- Le problème, dit franchement ---------- */}
        <span className="inline-flex items-center gap-1.5 rounded-full bg-cobalt/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-cobalt">
          <ShieldCheck className="h-3.5 w-3.5" /> Paiement sécurisé
        </span>
        <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-4xl">
          Achetez en gros sans risquer votre argent
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
          Sur StockMe, les vendeurs et les acheteurs se trouvent ici, mais la transaction se conclut sur WhatsApp. Et
          là, il n'y a <strong className="text-foreground">aucune protection</strong> : vous envoyez l'argent à un
          inconnu à 600 km et vous espérez. C'est le premier frein au commerce de gros en ligne en Afrique de l'Ouest —
          et c'est exactement ce que XaalisPay règle.
        </p>

        <div className="mt-4 flex flex-wrap items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 p-3 text-xs leading-relaxed">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <span>
            <strong className="text-foreground">Côté vendeur, c'est pareil :</strong> faux rendez-vous, client qui
            change d'avis, livraison faite et jamais payée. Résultat : on n'ose plus livrer avant d'être payé, et on
            perd des ventes.
          </span>
        </div>

        {/* ---------- La solution ---------- */}
        <section className="mt-6 rounded-2xl border border-cobalt/30 bg-cobalt/5 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <img
              src="/partners/xaalispay-mark.png"
              alt="XaalisPay"
              className="h-11 w-11 shrink-0 rounded-xl object-contain"
            />
            <div className="min-w-0">
              <h2 className="text-base font-bold tracking-tight">
                XaalisPay bloque l'argent jusqu'à la réception
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                « Payez les yeux fermés, ouvrez-les à la réception. » XaalisPay est un tiers de confiance basé à Dakar :
                il garde les fonds pendant la transaction, vous livrez ou vous recevez, puis l'argent est libéré.{" "}
                <strong className="text-foreground">{XAALISPAY.countries.join(", ")}</strong> · paiement par{" "}
                {XAALISPAY.methods.join(", ")}.
              </p>
            </div>
          </div>

          <ol className="mt-4 grid gap-3 sm:grid-cols-2">
            {XAALISPAY_STEPS.map((s) => (
              <li key={s.n} className="flex items-start gap-3 rounded-xl bg-background p-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-cobalt text-[11px] font-bold text-white">
                  {s.n}
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-bold leading-snug">{s.title}</span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{s.detail}</span>
                </span>
              </li>
            ))}
          </ol>

          {/* Téléchargement : plein largeur sur téléphone, côte à côte sur ordinateur */}
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <a href={XAALISPAY.appStore} target="_blank" rel="noopener noreferrer" className="block sm:inline-block">
              <Button variant="volt" className="h-12 w-full text-sm font-bold sm:w-auto">
                <Smartphone className="mr-1.5 h-4 w-4" /> Télécharger sur App Store
              </Button>
            </a>
            <a href={XAALISPAY.playStore} target="_blank" rel="noopener noreferrer" className="block sm:inline-block">
              <Button variant="outline" className="h-12 w-full text-sm font-bold sm:w-auto">
                <Smartphone className="mr-1.5 h-4 w-4" /> Disponible sur Google Play
              </Button>
            </a>
            <a href={XAALISPAY.site} target="_blank" rel="noopener noreferrer" className="block sm:inline-block">
              <Button variant="ghost" className="h-12 w-full text-xs sm:w-auto">
                Voir le site de XaalisPay
              </Button>
            </a>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            L'acheteur paie et suit sa commande dans l'application, le vendeur y encaisse après livraison.
          </p>
        </section>

        {/* ---------- Les deux côtés ---------- */}
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <section className="rounded-2xl border border-border bg-card p-4">
            <h2 className="flex items-center gap-2 text-sm font-bold">
              <Lock className="h-4 w-4 text-cobalt" /> Si vous achetez
            </h2>
            <ul className="mt-2 space-y-1.5">
              {XAALISPAY_BENEFITS.buyer.map((b) => (
                <li key={b} className="flex items-start gap-1.5 text-xs leading-snug text-muted-foreground">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" /> <span>{b}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 rounded-xl bg-muted/60 px-3 py-2 text-[11px] leading-relaxed">
              <strong className="text-foreground">Comment faire :</strong> sur la fiche du produit, appuyez sur{" "}
              <strong className="text-foreground">« Proposer le paiement protégé »</strong> — le message part déjà
              rédigé vers le vendeur.
            </p>
          </section>

          <section className="rounded-2xl border border-border bg-card p-4">
            <h2 className="flex items-center gap-2 text-sm font-bold">
              <Store className="h-4 w-4 text-cobalt" /> Si vous vendez
            </h2>
            <ul className="mt-2 space-y-1.5">
              {XAALISPAY_BENEFITS.seller.map((b) => (
                <li key={b} className="flex items-start gap-1.5 text-xs leading-snug text-muted-foreground">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" /> <span>{b}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 rounded-xl bg-muted/60 px-3 py-2 text-[11px] leading-relaxed">
              <strong className="text-foreground">Le réflexe qui rapporte :</strong> quand un acheteur vous propose
              XaalisPay, c'est un client sérieux qui veut payer TOUT DE SUITE — dites oui, vous êtes payé à la
              réception.
            </p>
            <p className="mt-2 flex items-start gap-1.5 rounded-xl border border-volt/50 bg-volt/10 px-3 py-2 text-[11px] leading-relaxed">
              <Gift className="mt-0.5 h-3.5 w-3.5 shrink-0 text-volt" />
              <span>
                <strong className="text-foreground">{XAALISPAY_OFFER.seller.title}</strong>
                <span className="mt-0.5 block text-muted-foreground">{XAALISPAY_OFFER.seller.detail}</span>
              </span>
            </p>
          </section>
        </div>

        {/* ---------- FAQ ---------- */}
        <section className="mt-8">
          <h2 className="text-lg font-bold tracking-tight">Vos questions, sans détour</h2>
          <div className="mt-3 space-y-2">
            {FAQ.map((f) => (
              <details key={f.q} className="rounded-xl border border-border bg-card px-3 py-2.5">
                <summary className="cursor-pointer text-xs font-bold">{f.q}</summary>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <p className="mt-6 rounded-2xl bg-muted/50 px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">
          <strong className="text-foreground">À savoir :</strong> StockMe met en relation vendeurs et acheteurs et ne
          touche pas aux paiements entre eux. XaalisPay est un service indépendant qui sécurise votre transaction :
          vous restez libres de l'utiliser ou non, et StockMe ne prend aucune commission dessus.
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          <Link to="/browse">
            <Button variant="volt" className="h-12 text-sm font-bold">
              Trouver un fournisseur
            </Button>
          </Link>
          <Link to="/demandes">
            <Button variant="outline" className="h-12 text-sm font-bold">
              Voir les demandes d'achat
            </Button>
          </Link>
        </div>
      </div>

      <MobileFooter />
      <Footer />
      <MobileNav />
    </div>
  );
}
