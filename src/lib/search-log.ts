import { supabase } from "@/integrations/supabase/stockme-client";

/**
 * MÉMOIRE DES RECHERCHES — la fondation de toute recommandation.
 *
 * POURQUOI : « recommander selon les recherches de l'utilisateur » était
 * impossible, tout simplement parce qu'AUCUNE recherche n'était enregistrée
 * (vérifié : 0 ligne en base). Sans cette mémoire, on ne peut ni améliorer la
 * pertinence, ni savoir ce que les acheteurs cherchent, ni repérer les
 * recherches qui ne trouvent RIEN — cette dernière information révélant les
 * catégories où il manque de l'offre.
 *
 * RÈGLES : on n'enregistre jamais deux fois la même recherche coup sur coup,
 * on n'envoie rien d'utilisateur (l'identifiant est ajouté par la base, et
 * seulement si la personne est connectée), et un échec d'enregistrement ne
 * perturbe JAMAIS la recherche affichée.
 */

/** Dernière recherche envoyée : évite les doublons d'affichage. */
let derniere = { signature: "", at: 0 };
const DELAI_MINIMUM_MS = 10_000;

export type RechercheAEnregistrer = {
  /** Le mot cherché (peut être vide si seul un filtre est utilisé). */
  terme?: string | null;
  /** Nombre de résultats réellement trouvés. */
  resultats: number;
  ville?: string | null;
  categorie?: string | null;
  pays?: string | null;
};

export function logSearch(recherche: RechercheAEnregistrer): void {
  if (typeof window === "undefined") return;

  const terme = (recherche.terme ?? "").trim();
  // Une recherche sans mot et sans filtre n'apprend rien.
  if (!terme && !recherche.ville && !recherche.categorie) return;

  const signature = `${terme.toLowerCase()}|${recherche.ville ?? ""}|${recherche.categorie ?? ""}|${recherche.resultats}`;
  const maintenant = Date.now();
  if (signature === derniere.signature && maintenant - derniere.at < DELAI_MINIMUM_MS) return;
  derniere = { signature, at: maintenant };

  // Envoi en arrière-plan : jamais d'attente, jamais d'erreur visible — y
  // compris tant que le SQL n'est pas collé dans Supabase (le site ne doit
  // jamais dépendre de cette mémoire pour fonctionner).
  void supabase
    .rpc("log_search", {
      p_query: terme,
      p_results: Math.max(0, Math.round(recherche.resultats)),
      p_city: recherche.ville ?? null,
      p_category: recherche.categorie ?? null,
      p_country: recherche.pays ?? null,
    })
    .then(
      () => {},
      () => {},
    );
}
