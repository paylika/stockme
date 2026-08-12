import { Link } from "@tanstack/react-router";
import { Mail } from "lucide-react";
import logoUrl from "@/assets/stockme-logo.png";

export function Footer() {
  return (
    <footer className="hidden md:block border-t border-border bg-background mt-10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12 grid gap-10 md:grid-cols-4">
        <div className="md:col-span-2">
          <Link to="/" className="flex items-center gap-2">
            <img src={logoUrl} alt="StockMe" className="h-9 w-9 object-contain rounded-lg" />
            <span className="text-lg font-display font-medium">Stock<span className="font-bold">Me</span></span>
          </Link>
          <p className="mt-3 text-sm text-muted-foreground max-w-md">
            La plateforme qui aide les e-commerçants à écouler et trouver du stock rapidement, partout dans le pays.
          </p>
        </div>

        <div>
          <h4 className="text-xs font-semibold tracking-[0.18em] uppercase text-muted-foreground">Plateforme</h4>
          <ul className="mt-4 space-y-2 text-sm">
            <li><Link to="/" className="hover:text-foreground text-muted-foreground">Parcourir le stock</Link></li>
            <li><Link to="/auth" className="hover:text-foreground text-muted-foreground">Créer un compte</Link></li>
            <li><Link to="/dashboard" className="hover:text-foreground text-muted-foreground">Vendre du stock</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="text-xs font-semibold tracking-[0.18em] uppercase text-muted-foreground">Contact</h4>
          <ul className="mt-4 space-y-2 text-sm">
            <li className="flex items-center gap-2 text-muted-foreground">
              <Mail className="h-3.5 w-3.5" />
              <span>contact@stockme.app</span>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-5 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} StockMe. Tous droits réservés.</span>
          <span>Fait avec soin pour les e-commerçants.</span>
        </div>
      </div>
    </footer>
  );
}
