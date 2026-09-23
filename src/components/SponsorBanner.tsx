import { ArrowRight, ShieldCheck } from "lucide-react";

type Props = {
  badge?: string;
  title: string;
  description: string;
  ctaLabel: string;
  href: string;
  icon?: React.ComponentType<{ className?: string }>;
};

export function SponsorBanner({
  badge = "Sponsorisé",
  title,
  description,
  ctaLabel,
  href,
  icon: Icon = ShieldCheck,
}: Props) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative block overflow-hidden rounded-3xl border border-foreground/15 bg-foreground text-background p-5 sm:p-7 transition hover:border-foreground/40"
    >
      {/* Halo de marque */}
      <div
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{
          background:
            "radial-gradient(560px 220px at 92% 5%, color-mix(in oklab, var(--volt) 55%, transparent), transparent 60%), radial-gradient(520px 200px at 0% 100%, color-mix(in oklab, var(--primary) 55%, transparent), transparent 62%)",
        }}
      />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-volt text-volt-foreground shadow-lg shadow-volt/30">
          <Icon className="h-6 w-6" />
        </span>

        <div className="min-w-0 flex-1">
          <span className="inline-flex items-center rounded-full border border-background/25 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-background/70">
            {badge}
          </span>
          <h3 className="mt-1.5 font-display text-lg font-bold tracking-tight sm:text-xl">{title}</h3>
          <p className="mt-1 text-sm leading-relaxed text-background/70">{description}</p>
        </div>

        <span className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-full bg-volt px-5 text-sm font-bold text-volt-foreground transition group-hover:brightness-110">
          {ctaLabel}
          <ArrowRight className="h-4 w-4" />
        </span>
      </div>
    </a>
  );
}
