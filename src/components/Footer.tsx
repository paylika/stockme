import { Link } from "@tanstack/react-router";
import { Mail, MessageCircle, Phone } from "lucide-react";
import logoUrl from "@/assets/stockme-logo.png";

const CONTACT_EMAIL = "app.orderly@gmail.com";
const WHATSAPP_DISPLAY = "+221 78 663 53 31";
const WHATSAPP_DIGITS = "221786635331";

export function Footer() {
  return (
    <footer className="hidden md:block border-t border-border bg-background mt-10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-14 grid gap-10 md:grid-cols-2 lg:grid-cols-5">
        {/* Marque */}
        <div className="lg:col-span-2">
          <Link to="/" className="flex items-center gap-2">
            <img src={logoUrl} alt="StockMe" className="h-9 w-9 object-contain rounded-lg" />
            <span className="text-lg font-display font-medium">Stock<span className="font-bold">Me</span></span>
          </Link>
          <p className="mt-4 text-sm text-muted-foreground max-w-md leading-relaxed">
            La marketplace B2B d'Afrique de l'Ouest : écoulez votre stock dormant et trouvez des produits en gros près de chez vous.
          </p>
        </div>

        {/* Plateforme */}
        <div>
          <h4 className="text-xs font-semibold tracking-[0.18em] uppercase text-muted-foreground">Plateforme</h4>
          <ul className="mt-4 space-y-2.5 text-sm">
            <li><Link to="/" className="text-muted-foreground transition-colors hover:text-foreground">Parcourir le stock</Link></li>
            <li><Link to="/browse" className="text-muted-foreground transition-colors hover:text-foreground">Rechercher</Link></li>
            <li><Link to="/auth" className="text-muted-foreground transition-colors hover:text-foreground">Créer un compte</Link></li>
            <li><Link to="/dashboard" className="text-muted-foreground transition-colors hover:text-foreground">Vendre du stock</Link></li>
          </ul>
        </div>

        {/* Légal */}
        <div>
          <h4 className="text-xs font-semibold tracking-[0.18em] uppercase text-muted-foreground">Légal</h4>
          <ul className="mt-4 space-y-2.5 text-sm">
            <li><Link to="/legal/mentions" className="text-muted-foreground transition-colors hover:text-foreground">Mentions légales</Link></li>
            <li><Link to="/legal/cgu" className="text-muted-foreground transition-colors hover:text-foreground">CGU</Link></li>
            <li><Link to="/legal/confidentialite" className="text-muted-foreground transition-colors hover:text-foreground">Confidentialité</Link></li>
            <li><Link to="/legal/cookies" className="text-muted-foreground transition-colors hover:text-foreground">Cookies</Link></li>
          </ul>
        </div>

        {/* Contact */}
        <div>
          <h4 className="text-xs font-semibold tracking-[0.18em] uppercase text-muted-foreground">Contact</h4>
          <ul className="mt-4 space-y-2.5 text-sm">
            <li>
              <a href={`mailto:${CONTACT_EMAIL}`} className="inline-flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground">
                <Mail className="h-3.5 w-3.5 shrink-0" /> {CONTACT_EMAIL}
              </a>
            </li>
            <li>
              <a href={`https://wa.me/${WHATSAPP_DIGITS}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground">
                <MessageCircle className="h-3.5 w-3.5 shrink-0" /> WhatsApp
              </a>
            </li>
            <li>
              <a href={`tel:+${WHATSAPP_DIGITS}`} className="inline-flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground">
                <Phone className="h-3.5 w-3.5 shrink-0" /> {WHATSAPP_DISPLAY}
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-5 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} StockMe. Tous droits réservés.</span>
          <span className="inline-flex flex-wrap items-center gap-3">
            <Link to="/legal/mentions" className="transition-colors hover:text-foreground">Mentions légales</Link>
            <Link to="/legal/cgu" className="transition-colors hover:text-foreground">CGU</Link>
            <Link to="/legal/confidentialite" className="transition-colors hover:text-foreground">Confidentialité</Link>
            <Link to="/legal/cookies" className="transition-colors hover:text-foreground">Cookies</Link>
          </span>
        </div>
      </div>
    </footer>
  );
}
