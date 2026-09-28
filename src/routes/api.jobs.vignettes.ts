import { createFileRoute } from "@tanstack/react-router";
import { serverEnv } from "@/lib/server-env";
import { serviceClient } from "@/lib/payments/supabase-server";

/**
 * RATTRAPAGE DES VIGNETTES — les photos déjà en ligne avant les vignettes.
 *
 *   Ouvrir dans le navigateur (JOB_SECRET = ton secret de tâches planifiées) :
 *     /api/jobs/vignettes?secret=TON_SECRET                 → 20 photos
 *     /api/jobs/vignettes?secret=TON_SECRET&limite=40       → 40 photos
 *     /api/jobs/vignettes?secret=TON_SECRET&apercu=1        → compte seulement
 *
 * POURQUOI : les photos envoyées avant la mise en place des vignettes passent
 * encore par un service tiers gratuit (1,5 à 4 secondes d'attente par image).
 * Cette tâche fabrique la vignette manquante et la range À CÔTÉ de la photo.
 * On ouvre l'adresse quelques fois, et tout le catalogue bascule sur nos
 * propres vignettes — définitivement.
 *
 * L'ASTUCE : un serveur ne sait pas redimensionner une image gratuitement. On
 * demande donc au service tiers de le faire UNE SEULE FOIS par photo, pendant
 * la migration, puis on stocke le résultat chez nous. Après le rattrapage, le
 * service tiers n'est plus jamais sollicité : il paye sa dette une fois et
 * disparaît du chemin de tes acheteurs.
 *
 * GARANTIES : rien n'est supprimé, rien n'est réécrit. On AJOUTE seulement un
 * fichier à côté. Relancer la tâche ne refait jamais deux fois le même travail.
 */
const SUFFIXE = ".thumb.webp";
const LARGEUR = 900;
const QUALITE = 72;
const TAILLE_LOT_DEFAUT = 20;
const TAILLE_LOT_MAX = 40;

type Produit = { id: string; name: string | null; images: string[] | null };

/** Adresse du service de redimensionnement, pour fabriquer la vignette. */
function urlRedimensionnement(original: string): string {
  const p = new URLSearchParams();
  p.set("url", original);
  p.set("w", String(LARGEUR));
  p.set("q", String(QUALITE));
  p.set("output", "webp");
  p.set("we", "");
  return `https://wsrv.nl/?${p.toString()}`;
}

/** Chemin interne du fichier dans le stockage (…/photos/vendeur/photo.jpg). */
function cheminInterne(url: string): string | null {
  const marqueur = "/storage/v1/object/public/product-images/";
  const i = url.indexOf(marqueur);
  if (i < 0) return null;
  return decodeURIComponent(url.slice(i + marqueur.length));
}

