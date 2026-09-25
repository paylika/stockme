import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/stockme-client";
import { requireUserId } from "@/lib/current-user";
import { uploadAvatar, MAX_PHOTO_SIZE } from "@/lib/image-upload";
import { COUNTRY_FLAGS, WEST_AFRICA_CITIES, countryOfCity } from "@/lib/constants";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";

export type EditableProfile = {
  shop_name: string | null;
  full_name: string | null;
  bio: string | null;
  city: string | null;
  phone: string | null;
  whatsapp: string | null;
  avatar_url: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: EditableProfile | null;
  email?: string | null;
  onSaved: () => void;
};

/**
 * UNE seule fenêtre pour tout modifier : photo, boutique, nom, description,
 * ville, téléphone et WhatsApp. L'e-mail est l'identifiant de connexion :
 * il reste en lecture seule.
 */
export function ProfileEditDialog({ open, onOpenChange, profile, email, onSaved }: Props) {
  const [form, setForm] = useState<EditableProfile>({
    shop_name: "",
    full_name: "",
    bio: "",
    city: "",
    phone: "",
    whatsapp: "",
    avatar_url: null,
  });
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({
      shop_name: profile?.shop_name ?? "",
      full_name: profile?.full_name ?? "",
      bio: profile?.bio ?? "",
      city: profile?.city ?? "",
      phone: profile?.phone ?? "",
      whatsapp: profile?.whatsapp ?? "",
      avatar_url: profile?.avatar_url ?? null,
    });
    setFile(null);
    setPreview("");
    setSaving(false);
  }, [open, profile]);

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.type && !f.type.startsWith("image/")) return toast.error("Choisissez une image (JPG ou PNG).");
    if (f.size > MAX_PHOTO_SIZE) return toast.error("Image trop lourde (max 15 Mo).");
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const save = async () => {
    if (!form.shop_name?.trim() && !form.full_name?.trim()) {
      return toast.error("Indiquez au moins le nom de votre boutique.");
    }
    setSaving(true);
    try {
      const userId = await requireUserId("Reconnectez-vous pour modifier votre profil.");

      let avatarUrl = form.avatar_url;
      if (file) avatarUrl = await uploadAvatar(file, userId, form.avatar_url ?? undefined);

      const { error } = await supabase
        .from("profiles")
        .update({
          shop_name: form.shop_name?.trim() || null,
          full_name: form.full_name?.trim() || null,
          bio: form.bio?.trim() || null,
          city: form.city?.trim() || null,
          phone: form.phone?.trim() || null,
          whatsapp: form.whatsapp?.trim() || null,
          avatar_url: avatarUrl,
        })
        .eq("id", userId);
      if (error) throw new Error(error.message);

      toast.success("Profil mis à jour");
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Modification impossible");
    } finally {
      setSaving(false);
    }
  };

  const avatar = preview || form.avatar_url;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] w-[calc(100%-1.5rem)] max-w-lg overflow-y-auto rounded-2xl p-5">
        <DialogHeader>
          <DialogTitle className="text-left">Modifier mon profil</DialogTitle>
          <DialogDescription className="text-left">
            Tout est modifiable ici, sauf votre e-mail (identifiant de connexion).
          </DialogDescription>
        </DialogHeader>

        {/* Photo */}
        <div className="flex items-center gap-4 rounded-2xl border border-border bg-muted/40 p-3">
          <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full bg-volt text-lg font-bold text-volt-foreground">
            {avatar ? (
              <img src={avatar} alt="" className="h-full w-full object-cover" />
            ) : (
              <span>{(form.shop_name || form.full_name || "SM").slice(0, 2).toUpperCase()}</span>
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Photo de profil / logo</p>
            <p className="text-[11px] text-muted-foreground">
              Les acheteurs font plus confiance à une boutique avec une image.
            </p>
            <label className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold hover:bg-accent">
              <Camera className="h-3.5 w-3.5" /> {avatar ? "Changer la photo" : "Ajouter une photo"}
              <input type="file" accept="image/*" className="hidden" onChange={pick} />
            </label>
          </div>
        </div>

        {/* Identité */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="shop">Nom de la boutique</Label>
            <Input
              id="shop"
              value={form.shop_name ?? ""}
              maxLength={60}
              placeholder="Ex: Chacha store"
              onChange={(e) => setForm((f) => ({ ...f, shop_name: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="who">Votre nom</Label>
            <Input
              id="who"
              value={form.full_name ?? ""}
              maxLength={60}
              placeholder="Ex: Aïcha Diallo"
              onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="bio">Description (à propos)</Label>
          <Textarea
            id="bio"
            rows={3}
            maxLength={600}
            value={form.bio ?? ""}
            placeholder="Ce que vous vendez, vos délais de livraison, vos conditions de gros…"
            onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="city">Ville</Label>
            <Input
              id="city"
              list="edit-cities"
              value={form.city ?? ""}
              placeholder="Dakar"
              onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
            />
            <datalist id="edit-cities">
              {WEST_AFRICA_CITIES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            {form.city && (
              <p className="text-[11px] text-muted-foreground">
                {COUNTRY_FLAGS[countryOfCity(form.city)] ?? ""} {countryOfCity(form.city)}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wa">WhatsApp</Label>
            <Input
              id="wa"
              type="tel"
              inputMode="tel"
              value={form.whatsapp ?? ""}
              placeholder="+221..."
              onChange={(e) => setForm((f) => ({ ...f, whatsapp: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tel">Téléphone</Label>
            <Input
              id="tel"
              type="tel"
              inputMode="tel"
              value={form.phone ?? ""}
              placeholder="+221..."
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
          </div>
        </div>

        {/* E-mail verrouillé */}
        <div className="space-y-1.5 rounded-xl bg-muted/50 px-3 py-2.5">
          <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">E-mail du compte</Label>
          <p className="text-sm font-medium">{email ?? "—"}</p>
          <p className="text-[11px] text-muted-foreground">
            C'est votre identifiant de connexion : il ne se modifie pas ici.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="volt" className="h-12 flex-1 text-sm font-bold" disabled={saving} onClick={save}>
            {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            {saving ? "Enregistrement…" : "Enregistrer"}
          </Button>
          <Button variant="outline" className="h-12 sm:w-32" onClick={() => onOpenChange(false)} disabled={saving}>
            Annuler
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
