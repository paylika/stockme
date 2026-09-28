import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ensureSession } from "@/lib/auth-session";
import { ImageIcon, Loader2 } from "lucide-react";

/**
 * BOUTON DE RATTRAPAGE DES VIGNETTES PHOTOS.
 *
 * POURQUOI CE BOUTON EXISTE : les photos envoyées avant la mise en place des
 * vignettes passent encore par un service d'images tiers gratuit — 1,5 à 4
 * secondes d'attente PAR IMAGE (mesuré). Cette tâche fabrique la vignette
 * manquante et la range à côté de la photo : après le rattrapage, les listes
 * servent nos propres vignettes, sans aucun détour extérieur.
 *
 * AUCUN SECRET À RETENIR : le bouton utilise la session d'administrateur déjà
 * ouverte. La tâche est idempotente (elle ne refait jamais deux fois le même
 * travail), donc on peut relancer autant de fois qu'on veut.
 *
 * On peut fermer la page : le travail déjà fait est conservé et il suffit de
 * recliquer plus tard pour continuer là où on s'était arrêté.
 */
const LOT = 25; // photos par appel : assez pour avancer, assez court pour ne pas couper
const LOTS_MAX = 15; // par clic : environ 375 photos

export function AdminVignettes() {
  const [encours, setEncours] = useState(false);
  const [faites, setFaites] = useState(0);
  const [restantes, setRestantes] = useState<number | null>(null);
  const [message, setMessage] = useState("");

  const lancer = async (lotsMaximum = LOTS_MAX) => {
    setEncours(true);
    setMessage("Préparation…");
    let totalFaites = faites;
    let dernieresRestantes: number | null = null;

    try {
      for (let lot = 0; lot < lotsMaximum; lot++) {
        const session = await ensureSession();
        if (!session?.access_token) {
          setMessage("Session expirée : reconnectez-vous.");
          break;
        }
        const reponse = await fetch(`/api/jobs/vignettes?limite=${LOT}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const donnees = (await reponse.json()) as {
          error?: string;
          reussies?: number;
          restantes_estimees?: number;
          traitees?: number;
          suite?: string;
        };
        if (!reponse.ok) {
          setMessage(donnees.error ?? "La tâche a refusé la demande.");
          break;
        }

        totalFaites += donnees.reussies ?? 0;
        dernieresRestantes = donnees.restantes_estimees ?? 0;
        setFaites(totalFaites);
        setRestantes(dernieresRestantes);
        setMessage(
          `${totalFaites} photo(s) convertie(s) — ${dernieresRestantes} restante(s)${dernieresRestantes > 0 ? "…" : "."}`,
        );

        if ((donnees.traitees ?? 0) === 0) {
          setMessage("Aucune photo à convertir : tout est déjà à jour 🎉");
          break;
        }
        if (dernieresRestantes === 0) {
          setMessage(`${totalFaites} photo(s) convertie(s) — rattrapage terminé 🎉`);
          break;
        }
      }

      if (dernieresRestantes && dernieresRestantes > 0) {
        setMessage(
          `${totalFaites} photo(s) convertie(s) — ${dernieresRestantes} restante(s). Cliquez à nouveau pour continuer (le travail déjà fait est conservé).`,
        );
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Erreur pendant le rattrapage.");
    } finally {
      setEncours(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-volt/15 text-volt">
          <ImageIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-base font-semibold">Vignettes des photos</h2>
          <p className="text-sm text-muted-foreground">
            Convertit les photos déjà en ligne pour qu'elles s'affichent <strong className="font-semibold text-foreground">instantanément</strong>{" "}
            (aujourd'hui chaque photo fait un détour par un service extérieur : 1,5 à 4 secondes d'attente).
            Rien n'est supprimé, tout est relançable.
          </p>
        </div>
        <Button variant="volt" onClick={() => lancer()} disabled={encours}>
          {encours ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {encours ? "Conversion en cours…" : "Rattraper les vignettes"}
        </Button>
      </div>

      {(message || restantes !== null) && (
        <div className="mt-4 space-y-2">
          <p className="text-sm font-medium">{message}</p>
          {restantes !== null && restantes > 0 && (
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-volt transition-all duration-500"
                style={{ width: `${Math.min(100, Math.round((faites / Math.max(1, faites + restantes)) * 100))}%` }}
              />
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Vous pouvez fermer la page : ce qui est déjà converti le reste, et un nouveau clic reprendra la suite.
          </p>
        </div>
      )}
    </div>
  );
}
