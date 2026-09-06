import { Link } from "@tanstack/react-router";
import { Phone, Mail, MessageCircle } from "lucide-react";

const CONTACT_EMAIL = "app.orderly@gmail.com";
const WHATSAPP_DISPLAY = "+221 78 663 53 31";
const WHATSAPP_DIGITS = "221786635331";

export function MobileFooter() {
  return (
    <footer className="md:hidden border-t border-border bg-background mt-8 px-5 py-8 text-sm">
      <div className="space-y-5">
        <div>
          <h4 className="text-xs font-semibold tracking-[0.18em] uppercase text-muted-foreground mb-3">
            Contact
          </h4>
          <ul className="space-y-2.5">
            <li>
              <a href={`tel:+${WHATSAPP_DIGITS}`} className="flex items-center gap-2 text-foreground">
                <Phone className="h-4 w-4 text-volt" /> {WHATSAPP_DISPLAY}
              </a>
            </li>
            <li>
              <a href={`https://wa.me/${WHATSAPP_DIGITS}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-foreground">
                <MessageCircle className="h-4 w-4 text-volt" /> WhatsApp
              </a>
            </li>
            <li className="flex items-center gap-2 text-muted-foreground break-all">
              <Mail className="h-4 w-4" /> {CONTACT_EMAIL}
            </li>
          </ul>
        </div>

        <div>
          <h4 className="text-xs font-semibold tracking-[0.18em] uppercase text-muted-foreground mb-3">
            Informations légales
          </h4>
          <ul className="grid grid-cols-2 gap-y-2">
            <li><Link to="/legal/mentions" className="text-muted-foreground transition-colors hover:text-foreground">Mentions légales</Link></li>
            <li><Link to="/legal/cgu" className="text-muted-foreground transition-colors hover:text-foreground">CGU</Link></li>
            <li><Link to="/legal/confidentialite" className="text-muted-foreground transition-colors hover:text-foreground">Confidentialité</Link></li>
            <li><Link to="/legal/cookies" className="text-muted-foreground transition-colors hover:text-foreground">Cookies</Link></li>
          </ul>
        </div>

        <p className="pt-2 text-xs text-muted-foreground">
          © {new Date().getFullYear()} StockMe. Tous droits réservés.
        </p>
      </div>
    </footer>
  );
}
