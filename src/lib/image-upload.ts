import { supabase } from "@/integrations/supabase/stockme-client";

export const MAX_PHOTOS = 5;
/** Taille maximale du fichier CHOISI par l'utilisateur (il est compressé avant envoi). */
export const MAX_PHOTO_SIZE = 15 * 1024 * 1024;
/** Taille maximale réellement ENVOYÉE au serveur (garantie par la compression). */
export const MAX_UPLOAD_SIZE = 2.5 * 1024 * 1024;

const MAX_DIMENSION = 1280;
const TARGET_BYTES = 500 * 1024;
const QUALITIES = [0.82, 0.7, 0.58];
const ATTEMPTS = 4;

/** Erreur "propre" : le message est compréhensible par le vendeur tel quel. */
export class ImageError extends Error {}

export const formatBytes = (n: number) =>
  n >= 1024 * 1024 ? `${(n / (1024 * 1024)).toFixed(1)} Mo` : `${Math.max(1, Math.round(n / 1024))} Ko`;

const safeFileName = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .slice(-60);

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const extensionOf = (name: string) => (name.split(".").pop() || "").toLowerCase().slice(0, 5);

/* ------------------------------------------------------------------ *
 * Décodage (multi-chemins : beaucoup de navigateurs mobiles échouent
 * sur les blob URL ou sur createImageBitmap selon le format)
 * ------------------------------------------------------------------ */

function loadWithImg(src: string, revoke: boolean): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => {
      if (revoke) URL.revokeObjectURL(src);
      resolve(el);
    };
    el.onerror = () => {
      if (revoke) URL.revokeObjectURL(src);
      reject(new Error("decode"));
    };
    el.src = src;
  });
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error("read"));
    r.readAsDataURL(file);
  });
}

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement | null> {
  // 1) createImageBitmap : rapide et respecte l'orientation EXIF.
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
    } catch {
      try {
        return await createImageBitmap(file);
      } catch {
        /* on passe au chemin suivant */
      }
    }
  }
  // 2) <img> via blob URL.
  try {
    const url = URL.createObjectURL(file);
    return await loadWithImg(url, true);
  } catch {
    /* on passe au chemin suivant */
  }
  // 3) <img> via data URL : dernier recours (certains WebView Android).
  try {
    return await loadWithImg(await readAsDataURL(file), false);
  } catch {
    return null;
  }
}

/** canvas.toBlob avec repli pour les WebView qui ne l'implémentent pas. */
function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (typeof canvas.toBlob === "function") {
      try {
        canvas.toBlob((b) => resolve(b), "image/jpeg", quality);
        return;
      } catch {
        /* repli ci-dessous */
      }
    }
    try {
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      const bin = atob(dataUrl.split(",")[1] ?? "");
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      resolve(new Blob([arr], { type: "image/jpeg" }));
    } catch {
      resolve(null);
    }
  });
}

/**
 * Compresse une photo pour qu'elle soit TOUJOURS légère à envoyer :
 * max 1280 px, qualité dégressive, plusieurs passes jusqu'à ~500 Ko.
 * Ne renvoie jamais un fichier de plus de MAX_UPLOAD_SIZE.
 */
