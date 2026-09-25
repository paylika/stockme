import { Link, useCanGoBack, useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

type Props = {
  /** Destination de secours si l'historique est vide (arrivée directe sur la page). */
  fallback?: string;
  label?: string;
  className?: string;
};

/**
 * « Retour » intelligent.
 *
 * Avant, ce bouton renvoyait TOUJOURS à l'accueil : un acheteur qui venait de
 * /browse (ou d'une boutique) et qui consultait une fiche perdait sa place et
 * devait tout rescroller. Maintenant on revient à la page PRÉCÉDENTE, avec sa
 * position de défilement (voir ScrollKeeper), et on retombe sur l'accueil
 * uniquement si l'on est arrivé directement sur la fiche.
 */
export function BackLink({
  fallback = "/",
  label = "Retour",
  className = "inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground",
}: Props) {
  const canGoBack = useCanGoBack();
  const router = useRouter();

  if (!canGoBack) {
    return (
      <Link to={fallback} className={className}>
        <ArrowLeft className="h-4 w-4" /> {label}
      </Link>
    );
  }

  return (
    <button type="button" onClick={() => router.history.back()} className={className}>
      <ArrowLeft className="h-4 w-4" /> {label}
    </button>
  );
}
