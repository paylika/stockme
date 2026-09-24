import { Link } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { isAdminEmail } from "@/lib/constants";

/** Bouton d'accès à la console admin — affiché uniquement pour les admins. */
export function AdminButton({ className = "" }: { className?: string }) {
  const { user } = useAuth();
  if (!isAdminEmail(user?.email)) return null;
  return (
    <Link
      to="/admin"
      aria-label="Console admin"
      title="Console admin"
      className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs font-semibold text-primary transition hover:bg-accent ${className}`}
    >
      <ShieldCheck className="h-4 w-4" />
      Admin
    </Link>
  );
}