export const Route = createFileRoute("/api/jobs/vignettes")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const secret = await serverEnv("JOB_SECRET");
        const donne = url.searchParams.get("secret") ?? "";
        const cle = await serverEnv("SUPABASE_SERVICE_ROLE_KEY");
        if (!cle) return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY absente." }, { status: 500 });
        const service = serviceClient(cle);

        /**
         * DEUX FAÇONS DE DÉCLENCHER LA TÂCHE (pratique pour l'exploitant) :
         *   • le secret de tâche planifiée (`?secret=…`) — pour un cron ;
         *   • une session ADMINISTRATEUR — pour le bouton de la page admin.
         * Ainsi, plus besoin de retrouver un secret pour lancer un rattrapage.
         */
        let autorise = !!secret && donne === secret;
        if (!autorise) {
          const jeton = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
          if (jeton) {
            const { data: userData } = await service.auth.getUser(jeton);
            const uid = userData?.user?.id;
            if (uid) {
              const { data: role } = await service
                .from("user_roles")
                .select("role")
                .eq("user_id", uid)
                .eq("role", "admin")
                .maybeSingle();
              if (role) autorise = true;
            }
          }
        }
        if (!autorise) {
          return Response.json(
            { error: "Accès refusé.", comment: "Ouvrez cette tâche depuis la page /admin, ou ajoutez ?secret=VOTRE_JOB_SECRET." },
            { status: 401 },
          );
        }

        const apercu = url.searchParams.get("apercu") === "1";
        const limite = Math.min(Number(url.searchParams.get("limite") ?? TAILLE_LOT_DEFAUT) || TAILLE_LOT_DEFAUT, TAILLE_LOT_MAX);

        /* ---- 1) Rassembler toutes les photos référencées par les annonces ---- */
        const photos: { produit: string; nom: string | null; url: string; chemin: string }[] = [];
        const taillePage = 500;
        for (let page = 0; page < 40; page++) {
          const { data, error } = await service
            .from("products")
            .select("id,name,images")
            .not("images", "is", null)
            .order("created_at", { ascending: false })
            .range(page * taillePage, page * taillePage + taillePage - 1);
          if (error || !data?.length) break;
          for (const p of data as Produit[]) {
            for (const image of p.images ?? []) {
              if (typeof image !== "string" || image.includes(SUFFIXE)) continue;
              if (!/\.(jpe?g|png|webp|avif)$/i.test(image)) continue;
              const chemin = cheminInterne(image);
              if (chemin) photos.push({ produit: p.id, nom: p.name, url: image, chemin });
            }
          }
          if (data.length < taillePage) break;
        }

        if (!photos.length) {
          return Response.json({ ok: true, message: "Aucune photo d'annonce à traiter.", photos: 0 });
        }

        /* ---- 2) Lesquelles ont déjà une vignette ? ----
           On interroge directement l'adresse publique de la vignette : réponse
           correcte = elle existe, sinon elle est à fabriquer. C'est sans
           ambiguïté, contrairement à un filtrage de liste de fichiers. */
        const sansVignette: typeof photos = [];
        for (const photo of photos) {
          if (sansVignette.length >= limite) break;
          try {
            const tete = await fetch(`${photo.url}${SUFFIXE}`, { method: "HEAD" });
            if (!tete.ok) sansVignette.push(photo);
          } catch {
            sansVignette.push(photo);
          }
        }

        if (apercu) {
          return Response.json({
            ok: true,
            apercu: true,
            photos_total: photos.length,
            sans_vignette_detectees: sansVignette.length,
            prochaines: sansVignette.slice(0, limite).map((p) => ({ annonce: p.nom, fichier: p.chemin.split("/").slice(-1)[0] })),
          });
        }

        /* ---- 3) Fabriquer et ranger les vignettes manquantes ---- */
        const lot = sansVignette.slice(0, limite);
        const reussies: string[] = [];
        const echecs: { fichier: string; raison: string }[] = [];

        for (const photo of lot) {
          try {
            const ctrl = new AbortController();
            const minuteur = setTimeout(() => ctrl.abort(), 25000);
            const res = await fetch(urlRedimensionnement(photo.url), { signal: ctrl.signal });
            clearTimeout(minuteur);
            if (!res.ok) {
              echecs.push({ fichier: photo.chemin, raison: `service d'images HTTP ${res.status}` });
              continue;
            }
            const type = res.headers.get("content-type") ?? "";
            if (!type.startsWith("image/")) {
              echecs.push({ fichier: photo.chemin, raison: `réponse non image (${type})` });
              continue;
            }
            const octets = await res.arrayBuffer();
            if (octets.byteLength < 1000) {
              echecs.push({ fichier: photo.chemin, raison: "vignette trop petite" });
              continue;
            }
            const { error } = await service.storage
              .from("product-images")
              .upload(`${photo.chemin}${SUFFIXE}`, octets, {
                contentType: "image/webp",
                cacheControl: "31536000",
                upsert: true,
              });
            if (error) {
              echecs.push({ fichier: photo.chemin, raison: error.message });
              continue;
            }
            reussies.push(`${photo.chemin} (${Math.round(octets.byteLength / 1024)} Ko)`);
          } catch (err) {
            echecs.push({ fichier: photo.chemin, raison: err instanceof Error ? err.message : "erreur" });
          }
        }

        const restantes = Math.max(0, sansVignette.length - reussies.length);

        return Response.json({
          ok: true,
          photos_referencees: photos.length,
          sans_vignette_avant: sansVignette.length,
          traitees: lot.length,
          reussies: reussies.length,
          echecs: echecs.slice(0, 10),
          restantes_estimees: restantes,
          exemples: reussies.slice(0, 5),
          suite: restantes > 0 ? "Relancez la même adresse pour continuer le rattrapage." : "Rattrapage terminé 🎉",
        });
      },
    },
  },
});
