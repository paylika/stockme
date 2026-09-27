import { useCallback } from "react";
import { useSellerDashboard } from "@/hooks/useSellerDashboard";

/**
 * Informations du vendeur affichées dans le sidebar (ordinateur) :
 * identité de la boutique, état du badge, et quelques compteurs.
 *
 * Trois petites requêtes, relancées uniquement quand on revient sur une page
 * où quelque chose a pu changer (profil, tableau de bord, favoris).
 */
export type SidebarInfo = {
  shopName: string;
  avatarUrl: string | null;
  verified: boolean;
  /** Badge obtenu à vie (vérification manuelle par l'admin) */
  lifetime: boolean;
  verifiedUntil: string | null;
  /** Abonnement Vendeur Pro payé et en cours (échéance non dépassée). */
  isPro: boolean;
  products: number;
  hasWhatsapp: boolean;
  hasBanner: boolean;
  /** Produits publiés (id, nom, photo) : sert au pop-up « Booster » du sidebar. */
  items: { id: string; name: string; image: string | null }[];
};

/**
 * RÉÉCRIT POUR LA VITESSE : plus aucune requête propre. Les informations du
 * menu viennent du paquet unique déjà chargé (`seller_dashboard`), donc
 * ouvrir une page ne coûte PLUS RIEN au menu latéral.
 */
export function useSidebarInfo(enabled: boolean) {
  const { data, refresh: reload } = useSellerDashboard(enabled);

  const refresh = useCallback(async () => {
    await reload();
  }, [reload]);

  const p = data?.profile ?? null;
  if (!enabled || !p) return { info: null, refresh };

  const verifiedUntil = p.verified_until ?? null;
  const verified = !!p.verified && (!verifiedUntil || new Date(verifiedUntil) > new Date());
  // Pro seulement tant que l'abonnement court : la date d'échéance est
  // repoussée de 30 jours à chaque paiement.
  const isPro = p.plan === "pro" && (!verifiedUntil || new Date(verifiedUntil) > new Date());

  // Les produits arrivent déjà du même paquet (du plus récent au plus ancien).
  const online = (data?.products ?? []).filter((prod) => prod.published);

  return {
    info: {
      shopName: p.shop_name?.trim() || p.full_name?.trim() || "Ma boutique",
      avatarUrl: p.avatar_url ?? null,
      verified,
      lifetime: verified && !verifiedUntil,
      verifiedUntil,
      isPro,
      products: online.length,
      hasWhatsapp: !!(p.whatsapp && p.whatsapp.trim()),
      hasBanner: !!(p.banner_url && p.banner_url.trim()),
      items: online.slice(0, 8).map((prod) => ({
        id: prod.id,
        name: prod.name,
        image: prod.images?.[0] ?? null,
      })),
    } satisfies SidebarInfo,
    refresh,
  };
}