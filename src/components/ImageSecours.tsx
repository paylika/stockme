import { useEffect } from "react";

/**
 * REPLI AUTOMATIQUE DES IMAGES — le filet qui manquait vraiment.
 *
 * LE PROBLÈME TROUVÉ : le code promettait depuis le début « si le service
 * d'images ne répond pas, l'image d'origine est utilisée automatiquement ».
 * Vérification faite : ce repli N'EXISTAIT PAS. Aucune image du site n'avait de
 * secours. Autrement dit, une panne ou une limitation du service tiers
 * (wsrv.nl) laissait des photos vides partout — sur les annonces, en pleine
 * négociation, sans que personne ne soit prévenu.
 *
 * CE COMPOSANT RÉPARE CELA, POUR TOUTES LES IMAGES DU SITE, SANS TOUCHER À UNE
 * SEULE PAGE : il écoute les erreurs de chargement et essaie l'adresse
 * suivante. Deux cas concrets :
 *
 *   1. une vignette manquante (les photos envoyées avant cette évolution
 *      n'en ont pas encore) → on réaffiche la photo d'origine ;
 *   2. le service tiers injoignable → on relit l'adresse d'origine, qui est
 *      écrite dans le lien, et on l'affiche directement.
 *
 * L'écoute se fait en phase de capture : l'événement `error` d'une image ne
 * remonte pas tout seul jusqu'au document.
 */
export function ImageSecours() {
  useEffect(() => {
    const onError = (event: Event) => {
      const cible = event.target as HTMLImageElement | null;
      if (!cible || cible.tagName !== "IMG") return;
      // Une seule tentative par image : on ne boucle jamais.
      if ((cible as HTMLImageElement & { dataset: DOMStringMap }).dataset.secours === "fait") return;

      const src = cible.getAttribute("src") ?? "";
      if (!src) return;

      const suivant = repli(src);
      if (!suivant || suivant === src) return;

      cible.dataset.secours = "fait";
      /*
       * POINT CRUCIAL : les cartes produit utilisent `srcset` (le navigateur
       * choisit lui-même la taille adaptée). Changer seulement `src` n'aurait
       * donc AUCUN effet : le navigateur continuerait de piocher dans les
       * adresses cassées. Il faut retirer `srcset` et `sizes` pour que notre
       * adresse de secours soit réellement utilisée.
       */
      cible.removeAttribute("srcset");
      cible.removeAttribute("sizes");
      cible.src = suivant;
    };

    document.addEventListener("error", onError, true);
    return () => document.removeEventListener("error", onError, true);
  }, []);

  return null;
}

/** Adresse suivante à essayer quand une image ne se charge pas. */
function repli(src: string): string | null {
  // 1) Vignette absente (photo envoyée avant les vignettes) → photo d'origine.
  //    L'adresse de la vignette est « …/photo.jpg.thumb.webp » : on coupe le
  //    suffixe pour retrouver « …/photo.jpg ».
  const i = src.indexOf(".thumb.webp");
  if (i > 0) return src.slice(0, i);

  // 2) Service tiers injoignable → on relit l'adresse d'origine, qui figure
  //    dans le paramètre `url` du lien.
  if (src.startsWith("https://wsrv.nl/")) {
    try {
      const brut = new URL(src).searchParams.get("url");
      return brut || null;
    } catch {
      return null;
    }
  }

  return null;
}
