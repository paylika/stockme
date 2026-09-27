import { Star } from "lucide-react";

/**
 * ÉTOILES DE NOTATION — composant isolé VOLONTAIREMENT.
 *
 * POURQUOI CE FICHIER EXISTE : les étoiles étaient exportées par
 * `ProductReviews.tsx`. Or `ProductCard` (rendu 24 à 100 fois sur l'accueil et
 * le catalogue) importait `Stars`… et entraînait donc tout `ProductReviews`
 * dans le lot initial : la fenêtre de dépôt d'avis ET la compression d'images
 * (`image-upload`, 5,5 Ko de canvas) étaient téléchargées par **chaque visiteur
 * de l'accueil**, juste pour dessiner 5 étoiles.
 *
 * Ici : un seul composant, une seule dépendance (l'icône), rien d'autre.
 */
export function Stars({ value, size = "sm" }: { value: number; size?: "xs" | "sm" | "md" }) {
  const px = size === "xs" ? "h-3 w-3" : size === "md" ? "h-5 w-5" : "h-4 w-4";
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} sur 5`}>
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = value >= i ? 1 : value >= i - 0.5 ? 0.5 : 0;
        return (
          <span key={i} className={`relative inline-block ${px}`}>
            <Star className={`absolute inset-0 ${px} text-muted-foreground/40`} />
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
              <Star className={`${px} fill-volt text-volt`} />
            </span>
          </span>
        );
      })}
    </span>
  );
}
