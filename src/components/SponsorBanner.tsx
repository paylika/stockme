import { ArrowRight } from "lucide-react";

type Props = {
  badge?: string;
  title: string;
  description?: string;
  ctaLabel: string;
  href: string;
  logoSrc: string;
  logoAlt?: string;
};

export function SponsorBanner({
  badge = "Sponsorisé",
  title,
  description,
  ctaLabel,
  href,
  logoSrc,
  logoAlt = "",
}: Props) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-3 rounded-2xl border border-border bg-card px-3 py-2.5 transition hover:border-foreground/30 hover:shadow-sm sm:gap-4 sm:px-4 sm:py-3"
    >
      <img
        src={logoSrc}
        alt={logoAlt}
        loading="lazy"
        className="h-11 w-11 shrink-0 rounded-xl object-contain"
      />

      <div className="min-w-0 flex-1">
        <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {badge}
        </span>
        <p className="mt-1 line-clamp-1 text-sm font-semibold">{title}</p>
        {description && (
          <p className="mt-0.5 hidden line-clamp-1 text-xs text-muted-foreground sm:block">{description}</p>
        )}
      </div>

      <span className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full bg-volt px-3.5 text-xs font-bold text-volt-foreground transition group-hover:brightness-110">
        {ctaLabel}
        <ArrowRight className="h-3.5 w-3.5" />
      </span>
    </a>
  );
}
