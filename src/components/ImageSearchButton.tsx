import { useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { prepareImageForSearch } from "@/lib/image-search";

/**
 * Bouton « appareil photo » posé DANS la barre de recherche, comme sur Alibaba :
 * l'acheteur choisit une photo (ou prend la photo depuis son téléphone) et
 * StockMe reconnaît le produit, puis affiche les articles correspondants.
 */
export function ImageSearchButton({ className = "" }: { className?: string }) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setBusy(true);
    const res = await prepareImageForSearch(file);
    setBusy(false);

    if (!res.ok) {
      toast.error(res.reason);
      return;
    }
    navigate({ to: "/recherche-image" });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        title="Chercher avec une photo"
        aria-label="Chercher avec une photo"
        className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-60 ${className}`}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
      </button>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onPick} />
    </>
  );
}
