import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/stockme-client";

/**
 * Identifiants des vendeurs au badge « Fournisseur vérifié » actif.
 *
 * Utilisé par les pages qui lisent les produits directement (recherche,
 * favoris…) pour afficher le badge sur les cartes produit. Le résultat est
 * mis en cache pour la session : une seule requête, quel que soit le nombre
 * de pages visitées.
 */

let cache: Set<string> | null = null;
let inflight: Promise<Set<string>> | null = null;

type VerifiedRow = { id: string; shop_name: string | null; city: string | null };

async function fetchVerifiedSellers(): Promise<Set<string>> {
  if (cache) return cache;

  // 1) Fonction dédiée (fonctionne aussi pour un visiteur non connecté).
  const { data, error } = await supabase.rpc("get_verified_sellers");
  if (!error && Array.isArray(data)) {
    cache = new Set((data as VerifiedRow[]).map((r) => r.id));
    return cache;
  }

  // 2) Repli tant que le script SQL n'est pas appliqué : lecture des profils
  //    (autorisée pour les utilisateurs connectés).
  const { data: profs } = await supabase.from("profiles").select("id,verified,verified_until").eq("verified", true);
  const now = Date.now();
  cache = new Set(
    ((profs as { id: string; verified: boolean; verified_until: string | null }[] | null) ?? [])
      .filter((p) => p.verified && (!p.verified_until || new Date(p.verified_until).getTime() > now))
      .map((p) => p.id),
  );
  return cache;
}

export function useVerifiedSellers() {
  const [ids, setIds] = useState<Set<string>>(() => cache ?? new Set<string>());

  useEffect(() => {
    let cancel = false;
    if (cache) {
      setIds(cache);
      return;
    }
    inflight = inflight ?? fetchVerifiedSellers();
    inflight.then((set) => {
      if (!cancel) setIds(set);
    });
    return () => {
      cancel = true;
    };
  }, []);

  return ids;
}
