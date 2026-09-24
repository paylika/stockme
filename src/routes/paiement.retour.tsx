import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/stockme-client";
import { Header } from "@/components/Header";
import { MobileNav } from "@/components/MobileNav";
import { MobileFooter } from "@/components/MobileFooter";
import { Button } from "@/components/ui/button";
import { usePaymentsStatus } from "@/lib/features";
import { formatFCFA } from "@/lib/format";
import { CheckCircle2, Clock, XCircle } from "lucide-react";

/**
 * Retour du navigateur après un paiement (Wave, Orange Money, carte).
 * La source de vérité reste le webhook : cette page ne fait qu'afficher
 * l'état réel de l'intention de paiement, en interrogeant la base.
 */

type Intent = {
  id: string;
  purpose: string;
  amount_fcfa: number;
  status: string;
  provider: string;
  method: string | null;
};

const LABELS: Record<string, string> = {
  wallet_topup: "Rechargement du solde",
  boost: "Mise en avant d'un produit",
  subscription: "Abonnement fournisseur vérifié",
};

export const Route = createFileRoute("/paiement/retour")({
  validateSearch: (s: Record<string, unknown>) => ({
    intent: typeof s.intent === "string" ? s.intent : undefined,
    status: typeof s.status === "string" ? s.status : undefined,
  }),
  head: () => ({
    meta: [{ title: "Paiement — StockMe" }, { name: "robots", content: "noindex" }],
    links: [],
  }),
  component: PaymentReturn,
});

function PaymentReturn() {
  const { intent: intentId, status: callbackStatus } = Route.useSearch();
  const payments = usePaymentsStatus();
  const [intent, setIntent] = useState<Intent | null>(null);
  const [loading, setLoading] = useState(true);
  const [tries, setTries] = useState(0);

  // On interroge la base quelques fois : le webhook du fournisseur peut
  // arriver 2 à 10 secondes après le retour du navigateur.
  useEffect(() => {
    if (!intentId) {
      setLoading(false);
      return;
    }
    let cancel = false;
    const check = async () => {
      const { data } = await supabase
        .from("payment_intents")
        .select("id,purpose,amount_fcfa,status,provider,method")
        .eq("id", intentId)
        .maybeSingle();
      if (cancel) return;
      setIntent((data as Intent | null) ?? null);
      setLoading(false);
    };
    check();
    const timer = window.setInterval(() => {
      setTries((t) => {
        if (t >= 8) {
          window.clearInterval(timer);
          return t;
        }
        check();
        return t + 1;
      });
    }, 3000);
    return () => {
      cancel = true;
      window.clearInterval(timer);
    };
  }, [intentId]);

  const paid = intent?.status === "paid";
  const cancelled = callbackStatus === "cancel";

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="mx-auto max-w-lg px-4 py-10 sm:px-6 sm:py-16">
        {!payments.loading && !payments.enabled ? (
          <div className="text-center">
            <Clock className="mx-auto h-12 w-12 text-muted-foreground" />
            <h1 className="mt-4 text-2xl font-bold">Paiement en ligne bientôt disponible</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Le paiement automatique est en cours d'activation. En attendant, la vérification de votre boutique se
              fait par Wave ou Orange Money, directement depuis votre profil.
            </p>
            <Link to="/profile" className="mt-6 inline-block">
              <Button variant="volt" className="h-11">Voir mon compte</Button>
            </Link>
          </div>
        ) : loading ? (
          <div className="text-center text-sm text-muted-foreground">Vérification du paiement…</div>
        ) : !intentId || (!intent && !cancelled) ? (
          <div className="text-center">
            <XCircle className="mx-auto h-12 w-12 text-muted-foreground" />
            <h1 className="mt-4 text-2xl font-bold">Paiement introuvable</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Ce lien de paiement n'est plus valide. Si vous avez été débité, contactez le support StockMe.
            </p>
            <Link to="/profile" className="mt-6 inline-block">
              <Button variant="volt" className="h-11">Retour à mon compte</Button>
            </Link>
          </div>
        ) : paid ? (
          <div className="text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-success" />
            <h1 className="mt-4 text-2xl font-bold">Paiement confirmé</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {formatFCFA(intent?.amount_fcfa ?? 0)} — {LABELS[intent?.purpose ?? ""] ?? "Paiement"}
            </p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Link to="/profile">
                <Button variant="volt" className="h-11 w-full">Voir mon compte</Button>
              </Link>
              <Link to="/dashboard">
                <Button variant="outline" className="h-11 w-full">Mon stock</Button>
              </Link>
            </div>
          </div>
        ) : cancelled ? (
          <div className="text-center">
            <XCircle className="mx-auto h-12 w-12 text-destructive" />
            <h1 className="mt-4 text-2xl font-bold">Paiement annulé</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Aucun montant n'a été prélevé. Vous pouvez réessayer quand vous voulez.
            </p>
            <Link to="/profile" className="mt-6 inline-block">
              <Button variant="volt" className="h-11">Réessayer</Button>
            </Link>
          </div>
        ) : (
          <div className="text-center">
            <Clock className="mx-auto h-12 w-12 text-volt" />
            <h1 className="mt-4 text-2xl font-bold">Paiement en cours de vérification</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Si vous avez validé le paiement sur votre téléphone, l'activation prend quelques secondes.
              Vous pouvez fermer cette page : tout se fera automatiquement.
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              {formatFCFA(intent?.amount_fcfa ?? 0)} — {LABELS[intent?.purpose ?? ""] ?? ""}
            </p>
            <Link to="/profile" className="mt-6 inline-block">
              <Button variant="outline" className="h-11">Retour à mon compte</Button>
            </Link>
          </div>
        )}
      </div>
      <MobileFooter />
      <MobileNav />
    </div>
  );
}
