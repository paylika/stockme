import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { IconWhatsApp } from "@/components/icons";

const GROUP_URL =
  "https://chat.whatsapp.com/JydaSl9sHWf3modDFyUToL?s=cl&p=a&mlu=4&ilr=4";

const NEVER_KEY = "stockme:wa-group-never";
const SESSION_KEY = "stockme:wa-group-session";

/** Pop d'invitation au groupe WhatsApp — uniquement pour les utilisateurs connectés. */
export function WhatsAppGroupPopup() {
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (loading || !user || typeof window === "undefined") return;
    if (localStorage.getItem(NEVER_KEY) === "1") return;
    if (sessionStorage.getItem(SESSION_KEY) === "1") return;
    const t = window.setTimeout(() => setOpen(true), 4000);
    return () => window.clearTimeout(t);
  }, [loading, user]);

  const closeForSession = () => {
    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  const dismissForever = () => {
    try {
      localStorage.setItem(NEVER_KEY, "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  if (!open || !user) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Rejoindre le groupe WhatsApp StockMe"
    >
      <button
        aria-label="Fermer"
        onClick={closeForSession}
        className="absolute inset-0 cursor-default bg-black/50 backdrop-blur-sm"
      />

      <div className="relative w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl fade-in">
        <button
          onClick={closeForSession}
          aria-label="Fermer"
          className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition hover:bg-accent hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#25D366] text-white shadow-lg shadow-[#25D366]/30">
          <IconWhatsApp className="h-6 w-6" />
        </span>

        <h2 className="mt-3 font-display text-lg font-bold tracking-tight">
          Rejoignez le groupe WhatsApp StockMe
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          Nouveaux stocks, bons plans et annonces <strong className="text-foreground">en direct</strong>.
          Soyez les premiers informés.
        </p>

        <a
          href={GROUP_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={closeForSession}
          className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-volt text-sm font-bold text-volt-foreground transition hover:brightness-110"
        >
          <IconWhatsApp className="h-4 w-4" /> Rejoindre le groupe
        </a>

        <button
          onClick={dismissForever}
          className="mt-3 w-full text-center text-xs text-muted-foreground underline underline-offset-2 transition hover:text-foreground"
        >
          Ne plus afficher
        </button>
      </div>
    </div>
  );
}
