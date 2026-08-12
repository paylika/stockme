import { Link } from "@tanstack/react-router";
import { Phone, Mail } from "lucide-react";

export function MobileFooter() {
  return (
    <footer className="md:hidden border-t border-border bg-background mt-8 px-5 py-8 text-sm">
      <div className="space-y-5">
        <div>
          <h4 className="text-xs font-semibold tracking-[0.18em] uppercase text-muted-foreground mb-3">
            Contact
          </h4>
          <ul className="space-y-2">
            <li>
              <a
                href="tel:+221766783215"
                className="flex items-center gap-2 text-foreground"
              >
                <Phone className="h-4 w-4 text-volt" />
                +221 76 678 32 15
              </a>
            </li>
            <li className="flex items-center gap-2 text-muted-foreground">
              <Mail className="h-4 w-4" />
              contact@stockme.app
            </li>
          </ul>
        </div>

        <div>
          <h4 className="text-xs font-semibold tracking-[0.18em] uppercase text-muted-foreground mb-3">
            Informations légales
          </h4>
          <ul className="grid grid-cols-2 gap-y-2">
            <li><Link to="/legal/mentions" className="text-muted-foreground">Mentions légales</Link></li>
            <li><Link to="/legal/cgu" className="text-muted-foreground">CGU</Link></li>
            <li><Link to="/legal/confidentialite" className="text-muted-foreground">Confidentialité</Link></li>
            <li><Link to="/legal/cookies" className="text-muted-foreground">Cookies</Link></li>
          </ul>
        </div>

        <p className="pt-2 text-xs text-muted-foreground">
          © {new Date().getFullYear()} StockMe. Tous droits réservés.
        </p>
      </div>
    </footer>
  );
}
