import { useEffect, useRef, useState } from "react";
import { Megaphone } from "lucide-react";
import { SponsorBanner } from "@/components/SponsorBanner";

const SLIDES = [
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
    title: "Votre produit ici pour seulement 1 000 FCFA",
    description: "Gagnez en visibilité dès aujourd'hui : votre produit mis en avant sur l'accueil. Contactez-nous !",
    ctaLabel: "Contacter",
    href: "https://wa.me/221786635331?text=Bonjour%20StockMe%2C%20je%20souhaite%20mettre%20mon%20produit%20en%20avant%20sur%20l%27accueil.",
    icon: Megaphone,
  },
] as const;

const ROTATE_MS = 60000; // 1 minute

export function SponsorCarousel() {
  const [index, setIndex] = useState(0);
  const touchX = useRef<number | null>(null);

  useEffect(() => {
    const t = window.setInterval(() => setIndex((i) => (i + 1) % SLIDES.length), ROTATE_MS);
    return () => window.clearInterval(t);
  }, []);

  const onTouchStart = (e: React.TouchEvent) => {
    touchX.current = e.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current == null) return;
    const dx = (e.changedTouches[0]?.clientX ?? touchX.current) - touchX.current;
    touchX.current = null;
    if (Math.abs(dx) < 40) return;
    setIndex((i) => (i + (dx < 0 ? 1 : -1) + SLIDES.length) % SLIDES.length);
  };

  const slide = SLIDES[index];

  return (
    <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} className="touch-pan-y">
      <div key={index} className="fade-in">
        <SponsorBanner
          badge={slide.badge}
          title={slide.title}
          description={slide.description}
          ctaLabel={slide.ctaLabel}
          href={slide.href}
          logoSrc={"logoSrc" in slide ? slide.logoSrc : undefined}
          logoAlt={"logoAlt" in slide ? slide.logoAlt : undefined}
          icon={"icon" in slide ? slide.icon : undefined}
        />
      </div>

      {/* Points indicateurs */}
      <div className="mt-2 flex items-center justify-center gap-1.5">
        {SLIDES.map((_, i) => (
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
