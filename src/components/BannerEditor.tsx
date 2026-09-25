import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ShopBanner } from "@/components/ShopBanner";
import { uploadImage } from "@/lib/image-upload";
import { BadgeCheck, ImagePlus, Loader2, MoveVertical, Trash2 } from "lucide-react";
import { toast } from "sonner";

type Props = {
  /** Le vendeur a-t-il le droit de personnaliser sa bannière ? (compte vérifié) */
  canEdit: boolean;
  bannerUrl: string | null;
  bannerPosition: number;
  userId: string;
  /** Enregistre immédiatement (bannière indépendante du reste du formulaire). */
  onChange: (bannerUrl: string | null, position: number) => Promise<void>;
  /** Ouvre la fenêtre d'offres pour débloquer la bannière. */
  onRequestUpgrade?: () => void;
};

/**
 * Éditeur de bannière de boutique.
 *
 *  • Non vérifié : bannière StockMe imposée (aperçu réel) + appel à la
 *    vérification. Pas de frustration cachée : on explique pourquoi.
 *  • Vérifié : téléversement, puis GLISSER l'image pour choisir la partie
 *    visible avant d'enregistrer.
 */
export function BannerEditor({ canEdit, bannerUrl, bannerPosition, userId, onChange, onRequestUpgrade }: Props) {
  const [url, setUrl] = useState<string | null>(bannerUrl);
  const [position, setPosition] = useState(bannerPosition ?? 50);
  const [savedPosition, setSavedPosition] = useState(bannerPosition ?? 50);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const dragRef = useRef<{ startY: number; startPos: number } | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setUrl(bannerUrl);
    setPosition(bannerPosition ?? 50);
    setSavedPosition(bannerPosition ?? 50);
  }, [bannerUrl, bannerPosition]);

  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const uploaded = await uploadImage(file, userId, "banner");
      setUrl(uploaded);
      toast.success("Bannière téléversée — faites glisser pour bien la cadrer, puis enregistrez.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Téléversement impossible");
    } finally {
      setUploading(false);
    }
  };

  /* ---- Glissement vertical pour choisir la zone visible ---- */
  const onPointerDown = (e: React.PointerEvent) => {
    if (!canEdit || !url) return;
    dragRef.current = { startY: e.clientY, startPos: position };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const frame = frameRef.current;
    if (!frame) return;
    // 100 px de glissement = 40 % de déplacement du point focal
    const delta = ((e.clientY - dragRef.current.startY) / Math.max(frame.clientHeight, 1)) * 100;
    const next = Math.max(0, Math.min(100, Math.round(dragRef.current.startPos + delta * 1.2)));
    setPosition(next);
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  const save = async () => {
    setSaving(true);
    try {
      await onChange(url, position);
      setSavedPosition(position);
      toast.success("Bannière enregistrée");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Enregistrement impossible");
    } finally {
      setSaving(false);
    }
  };

  const dirty = position !== savedPosition || url !== bannerUrl;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">Bannière de la boutique</p>
        {canEdit && (
          <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-semibold text-success">
            <BadgeCheck className="h-3 w-3" /> Personnalisable
          </span>
        )}
      </div>

      {/* Aperçu = exactement ce que verront les acheteurs */}
      <div
        ref={frameRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={`relative overflow-hidden rounded-2xl ${canEdit && url ? "cursor-grab active:cursor-grabbing" : ""}`}
      >
        <ShopBanner src={url} position={position} className="h-28 sm:h-36" />
        {canEdit && url && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-black/45 py-1 text-[10px] font-medium text-white/90 backdrop-blur-sm">
            <MoveVertical className="h-3 w-3" /> Faites glisser pour cadrer
          </div>
        )}
      </div>

      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2">
          <label className="cursor-pointer">
            <span className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border bg-background px-3 text-xs font-semibold hover:bg-accent">
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
              {url ? "Changer l'image" : "Ajouter une bannière"}
            </span>
            <input type="file" accept="image/*" className="hidden" onChange={pick} disabled={uploading} />
          </label>

          {dirty && (
            <Button variant="volt" className="h-10 text-xs font-bold" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              Enregistrer la bannière
            </Button>
          )}

          {url && (
            <button
              type="button"
              onClick={() => {
                setUrl(null);
                setPosition(50);
              }}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-medium text-muted-foreground hover:border-destructive/50 hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" /> Bannière par défaut
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-volt/40 bg-volt/10 px-3 py-2.5">
          <p className="text-xs leading-relaxed">
            <strong>Votre boutique affiche la bannière StockMe.</strong> La personnalisation de la bannière est
            réservée aux boutiques vérifiées — c'est l'un des avantages du badge.
          </p>
          {onRequestUpgrade && (
            <Button variant="volt" size="sm" className="mt-2 h-9 text-xs font-bold" onClick={onRequestUpgrade}>
              <BadgeCheck className="mr-1.5 h-3.5 w-3.5" /> Faire vérifier ma boutique
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
