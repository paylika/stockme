import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { supabase } from "@/integrations/supabase/stockme-client";
import { countryFromIso } from "@/lib/geo";
import { WEST_AFRICA_LOCATIONS } from "@/lib/constants";

/**
 * DONNÉES DE LA PREMIÈRE PAGE, CALCULÉES SUR LE SERVEUR.
 *
 * POURQUOI : la page d'accueil partait avec 24 cases grises (« squelettes »).
 * Le navigateur devait : télécharger le JS → l'exécuter → appeler la base →
 * afficher les produits → télécharger les photos. Résultat : 1 à 3 secondes de
 * vide sur un téléphone en 3G.
 *
 * Maintenant le serveur interroge la base PENDANT le rendu de la page : le HTML
 * arrive déjà avec les vrais produits, et les photos commencent à se charger en
 * même temps que le reste. L'utilisateur voit du contenu tout de suite.
 *
 * Le pays du visiteur est lu dans l'en-tête Cloudflare (`cf-ipcountry`), donc
 * la première page est déjà filtrée sur sa zone — sans requête supplémentaire
 * côté navigateur.
 *
 * ⚠️ Ce fichier ne contient QUE des fonctions serveur : le compilateur les
 * remplace par un appel réseau dans le navigateur, rien d'autre n'y est exposé.
 */
/**
 * Forme minimale d'un produit renvoyée par le serveur (ce que la carte
 * affiche). On la déclare explicitement : une fonction serveur ne peut
 * transporter que des données sérialisables et typées.
 */
export type FeedProduct = {
  id: string;
  name: string;
  category: string;
  price_fcfa: number;
  promo_price_fcfa: number | null;
  quantity: number;
  moq: number;
  city: string;
  zone: string | null;
  images: string[];
  sold_out: boolean;
  dropshipping: boolean;
  owner_id: string;
  seller_verified: boolean;
  is_boosted: boolean;
};

export const fetchHomeFeed = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ products: FeedProduct[]; country: string | null }> => {
    let country: string | null = null;
    try {
      country = countryFromIso(getRequestHeader("cf-ipcountry") ?? null);
    } catch {
      country = null;
    }

    const cities = country && WEST_AFRICA_LOCATIONS[country] ? WEST_AFRICA_LOCATIONS[country] : null;

    const { data } = await supabase.rpc("get_ranked_products", {
      p_sort: "nouveau",
      p_limit: 24,
      p_offset: 0,
      p_city: null,
      p_cities: cities,
      p_category: null,
      p_q: null,
      p_verified_only: false,
    });

    return { products: (data as FeedProduct[] | null) ?? [], country };
  },
);

/**
 * Même chose pour « Parcourir le stock » : 60 produits sans filtre, avec les
 * mises en avant déjà intercalées (une annonce tous les 5-6 résultats).
 * Les filtres choisis par l'acheteur (ville, catégorie, recherche) restent
 * gérés côté navigateur, comme avant.
 */
export const fetchBrowseFeed = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ products: FeedProduct[] }> => {
    let cities: string[] | null = null;
    try {
      const country = countryFromIso(getRequestHeader("cf-ipcountry") ?? null);
      cities = country && WEST_AFRICA_LOCATIONS[country] ? WEST_AFRICA_LOCATIONS[country] : null;
    } catch {
      cities = null;
    }

    let query = supabase
      .from("products")
      .select(
        "id,name,category,price_fcfa,promo_price_fcfa,quantity,moq,city,zone,images,sold_out,dropshipping,owner_id",
      )
      .eq("published", true)
      .eq("dropshipping", false)
      .order("created_at", { ascending: false })
      .limit(60);

    if (cities) query = query.in("city", cities);

    const [{ data }, { data: adData }] = await Promise.all([
      query,
      supabase.rpc("get_sponsored_products", { p_limit: 6 }),
    ]);

    const base = (data as unknown as FeedProduct[] | null) ?? [];
    const ads = (adData as { id: string }[] | null) ?? [];
    const boosted = new Set(ads.map((a) => a.id));

    // Mêmes emplacements que côté navigateur : jamais toutes les annonces en tête.
    const SLOTS = [0, 5, 11, 18];
    const sponsoredRows = base.filter((p) => boosted.has(p.id)).slice(0, SLOTS.length);
    const natural = base.filter((p) => !boosted.has(p.id));
    for (let i = sponsoredRows.length - 1; i >= 0; i--) {
      natural.splice(Math.min(SLOTS[i], natural.length), 0, sponsoredRows[i]);
    }

    return { products: natural };
  },
);
