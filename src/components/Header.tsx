import { Link } from "@tanstack/react-router";
import logoUrl from "@/assets/stockme-logo.png";

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-xl md:hidden">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-3">
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <img
            src={logoUrl}
            alt="StockMe"
            className="h-8 w-8 object-contain rounded-lg"
          />
          <span className="text-base font-display font-medium tracking-tight text-foreground">
            Stock<span className="font-bold">Me</span>
          </span>
        </Link>
        <div className="flex-1" />
      </div>
    </header>
  );
}
