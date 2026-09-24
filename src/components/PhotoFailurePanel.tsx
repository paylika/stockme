import { AlertTriangle, RefreshCw } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import type { UploadFailure } from "@/lib/image-upload";

type Props = {
  failures: UploadFailure[];
  published: boolean;
  retrying: boolean;
  status?: string;
  onRetry: () => void;
  productId?: string;
};

/**
 * Bandeau affiché quand le produit est publié mais que certaines photos
 * n'ont pas pu être envoyées : l'article reste en ligne, la photo peut
 * être renvoyée sans ressaisir le formulaire.
 */
export function PhotoFailurePanel({ failures, published, retrying, status, onRetry, productId }: Props) {
  if (failures.length === 0) return null;

  return (
    <div className="rounded-2xl border border-volt/40 bg-volt/10 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-volt" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">
            {published
              ? failures.length === 1
                ? "Produit publié ✅ — 1 photo n'a pas pu être envoyée"
                : `Produit publié ✅ — ${failures.length} photos n'ont pas pu être envoyées`
              : failures.length === 1
              ? "1 photo n'a pas pu être envoyée"
              : `${failures.length} photos n'ont pas pu être envoyées`}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {published
              ? "Votre article est bien en ligne : aucune information n'est perdue. Renvoyez simplement la photo ci-dessous."
              : "Vos informations sont conservées. Renvoyez la photo ci-dessous."}
          </p>

          <ul className="mt-2 space-y-1">
            {failures.map((f, i) => (
              <li key={`${f.fileName}-${i}`} className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{f.fileName}</span> — {f.reason}
              </li>
            ))}
          </ul>

          {status && <p className="mt-2 text-xs font-medium text-foreground">{status}</p>}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button type="button" variant="volt" className="h-10" onClick={onRetry} disabled={retrying}>
              <RefreshCw className={`h-4 w-4 ${retrying ? "animate-spin" : ""}`} />
              {retrying ? "Nouvel envoi…" : "Réessayer l'envoi"}
            </Button>
            {published && productId && (
              <Link
                to="/dashboard/edit/$id"
                params={{ id: productId }}
                className="inline-flex h-10 items-center rounded-md border border-border bg-background px-3 text-sm font-medium hover:bg-accent"
              >
                Modifier l'article
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
