import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/stockme-client";

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
  products: number;
  favorites: number;
  hasWhatsapp: boolean;
  hasBanner: boolean;
};

export function useSidebarInfo(enabled: boolean) {
  const [info, setInfo] = useState<SidebarInfo | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setInfo(null);
      return;
    }
    const { data: session } = await supabase.auth.getSession();
    const uid = session.session?.user?.id;
    if (!uid) {
      setInfo(null);
      return;
    }

    const [profRes, prodRes, favRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("shop_name,full_name,avatar_url,verified,verified_until,banner_url,whatsapp")
        .eq("id", uid)
        .maybeSingle(),
      supabase.from("products").select("id", { count: "exact", head: true }).eq("owner_id", uid).eq("published", true),
      supabase.from("favorites").select("id", { count: "exact", head: true }).eq("user_id", uid),
    ]);

    const p = profRes.data as {
      shop_name: string | null;
      full_name: string | null;
      avatar_url: string | null;
      verified: boolean | null;
      verified_until: string | null;
      banner_url: string | null;
      whatsapp: string | null;
    } | null;

    const verifiedUntil = p?.verified_until ?? null;
    const verified = !!p?.verified && (!verifiedUntil || new Date(verifiedUntil) > new Date());

    setInfo({
      shopName: p?.shop_name?.trim() || p?.full_name?.trim() || "Ma boutique",
      avatarUrl: p?.avatar_url ?? null,
      verified,
      lifetime: verified && !verifiedUntil,
      verifiedUntil,
      products: prodRes.count ?? 0,
      favorites: favRes.count ?? 0,
      hasWhatsapp: !!(p?.whatsapp && p.whatsapp.trim()),
      hasBanner: !!(p?.banner_url && p.banner_url.trim()),
    });
  }, [enabled]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { info, refresh };
}
