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
      className="group flex flex-col gap-3 rounded-2xl border border-border bg-card p-3 transition hover:border-foreground/30 hover:shadow-sm sm:flex-row sm:items-center sm:gap-4 sm:p-3.5"
    >
      <div className="flex min-w-0 items-center gap-3 sm:flex-1">
        <img
          src={logoSrc}
          alt={logoAlt}
          loading="lazy"
          className="h-10 w-10 shrink-0 rounded-xl object-contain sm:h-11 sm:w-11"
        />
        <div className="min-w-0 flex-1">
          <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {badge}
          </span>
          <p className="mt-1 text-sm font-semibold leading-snug">{title}</p>
          {description && (
            <p className="mt-0.5 hidden text-xs text-muted-foreground sm:block">{description}</p>
          )}
        </div>
      </div>

      <span className="inline-flex h-10 w-full shrink-0 items-center justify-center gap-1 rounded-full bg-volt px-4 text-sm font-bold text-volt-foreground transition group-hover:brightness-110 sm:h-9 sm:w-auto sm:px-3.5 sm:text-xs">
        {ctaLabel}
        <ArrowRight className="h-3.5 w-3.5" />
      </span>
    </a>
  );
}
