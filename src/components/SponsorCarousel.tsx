import { useEffect, useMemo, useRef, useState } from "react";
import { Megaphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/stockme-client";
import { SponsorBanner } from "@/components/SponsorBanner";
import { trackAdClick, trackAdImpression } from "@/lib/ad-tracking";

type Slide = {
  badge: string;
  title: string;
  description?: string;
  ctaLabel: string;
  href: string;
  logoSrc?: string;
  logoAlt?: string;
  icon?: React.ComponentType<{ className?: string }>;
  /** Identifiant de l'annonce en base (absent pour les slides maison). */
  adId?: string;
};

/** Annonces "maison" affichées quand il n'y a aucune annonce programmée. */
const HOUSE_SLIDES: Slide[] = [
  {
    badge: "Sponsorisé · XaalisPay",
    title: "Encaissez avant de livrer avec XaalisPay",
    description: "Le client paie d'abord (séquestre Wave & Orange Money), vous livrez, vous êtes payé.",
    ctaLabel: "Découvrir",
    href: "https://www.xaalispay.com/",
    logoSrc: "/partners/xaalispay-mark.png",
    logoAlt: "XaalisPay",
  },
  {
    badge: "Annonce StockMe",
    title: "Votre annonce ici pour seulement 500 FCFA / jour",
    description: "Gagnez en visibilité dès aujourd'hui : votre annonce mise en avant sur l'accueil. Contactez-nous !",
    ctaLabel: "Contacter",
    href: "https://wa.me/221786635331?text=Bonjour%20StockMe%2C%20je%20souhaite%20mettre%20mon%20annonce%20en%20avant%20sur%20l%27accueil.",
    icon: Megaphone,
  },
];

type AdRow = {
  id: string;
  kind: string;
  title: string | null;
  description: string | null;
  image_url: string | null;
  cta_label: string | null;
  href: string | null;
  weight: number;
  starts_at: string;
  ends_at: string | null;
  product_id: string | null;
  product_name: string | null;
  product_images: string[] | null;
  product_city: string | null;
};

const ROTATE_MS = 10000; // 10 secondes

export function SponsorCarousel() {
  const [ads, setAds] = useState<AdRow[] | null>(null);
  const [index, setIndex] = useState(0);
  const touchX = useRef<number | null>(null);

  useEffect(() => {
    supabase.rpc("get_active_ads", {}).then(({ data }) => setAds((data as AdRow[] | null) ?? []));
  }, []);

  const slides = useMemo<Slide[]>(() => {
    const now = Date.now();
    const fromAds: Slide[] = (ads ?? [])
      .filter((a) => {
        // Respect STRICT de la fenêtre de diffusion (sécurité côté client aussi).
        const start = new Date(a.starts_at).getTime();
        const end = a.ends_at ? new Date(a.ends_at).getTime() : Infinity;
        return now >= start && now <= end;
      })
      .map((a) =>
        a.kind === "product"
          ? {
              badge: "Sponsorisé",
              title: a.product_name ?? "Produit mis en avant",
              description: a.product_city ? `Produit mis en avant · ${a.product_city}` : "Produit mis en avant",
              ctaLabel: "Voir le produit",
              href: `/product/${a.product_id}`,
              logoSrc: a.product_images?.[0] ?? undefined,
              logoAlt: "",
              adId: a.id,
            }
          : {
              badge: "Annonce",
              title: a.title || "Annonce",
              description: a.description ?? undefined,
              ctaLabel: a.cta_label || "En savoir plus",
              href: a.href || "#",
              logoSrc: a.image_url ?? undefined,
              logoAlt: "",
              adId: a.id,
            },
      );

    return [...fromAds, ...HOUSE_SLIDES];
  }, [ads]);

  useEffect(() => {
    const t = window.setInterval(() => setIndex((i) => (i + 1) % slides.length), ROTATE_MS);
    return () => window.clearInterval(t);
  }, [slides.length]);

  useEffect(() => {
    if (index >= slides.length) setIndex(0);
  }, [slides.length, index]);

  const onTouchStart = (e: React.TouchEvent) => {
    touchX.current = e.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current == null) return;
    const dx = (e.changedTouches[0]?.clientX ?? touchX.current) - touchX.current;
    touchX.current = null;
    if (Math.abs(dx) < 40) return;
    setIndex((i) => (i + (dx < 0 ? 1 : -1) + slides.length) % slides.length);
  };

  const slide = slides[Math.min(index, slides.length - 1)];

  // Mesure des performances : l'annonce réellement affichée est comptée (1×/jour/visiteur).
  useEffect(() => {
    if (slide?.adId) trackAdImpression(slide.adId);
  }, [slide?.adId]);

  return (
    <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} className="touch-pan-y">
      <div key={index} className="fade-in">
        <SponsorBanner
          badge={slide.badge}
          title={slide.title}
          description={slide.description}
          ctaLabel={slide.ctaLabel}
          href={slide.href}
          logoSrc={slide.logoSrc}
          logoAlt={slide.logoAlt}
          icon={slide.icon}
          onNavigate={() => trackAdClick(slide.adId)}
        />
      </div>

      {/* Points indicateurs */}
      <div className="mt-2 flex items-center justify-center gap-1.5">
        {slides.map((_, i) => (
          <button
            key={i}
            onClick={() => setIndex(i)}
            aria-label={`Annonce ${i + 1}`}
            className={`h-1.5 rounded-full transition-all ${
              i === index ? "w-5 bg-foreground" : "w-1.5 bg-foreground/25 hover:bg-foreground/40"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
