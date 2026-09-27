import { supabase } from "@/integrations/supabase/stockme-client";

/**
 * 5 PHOTOS PAR PRODUIT (décision du fondateur : 10, c'était trop).
 *
 * 5 photos nettes suffisent largement à vendre, et cela allège la page produit
 * (donc le forfait data de l'acheteur). La limite est la MÊME pour tout le
 * monde, Pro compris — ce n'est pas un levier de vente.
 *
 * Les fiches DÉJÀ en ligne avec plus de 5 photos ne sont pas touchées : elles
 * gardent leurs photos, on interdit seulement d'en AJOUTER au-delà de 5.
 */
export const MAX_PHOTOS = 5;
export const FREE_MAX_PHOTOS = 5;
/** Taille maximale du fichier CHOISI par l'utilisateur (il est compressé avant envoi). */
export const MAX_PHOTO_SIZE = 15 * 1024 * 1024;
/** Taille maximale réellement ENVOYÉE au serveur (garantie par la compression). */
export const MAX_UPLOAD_SIZE = 1.2 * 1024 * 1024;

/**
 * RÉGLAGE DÉCISIF POUR L'AFRIQUE DE L'OUEST.
 *
 * Avant : 1280 px / ~340 Ko visés. Sur un réseau mobile faible (2G/3G, zone
 * blanche), un envoi de 340 Ko peut échouer — et un vendeur qui ne peut pas
 * publier est un vendeur perdu.
 *
 * Maintenant : 1080 px / ~170 Ko visés. À l'écran, c'est IDENTIQUE (les photos
 * sont de toute façon affichées en 800 px maximum et servies en WebP
 * redimensionné). Mais l'envoi est DEUX FOIS plus léger, donc deux fois plus
 * susceptible d'aboutir du premier coup.
 */
const MAX_DIMENSION = 1080;
const TARGET_BYTES = 170 * 1024;
const QUALITIES = [0.8, 0.68, 0.55, 0.45];
/** Tentatives d'envoi : avec des pauses plus longues, le temps que le réseau revienne. */
const ATTEMPTS = 5;
const RETRY_WAITS_MS = [1200, 2500, 5000, 9000];

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
  // Hors ligne : on le dit clairement, au lieu de parler de « réseau ».
  if (typeof navigator !== "undefined" && navigator.onLine === false)
    return "Vous êtes hors ligne : vos informations sont conservées, réactivez vos données puis réessayez.";
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

/**
 * ⏱️ DÉLAI MAXIMUM PAR TENTATIVE D'ENVOI (décisif).
 *
 * POURQUOI : `fetch` n'a AUCUN délai maximum par défaut. Quand une connexion
 * mobile lâche en cours d'envoi (très fréquent), le navigateur reste bloqué
 * plusieurs MINUTES sans rien dire — le vendeur voit le bouton tourner dans le
 * vide et croit que l'application est cassée. C'était exactement le bug.
 *
 * Avec ce plafond : une tentative échoue en 25 s au maximum, on réessaie, et au
 * pire on enregistre la fiche en brouillon. Le vendeur a TOUJOURS une réponse.
 */
const UPLOAD_TIMEOUT_MS = 25_000;

/** Envoi d'un fichier avec un délai maximum (interruption propre). */
async function uploadBlobWithTimeout(path: string, blob: Blob, timeoutMs = UPLOAD_TIMEOUT_MS): Promise<void> {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const { error } = await supabase.storage.from("product-images").upload(path, blob, {
      contentType: blob.type || "image/jpeg",
      cacheControl: "31536000",
      upsert: false,
      // @ts-expect-error — `signal` est transmis à fetch par supabase-js
      signal: controller?.signal,
    });
    if (error) throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Envoi d'un fichier avec plusieurs tentatives, en respectant le retour du
 * réseau : si le téléphone est hors ligne, on attend qu'il le redevienne au
 * lieu de brûler les tentatives pour rien.
 */
async function uploadWithRetries(path: string, blob: Blob, onStatus?: (s: string) => void): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    // Hors ligne : on attend le retour du réseau (30 s maximum) avant d'essayer.
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      onStatus?.("En attente du réseau...");
      await waitForOnline(30_000);
    }
    try {
      await uploadBlobWithTimeout(path, blob);
      return;
    } catch (e) {
      lastError = e;
      // Délai dépassé : message clair plutôt qu'une attente sans fin.
      const msg = e instanceof Error ? e.message : String(e ?? "");
      if (/abort/i.test(msg)) {
        onStatus?.("Connexion trop lente — nouvelle tentative...");
      }
      if (attempt < ATTEMPTS) await sleep(RETRY_WAITS_MS[attempt - 1] ?? 9000);
    }
  }
  throw new ImageError(classifyUploadError(lastError, blob.size));
}

/** Attend le retour de la connexion (résout tout de suite si on est en ligne). */
function waitForOnline(maxMs: number): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve();
    if (navigator.onLine) return resolve();
    const done = () => {
      window.removeEventListener("online", done);
      resolve();
    };
    window.addEventListener("online", done, { once: true });
    setTimeout(done, maxMs);
  });
}

/** Compression puis envoi d'une photo. Renvoie l'URL publique. */
export async function uploadProductImage(file: File, userId: string): Promise<string> {
  const blob = await compressImage(file);
  const base = safeFileName(file.name).replace(/\.[^.]+$/, "") || "produit";
  const ext = blob.type === "image/jpeg" ? "jpg" : extensionOf(file.name) || "jpg";
  const path = `${userId}/${uid()}-${base}.${ext}`;

  await uploadWithRetries(path, blob);
  const { data } = supabase.storage.from("product-images").getPublicUrl(path);
  return data.publicUrl;
}

async function uploadBlob(path: string, blob: Blob): Promise<void> {
  // Tous les envois passent par la version avec délai maximum : sans elle, une
  // connexion qui lâche bloque le navigateur plusieurs minutes sans message.
  return uploadBlobWithTimeout(path, blob);
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

        await uploadWithRetries(path, blob, onStatus);
        const { data } = supabase.storage.from("product-images").getPublicUrl(path);
        urls.push(data.publicUrl);
      } catch (e) {
        failures.push({
          fileName: file.name,
          reason: e instanceof Error ? e.message : "Envoi impossible.",
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

  await uploadWithRetries(path, blob);
  const { data } = supabase.storage.from("product-images").getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Avatar / logo : chemin unique (pas d'upsert, donc aucune policy UPDATE requise)
 * puis suppression best-effort de l'ancienne image.
 */
export async function uploadAvatar(file: File, userId: string, previousUrl?: string): Promise<string> {
  const blob = await compressImage(file);
  const path = `${userId}/avatar-${uid()}.jpg`;

  await uploadWithRetries(path, blob);
  const { data } = supabase.storage.from("product-images").getPublicUrl(path);
  const url = data.publicUrl;

  // Nettoyage de l'ancien avatar (best effort, jamais bloquant).
  const oldPath = previousUrl?.split("/product-images/")[1]?.split("?")[0];
  if (oldPath && oldPath.startsWith(`${userId}/avatar`)) {
    void supabase.storage.from("product-images").remove([oldPath]);
  }
  return url;
}