export async function compressImage(file: File): Promise<Blob> {
  if (typeof document === "undefined") return file;

  const bitmap = await decode(file);
  if (!bitmap) {
    // Format indécodable par le navigateur (HEIC non converti, RAW, PDF renommé…).
    if (file.size <= MAX_UPLOAD_SIZE) return file;
    throw new ImageError(
      `Format non pris en charge (${extensionOf(file.name) || "inconnu"}) : convertissez la photo en JPG puis réessayez.`,
    );
  }

  const w = bitmap instanceof HTMLImageElement ? bitmap.naturalWidth : bitmap.width;
  const h = bitmap instanceof HTMLImageElement ? bitmap.naturalHeight : bitmap.height;
  if (!w || !h) {
    if ("close" in bitmap && typeof bitmap.close === "function") bitmap.close();
    return file;
  }

  let best: Blob | null = null;
  let scale = Math.min(1, MAX_DIMENSION / Math.max(w, h));

  for (let pass = 0; pass < 4; pass++) {
    const cw = Math.max(1, Math.round(w * scale));
    const ch = Math.max(1, Math.round(h * scale));
    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;

    const ctx = canvas.getContext("2d");
    if (!ctx) break;
    try {
      // Fond blanc : évite un fond noir quand un PNG transparent devient un JPEG.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, cw, ch);
      ctx.drawImage(bitmap as CanvasImageSource, 0, 0, cw, ch);
    } catch {
      break;
    }

    for (const q of QUALITIES) {
      const blob = await canvasToBlob(canvas, q);
      if (!blob || blob.size === 0) continue;
      if (!best || blob.size < best.size) best = blob;
      if (blob.size <= TARGET_BYTES) {
        if ("close" in bitmap && typeof bitmap.close === "function") bitmap.close();
        return blob;
      }
    }
    scale *= 0.75; // passe suivante : image plus petite
  }

  if ("close" in bitmap && typeof bitmap.close === "function") bitmap.close();

  // Aucune compression possible : on n'envoie l'original que s'il est petit.
  if (!best) {
    if (file.size <= MAX_UPLOAD_SIZE) return file;
    throw new ImageError(`Photo trop lourde (${formatBytes(file.size)}) et impossible à compresser sur cet appareil.`);
  }

  // Si l'original est déjà plus léger que notre version compressée, on le garde.
  if (file.size <= best.size && file.size <= MAX_UPLOAD_SIZE) return file;

  if (best.size > MAX_UPLOAD_SIZE) {
    throw new ImageError(`Photo trop lourde (${formatBytes(best.size)}) même après compression.`);
  }
  return best;
}

/* ------------------------------------------------------------------ *
 * Envoi (chemin unique → jamais d'upsert, 4 tentatives, messages clairs)
 * ------------------------------------------------------------------ */

function classifyUploadError(err: unknown, size: number): string {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  if (/row-level security|violates row-level|not authorized|unauthorized|403/i.test(msg))
    return "Accès au stockage refusé : reconnectez-vous puis réessayez.";
  if (/exceeded the maximum allowed size|payload too large|too large|413/i.test(msg))
    return `Photo trop lourde pour le serveur (${formatBytes(size)}).`;
  if (/mime|content type|unsupported|invalid.*type/i.test(msg))
    return "Format d'image refusé par le serveur : utilisez une photo JPG ou PNG.";
  if (/jwt|expired|invalid token|401/i.test(msg))
    return "Session expirée : reconnectez-vous puis réessayez.";
  if (/fetch|network|load failed|networkerror|aborted|timeout/i.test(msg))
    return "Envoi interrompu : vos informations sont conservées, appuyez sur « Réessayer ».";
  return msg || "Envoi impossible.";
}

async function uploadBlob(path: string, blob: Blob): Promise<void> {
  const { error } = await supabase.storage.from("product-images").upload(path, blob, {
    contentType: blob.type || "image/jpeg",
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) throw error;
}

/** Compresse puis envoie une photo, avec 4 tentatives. Renvoie l'URL publique. */
export async function uploadProductImage(file: File, userId: string): Promise<string> {
  const blob = await compressImage(file);
  const base = safeFileName(file.name).replace(/\.[^.]+$/, "") || "produit";
  const ext = blob.type === "image/jpeg" ? "jpg" : extensionOf(file.name) || "jpg";
  const path = `${userId}/${uid()}-${base}.${ext}`;

  let lastError: unknown;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      await uploadBlob(path, blob);
      const { data } = supabase.storage.from("product-images").getPublicUrl(path);
      return data.publicUrl;
    } catch (e) {
      lastError = e;
      if (attempt < ATTEMPTS) await sleep(attempt * 900);
    }
  }
  throw new ImageError(`${file.name} : ${classifyUploadError(lastError, blob.size)}`);
}

export type UploadFailure = { fileName: string; reason: string };

