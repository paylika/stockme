import { compressImage, MAX_PHOTO_SIZE } from "@/lib/image-upload";

/**
 * Recherche par image : stockage de la photo entre la barre de recherche et la
 * page de résultats.
 *
 * On ne peut pas passer un fichier dans l'URL : la photo choisie dans la barre
 * de recherche est donc rangée ici (en mémoire), puis la page /recherche-image
 * la récupère au chargement. Même principe que `mobile-action.ts`.
 */
export type PendingImage = {
  file: File;
  /** Aperçu local (objectURL) pour montrer la photo analysée. */
  preview: string;
};

let pending: PendingImage | null = null;

/** Range la photo à analyser (déjà compressée). */
export function setPendingImage(file: File): void {
  if (pending) URL.revokeObjectURL(pending.preview);
  pending = { file, preview: URL.createObjectURL(file) };
}

/** Récupère la photo ET vide le stockage (une seule analyse par photo). */
export function takePendingImage(): PendingImage | null {
  const p = pending;
  pending = null;
  return p;
}

export function peekPendingImage(): PendingImage | null {
  return pending;
}

/** Compresse une photo choisie par l'acheteur et la met de côté pour l'analyse. */
export async function prepareImageForSearch(file: File): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (file.size > MAX_PHOTO_SIZE) return { ok: false, reason: "Photo trop lourde (15 Mo maximum)." };
  const isImage = file.type ? file.type.startsWith("image/") : /\.(jpe?g|png|webp|heic|heif|gif|avif)$/i.test(file.name);
  if (!isImage) return { ok: false, reason: "Ce fichier n'est pas une image." };

  try {
    // Compression : l'envoi au modèle devient léger (quelques centaines de Ko).
    const blob = await compressImage(file);
    const ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
    setPendingImage(new File([blob], `recherche.${ext}`, { type: blob.type || "image/jpeg" }));
    return { ok: true };
  } catch {
    return { ok: false, reason: "Impossible de lire cette photo. Essayez-en une autre." };
  }
}
