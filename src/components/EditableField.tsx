import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/stockme-client";
import { requireUserId } from "@/lib/current-user";
import { Check, Loader2, Pencil, X } from "lucide-react";
import { toast } from "sonner";

/** Colonnes de `profiles` modifiables sur place (l'e-mail du compte ne l'est pas). */
export type EditableProfileField = "shop_name" | "full_name" | "bio" | "city" | "phone" | "whatsapp";

type Props = {
  /** Colonne de `profiles` à mettre à jour. */
  field: EditableProfileField;
  value: string | null | undefined;
  placeholder?: string;
  /** Saisie sur plusieurs lignes (bio). */
  multiline?: boolean;
  type?: "text" | "tel" | "email";
  /** Rendu personnalisé de la valeur en lecture (ex. drapeau + ville). */
  render?: (value: string) => ReactNode;
  /** Champ non modifiable (l'e-mail du compte). */
  locked?: boolean;
  maxLength?: number;
  /** Suggestions (villes par exemple). */
  listId?: string;
  onSaved: (next: string) => void;
  className?: string;
  inputClassName?: string;
  ariaLabel: string;
  icon?: ComponentType<{ className?: string }>;
};

/**
 * Champ du profil modifiable sur place : on clique sur le crayon, on corrige,
 * on valide. Tout est modifiable sauf l'e-mail du compte (identifiant de
 * connexion, non modifiable ici).
 */
export function EditableField({
  field,
  value,
  placeholder = "Non renseigné",
  multiline = false,
  type = "text",
  render,
  locked = false,
  maxLength = 160,
  listId,
  onSaved,
  className = "",
  inputClassName = "",
  ariaLabel,
  icon: Icon,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setDraft(value ?? "");
  }, [value]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const save = async () => {
    const next = draft.trim();
    if (next === (value ?? "").trim()) {
      setEditing(false);
      return;
    }
    if (maxLength && next.length > maxLength) {
      toast.error(`Maximum ${maxLength} caractères.`);
      return;
    }

    setSaving(true);
    try {
      const userId = await requireUserId("Reconnectez-vous pour modifier votre profil.");
      const patch: Partial<Record<EditableProfileField, string | null>> = { [field]: next || null };
      const { error } = await supabase
        .from("profiles")
        .update(patch)
        .eq("id", userId);
      if (error) throw new Error(error.message);
      toast.success("Profil mis à jour");
      setEditing(false);
      onSaved(next);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Modification impossible");
    } finally {
      setSaving(false);
    }
  };

  /* ---------- Mode édition ---------- */
  if (editing) {
    return (
      <span className={`flex w-full items-start gap-1.5 ${className}`}>
        {multiline ? (
          <textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            rows={3}
            value={draft}
            maxLength={maxLength}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={placeholder}
            className={`form-input h-auto min-h-[76px] py-2 ${inputClassName}`}
          />
        ) : (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type={type}
            value={draft}
            maxLength={maxLength}
            list={listId}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                save();
              }
              if (e.key === "Escape") setEditing(false);
            }}
            placeholder={placeholder}
            className={`form-input ${inputClassName}`}
          />
        )}

        <span className="flex shrink-0 items-center gap-1 pt-0.5">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            aria-label="Enregistrer"
            className="grid h-9 w-9 place-items-center rounded-lg bg-volt text-volt-foreground transition hover:brightness-110 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => {
              setDraft(value ?? "");
              setEditing(false);
            }}
            aria-label="Annuler"
            className="grid h-9 w-9 place-items-center rounded-lg border border-border transition hover:bg-accent"
          >
            <X className="h-4 w-4" />
          </button>
        </span>
      </span>
    );
  }

  /* ---------- Mode lecture ---------- */
  const empty = !value || !value.trim();

  return (
    <span className={`group inline-flex min-w-0 items-center gap-1.5 ${className}`}>
      {Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
      <span className={`min-w-0 truncate ${empty ? "italic text-muted-foreground" : ""}`}>
        {empty ? placeholder : render ? render(value as string) : value}
      </span>

      {locked ? (
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">compte</span>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label={`Modifier : ${ariaLabel}`}
          title={`Modifier : ${ariaLabel}`}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted-foreground opacity-60 transition hover:bg-accent hover:text-foreground group-hover:opacity-100"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}
    </span>
  );
}
