import { supabase } from "@/integrations/supabase/stockme-client";

export const MAX_PHOTOS = 5;
export const MAX_PHOTO_SIZE = 15 * 1024 * 1024; // 15 Mo en entrée (compressé ensuite)

const MAX_DIMENSION = 1600;
const TARGET_QUALITY = 0.82;

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

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement | null> {
  try {
    if (typeof createImageBitmap === "function") {
      return await createImageBitmap(file);
    }
  } catch {
    /* fallback below */
  }
  try {
    const url = URL.createObjectURL(file);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("decode"));
      el.src = url;
    });
    URL.revokeObjectURL(url);
    return img;
  } catch {
    return null;
  }
}

/** Redimensionne + convertit en JPEG pour fiabiliser l'upload mobile (HEIC, photos 8 Mo, 4G lente). */
export async function compressImage(file: File): Promise<Blob> {
  if (typeof document === "undefined") return file;
  const bitmap = await loadBitmap(file);
  if (!bitmap) return file; // format non décodable : on tente l'original

  const w = "width" in bitmap ? bitmap.width : 0;
  const h = "height" in bitmap ? bitmap.height : 0;
  if (!w || !h) return file;

  const scale = Math.min(1, MAX_DIMENSION / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0, canvas.width, canvas.height);
  if ("close" in bitmap && typeof bitmap.close === "function") bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", TARGET_QUALITY),
  );
  if (!blob || blob.size === 0) return file;
  return blob;
}

/** Upload une image avec compression + 3 tentatives. Renvoie l'URL publique. */
export async function uploadProductImage(file: File, userId: string): Promise<string> {
  const blob = await compressImage(file);
  const base = safeFileName(file.name).replace(/\.[^.]+$/, "") || "produit";
  const ext = blob.type === "image/jpeg" ? "jpg" : (file.name.split(".").pop() || "jpg");
  const path = `${userId}/${uid()}-${base}.${ext}`;

  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { error } = await supabase.storage.from("product-images").upload(path, blob, {
        contentType: blob.type || "image/jpeg",
        cacheControl: "3600",
        upsert: true,
      });
      if (error) throw error;
      const { data } = supabase.storage.from("product-images").getPublicUrl(path);
      return data.publicUrl;
    } catch (e) {
      lastError = e;
      if (attempt < 3) await sleep(attempt * 1200);
    }
  }

  const msg = lastError instanceof Error ? lastError.message : "erreur réseau";
  throw new Error(
    /fetch|network|Load failed/i.test(msg)
      ? `Connexion interrompue pendant l'envoi de « ${file.name} ». Réessayez avec une meilleure connexion.`
      : `Photo non envoyée (${file.name}) : ${msg}`,
  );
}

/** Upload séquentiel de plusieurs images (avec progression optionnelle). Renvoie les URLs publiques. */
export async function uploadImages(
  files: File[],
  userId: string,
  onStatus?: (status: string) => void,
): Promise<string[]> {
  const urls: string[] = [];
  for (let i = 0; i < files.length; i++) {
    onStatus?.(`Envoi de la photo ${i + 1}/${files.length}...`);
    urls.push(await uploadProductImage(files[i], userId));
  }
  return urls;
}

/** Upload d'une image de profil (avatar/logo) sous un chemin stable par utilisateur. Renvoie l'URL publique. */
export async function uploadAvatar(file: File, userId: string): Promise<string> {
  const blob = await compressImage(file);
  const path = `${userId}/avatar`; // chemin fixe → remplace l'ancien avatar sans orphelin
  const { error } = await supabase.storage.from("product-images").upload(path, blob, {
    contentType: blob.type || "image/jpeg",
    cacheControl: "3600",
    upsert: true,
  });
  if (error) throw error;
  const { data } = supabase.storage.from("product-images").getPublicUrl(path);
  return data.publicUrl;
}
