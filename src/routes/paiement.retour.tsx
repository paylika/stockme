import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/stockme-client";
import { Header } from "@/components/Header";
import { MobileNav } from "@/components/MobileNav";
import { MobileFooter } from "@/components/MobileFooter";
import { Button } from "@/components/ui/button";
import { usePaymentsStatus } from "@/lib/features";
import { useAuth } from "@/hooks/useAuth";
import { isAdminEmail } from "@/lib/constants";
import { formatFCFA } from "@/lib/format";
import { goToCheckout } from "@/lib/pay-client";
import { planById, PRO_AVAILABLE } from "@/lib/pricing";
import { CheckCircle2, Clock, XCircle, Sparkles } from "lucide-react";

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
  metadata?: Record<string, unknown> | null;
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
  const { user } = useAuth();
  const [intent, setIntent] = useState<Intent | null>(null);
  const [loading, setLoading] = useState(true);
  const [tries, setTries] = useState(0);
  const [stepLoading, setStepLoading] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);

  // Même règle de visibilité que le reste du paiement : ouverte au public le
  // jour où l'interrupteur est activé, visible en aperçu pour les admins.
  const paymentsLive = payments.enabled || (isAdminEmail(user?.email) && payments.methods.length > 0);

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
        .select("id,purpose,amount_fcfa,status,provider,method,metadata")
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

  // Pack « badge 1 an + PRO » : le badge est encaissé d'abord, puis on propose
  // la 2e étape (PRO mensuel). Tant que PRO est masqué, cette étape disparaît :
  // le vendeur repart simplement avec son badge actif.
  const proPlan = planById("pro");
  const proMonthly = proPlan?.price ?? 2500;
  const packStep2 = PRO_AVAILABLE && paid && intent?.metadata?.next_step === "pro";

  const activatePro = async () => {
    setStepError(null);
    setStepLoading(true);
    try {
      await goToCheckout({
        purpose: "subscription",
        amount: proMonthly,
        method: "card",
        metadata: { days: proPlan?.days ?? 30, plan: "pro", source: "pack_step2" },
      });
    } catch (e) {
      setStepError(e instanceof Error ? e.message : "Paiement impossible pour le moment.");
      setStepLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="mx-auto max-w-lg px-4 py-10 sm:px-6 sm:py-16">
        {!payments.loading && !paymentsLive ? (
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
            {packStep2 ? (
              <div className="mt-6 rounded-2xl border border-volt/40 bg-volt/5 p-4 text-left">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-volt" />
                  <p className="text-sm font-semibold">Votre badge est actif ✓</p>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Dernière étape : activez StockMe PRO — {formatFCFA(proMonthly)}/mois (au lieu de 3 500 F).
                  Mise en avant à 400 F/jour et 72 h offertes chaque mois. Résiliable à tout moment.
                </p>
                <Button
                  variant="volt"
                  className="mt-3 h-11 w-full"
                  disabled={stepLoading}
                  onClick={activatePro}
                >
                  {stepLoading ? "Ouverture du paiement…" : `Activer PRO — ${formatFCFA(proMonthly)}/mois`}
                </Button>
                {stepError ? <p className="mt-2 text-xs text-destructive">{stepError}</p> : null}
                <Link to="/profile" className="mt-2 block text-center text-xs text-muted-foreground underline">
                  Plus tard
                </Link>
              </div>
            ) : (
              <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
                <Link to="/profile">
                  <Button variant="volt" className="h-11 w-full">Voir mon compte</Button>
                </Link>
                <Link to="/dashboard">
                  <Button variant="outline" className="h-11 w-full">Mon stock</Button>
                </Link>
              </div>
            )}
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