/**
 * Envoi d'un lot de photos. **N'échoue jamais** : renvoie les URLs obtenues
 * et la liste des photos en échec, pour que la publication du produit
 * ne soit jamais bloquée par une photo.
 */
export async function uploadImagesResilient(
  files: File[],
  userId: string,
  onStatus?: (status: string) => void,
): Promise<{ urls: string[]; failures: UploadFailure[] }> {
  const urls: string[] = [];
  const failures: UploadFailure[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const label = `Photo ${i + 1}/${files.length}`;
    try {
      onStatus?.(`Préparation de la ${label.toLowerCase()}...`);
      const blob = await compressImage(file);
      onStatus?.(`Envoi ${label} (${formatBytes(blob.size)})...`);
      const base = safeFileName(file.name).replace(/\.[^.]+$/, "") || "produit";
      const ext = blob.type === "image/jpeg" ? "jpg" : extensionOf(file.name) || "jpg";
      const path = `${userId}/${uid()}-${base}.${ext}`;

      let lastError: unknown;
      let ok = false;
      for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
        try {
          onStatus?.(attempt === 1 ? `Envoi ${label}...` : `Nouvelle tentative ${attempt}/${ATTEMPTS} — ${label}...`);
          await uploadBlob(path, blob);
          ok = true;
          break;
        } catch (e) {
          lastError = e;
          if (attempt < ATTEMPTS) await sleep(attempt * 900);
        }
      }

      if (ok) {
        const { data } = supabase.storage.from("product-images").getPublicUrl(path);
        urls.push(data.publicUrl);
      } else {
        failures.push({ fileName: file.name, reason: classifyUploadError(lastError, blob.size) });
      }
    } catch (e) {
      failures.push({
        fileName: file.name,
        reason: e instanceof Error ? e.message : "Préparation de la photo impossible.",
      });
    }
  }

  return { urls, failures };
}

/** Compatibilité : envoi séquentiel qui s'arrête à la première erreur. */
export async function uploadImages(
  files: File[],
  userId: string,
  onStatus?: (status: string) => void,
): Promise<string[]> {
  const { urls, failures } = await uploadImagesResilient(files, userId, onStatus);
  if (failures.length > 0) throw new ImageError(failures[0].reason);
  return urls;
}

/** Upload d'une image générique (annonce, bannière…) sous le dossier de l'utilisateur. */
export async function uploadImage(file: File, userId: string, prefix = "img"): Promise<string> {
  const blob = await compressImage(file);
  const ext = blob.type === "image/jpeg" ? "jpg" : extensionOf(file.name) || "jpg";
  const path = `${userId}/${prefix}-${uid()}.${ext}`;

  let lastError: unknown;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      await uploadBlob(path, blob);
      const { data } = supabase.storage.from("product-images").getPublicUrl(path);
      return data.publicUrl;
    } catch (e) {
      lastError = e;
      if (attempt < ATTEMPTS) await sleep(attempt * 900);
    }
  }
  throw new ImageError(classifyUploadError(lastError, blob.size));
}

/**
 * Avatar / logo : chemin unique (pas d'upsert, donc aucune policy UPDATE requise)
 * puis suppression best-effort de l'ancienne image.
 */
export async function uploadAvatar(file: File, userId: string, previousUrl?: string): Promise<string> {
  const blob = await compressImage(file);
  const path = `${userId}/avatar-${uid()}.jpg`;

  let lastError: unknown;
  let url: string | null = null;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      await uploadBlob(path, blob);
      const { data } = supabase.storage.from("product-images").getPublicUrl(path);
      url = data.publicUrl;
      break;
    } catch (e) {
      lastError = e;
      if (attempt < ATTEMPTS) await sleep(attempt * 900);
    }
  }
  if (!url) throw new ImageError(classifyUploadError(lastError, blob.size));

  // Nettoyage de l'ancien avatar (best effort, jamais bloquant).
  const oldPath = previousUrl?.split("/product-images/")[1]?.split("?")[0];
  if (oldPath && oldPath.startsWith(`${userId}/avatar`)) {
    void supabase.storage.from("product-images").remove([oldPath]);
  }
  return url;
}
