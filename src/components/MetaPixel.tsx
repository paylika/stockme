import { useEffect, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";
import { META_PIXEL_ID, startMetaPixel, trackPageView } from "@/lib/meta-pixel";

/**
 * Pixel Meta monté une seule fois pour tout le site (voir lib/meta-pixel.ts).
 *
 * • `PageView` part au premier affichage puis à CHAQUE changement de page
 *   (le site ne se recharge pas entre deux pages : sans ça, Meta ne verrait
 *   qu'une seule page par visite).
 * • Le `<noscript>` est le repli pour les navigateurs sans JavaScript : c'est
 *   exactement le code fourni par Meta.
 */
export function MetaPixel() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const first = useRef(true);

  useEffect(() => {
    startMetaPixel();
  }, []);

  useEffect(() => {
    // Le premier PageView est déjà envoyé par startMetaPixel().
    if (first.current) {
      first.current = false;
      return;
    }
    trackPageView(pathname);
  }, [pathname]);

  return (
    <noscript>
      <img
        height="1"
        width="1"
        alt=""
        style={{ display: "none" }}
        src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
      />
    </noscript>
  );
}
