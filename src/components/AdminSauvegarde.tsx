import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ensureSession } from "@/lib/auth-session";
import { Download, Loader2, ShieldCheck } from "lucide-react";

/**
 * BOUTON DE SAUVEGARDE DE LA BASE.
 *
 * POURQUOI CE BOUTON EXISTE : l'offre gratuite de la base de données ne fournit
 * aucune sauvegarde. Si un script se trompe ou si une table est vidée par
 * erreur, il n'existe aujourd'hui aucun moyen de revenir en arrière — et tout
 * le travail de tes vendeurs serait perdu.
 *
 * Un clic rassemble tes données essentielles (annonces, profils, paiements,
 * portefeuilles, demandes, favoris, statistiques des 90 derniers jours) dans un
 * fichier que tu ranges où tu veux. À faire une fois par semaine.
 *
 * Aucun mot de passe, aucun jeton de connexion n'est inclus dans le fichier.
 */
export function AdminSauvegarde() {
  const [encours, setEncours] = useState(false);
  const [message, setMessage] = useState("");

  const telecharger = async () => {
    setEncours(true);
    setMessage("Préparation du fichier…");
    try {
      const session = await ensureSession();
      if (!session?.access_token) {
        setMessage("Session expirée : reconnectez-vous.");
        return;
      }
      const reponse = await fetch("/api/jobs/sauvegarde", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!reponse.ok) {
        setMessage("La sauvegarde a échoué. Réessayez dans un instant.");
        return;
      }
      const contenu = await reponse.blob();
      const lien = document.createElement("a");
      lien.href = URL.createObjectURL(contenu);
      lien.download = `stockme-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(lien);
      lien.click();
      lien.remove();
      // On libère la mémoire du navigateur une fois le téléchargement lancé.
      setTimeout(() => URL.revokeObjectURL(lien.href), 30_000);
      setMessage(
        `Fichier téléchargé (${(contenu.size / 1024 / 1024).toFixed(1)} Mo). Rangez-le en lieu sûr — c'est votre filet de sécurité.`,
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Erreur pendant la sauvegarde.");
    } finally {
      setEncours(false);
    }
  };

  return (
    <div className="rounded-2xl border border-volt/40 bg-volt/5 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-volt/20 text-volt">
          <ShieldCheck className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-base font-semibold">Sauvegarde de vos données</h2>
          <p className="text-sm text-muted-foreground">
            <strong className="font-semibold text-foreground">Aujourd'hui, il n'existe aucune sauvegarde</strong> : si un
            script se trompe, tout le travail de vos vendeurs disparaît. Téléchargez ce fichier une fois par semaine et
            rangez-le (téléphone, Drive, clé USB). Il ne contient aucun mot de passe.
          </p>
        </div>
        <Button variant="volt" onClick={telecharger} disabled={encours}>
          {encours ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
          {encours ? "Préparation…" : "Télécharger la sauvegarde"}
        </Button>
      </div>
      {message && <p className="mt-4 text-sm font-medium">{message}</p>}
    </div>
  );
}
