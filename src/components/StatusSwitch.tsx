import type { ComponentType } from "react";

type Tone = "success" | "volt" | "destructive" | "primary";

type Props = {
  /** Nom du réglage, ex. « En ligne » (jamais un état, toujours la propriété). */
  label: string;
  /** Petite précision affichée sous le libellé (optionnel). */
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  tone?: Tone;
  /** Phrase lue par les lecteurs d'écran, ex. « Masquer ce produit du catalogue ». */
  actionLabel?: string;
  disabled?: boolean;
  icon?: ComponentType<{ className?: string }>;
};

const TONES: Record<Tone, { bg: string; row: string; border: string; icon: string }> = {
  success: {
    bg: "bg-success",
    row: "bg-success/10",
    border: "border-success/40",
    icon: "text-success",
  },
  volt: {
    bg: "bg-volt",
    row: "bg-volt/10",
    border: "border-volt/40",
    icon: "text-volt",
  },
  destructive: {
    bg: "bg-destructive",
    row: "bg-destructive/10",
    border: "border-destructive/40",
    icon: "text-destructive",
  },
  primary: {
    bg: "bg-primary",
    row: "bg-primary/10",
    border: "border-primary/40",
    icon: "text-primary",
  },
};

/**
 * Interrupteur de statut lisible et tactile : toute la ligne est cliquable
 * (min 44 px de haut), le libellé nomme le réglage et le bouton montre
 * clairement l'état actif/inactif. Remplace les anciennes pastilles minuscules.
 */
export function StatusSwitch({
  label,
  hint,
  checked,
  onChange,
  tone = "success",
  actionLabel,
  disabled = false,
  icon: Icon,
}: Props) {
  const t = TONES[tone];

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={actionLabel ?? label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`flex w-full items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition min-h-11 disabled:opacity-60 ${
        checked ? `${t.border} ${t.row}` : "border-border bg-background hover:bg-accent"
      }`}
    >
      {Icon && <Icon className={`h-4 w-4 shrink-0 ${checked ? t.icon : "text-muted-foreground"}`} />}

      <span className="min-w-0 flex-1">
        <span
          className={`block truncate text-[13px] font-semibold leading-tight ${
            checked ? "text-foreground" : "text-muted-foreground"
          }`}
        >
          {label}
        </span>
        {hint && <span className="mt-0.5 block truncate text-[11px] leading-tight text-muted-foreground">{hint}</span>}
      </span>

      <span
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? t.bg : "bg-muted-foreground/30"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all ${
            checked ? "left-[22px]" : "left-0.5"
          }`}
        />
      </span>
    </button>
  );
}
