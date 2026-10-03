import { useCallback, useEffect, useState } from "react";
import { ensureSession } from "@/lib/auth-session";
import { Loader2, Wallet } from "lucide-react";

/**
 * RETRAIT DE L'ARGENT STOCKME — directement depuis la page d'administration.
 *
 * Affiche ce que tu as gagné et ce que tu peux retirer, puis envoie l'argent
 * sur ton compte mobile money en un clic. Sans ce bloc, il fallait passer par
 * le portail de XaalisPay.
 *
 * Rien n'est automatique : c'est toi qui décides quand retirer.
 */
type Solde = { enSequestre: number; disponible: number; bloque: number; dejaVerse: number };

const fcfa = (n: number) => `${new Intl.NumberFormat("fr-FR").format(Math.round(n))} F`;

export function AdminRetrait() {
  const [solde, setSolde] = useState<Solde | null>(null);
  const [encours, setEncours] = useState(false);
  const [message, setMessage] = useState("");

  const charger = useCallback(async () => {
    try {
      const session = await ensureSession();
      if (!session?.access_token) return;
      const res = await fetch("/api/jobs/retrait", { headers: { Authorization: `Bearer ${session.access_token}` } });
      const donnees = (await res.json()) as { ok?: boolean; solde?: Solde; error?: string };
      if (donnees.ok && donnees.solde) setSolde(donnees.solde);
    } catch {
      /* le solde s'affichera au prochain essai */
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  const retirer = async () => {
    setEncours(true);
    setMessage("Demande de retrait en cours…");
    try {
      const session = await ensureSession();
      if (!session?.access_token) {
        setMessage("Session expirée : reconnectez-vous.");
        return;
      }
      const res = await fetch("/api/jobs/retrait", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const donnees = (await res.json()) as {
        ok?: boolean;
        error?: string;
        retrait?: { montant: number; net: number; frais: number; statut: string };
        solde?: Solde;
      };
      if (donnees.solde) setSolde(donnees.solde);
      if (!donnees.ok || !donnees.retrait) {
        setMessage(donnees.error ?? "Retrait impossible pour le moment.");
        return;
      }
      const { montant, net, frais, statut } = donnees.retrait;
      setMessage(
        statut === "succeeded"
          ? `Retrait réussi : ${fcfa(montant)} demandés, ${fcfa(net)} envoyés sur votre numéro (frais ${fcfa(frais)}).`
          : `Retrait ${fcfa(montant)} en cours de traitement (${fcfa(net)} à recevoir, frais ${fcfa(frais)}). Vous recevrez une confirmation.`,
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Erreur pendant le retrait.");
    } finally {
      setEncours(false);
    }
  };

  const rienARetirer = !solde || solde.disponible < 100;

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-volt/15 text-volt">
          <Wallet className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-base font-semibold">Vos gains — retrait mobile money</h2>
          <p className="text-sm text-muted-foreground">
            {solde ? (
              <>
                Disponible : <strong className="font-semibold text-foreground">{fcfa(solde.disponible)}</strong>
                {solde.enSequestre > 0 && <> · en séquestre : {fcfa(solde.enSequestre)}</>}
                {solde.dejaVerse > 0 && <> · déjà versé : {fcfa(solde.dejaVerse)}</>}
                {solde.bloque > 0 && <> · bloqué (litige) : {fcfa(solde.bloque)}</>}
                <br />
              </>
            ) : (
              "Chargement du solde… "
            )}
            L'argent est envoyé sur votre numéro Wave enregistré (frais XaalisPay : 3,5 %, prélevés uniquement si le retrait réussit).
          </p>
        </div>
        <button
          type="button"
          onClick={retirer}
          disabled={encours || rienARetirer}
          className="inline-flex h-11 items-center justify-center rounded-xl bg-volt px-5 text-sm font-bold text-volt-foreground transition hover:brightness-110 disabled:opacity-50"
        >
          {encours ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {encours ? "Envoi…" : "Retirer tout"}
        </button>
      </div>
      {message && <p className="mt-4 text-sm font-medium">{message}</p>}
    </div>
  );
}
