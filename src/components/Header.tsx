import { Link } from "@tanstack/react-router";
import { AdminButton } from "@/components/AdminButton";
import { IconHeart } from "@/components/icons";
import { useAuth } from "@/hooks/useAuth";
import logoUrl from "@/assets/stockme-logo.jpg";

export function Header() {
  const { user } = useAuth();
  return (
    /* Fond OPAQUE (et non translucide + flou) : sur iOS, `backdrop-filter` sur
       une barre `sticky` fait scintiller / découper la barre pendant le
       défilement. Une barre pleine reste impeccable dans tous les cas. */
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background md:hidden">
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
        {/* Favoris : plus dans la barre du bas, donc ici (un seul appui). */}
        <Link
          to={user ? "/favorites" : "/auth"}
          search={(user ? undefined : { redirect: "/favorites", mode: "signup" }) as never}
          aria-label="Mes favoris"
          title="Mes favoris"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <IconHeart className="h-5 w-5" />
        </Link>
        <AdminButton />
      </div>
    </header>
  );
}
