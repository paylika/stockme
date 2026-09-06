import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { CATEGORIES, WEST_AFRICA_LOCATIONS, CITY_ZONES } from "@/lib/constants";
import { ImagePlus, X } from "lucide-react";
import { toast } from "sonner";
import { MAX_PHOTOS, MAX_PHOTO_SIZE } from "@/lib/image-upload";

export type FormImage = { url?: string; file?: File; preview: string };

export type ProductFormValues = {
  name: string;
  description: string;
  category: string;
  city: string;
  zone: string;
  price_fcfa: number;
  promo_price_fcfa: number | null;
  revenue_fcfa: number | null;
  quantity: number;
  moq: number;
  whatsapp: string;
  existingImages: string[];
  newFiles: File[];
};

export type ProductFormInitial = {
  name: string;
  description: string | null;
  category: string;
  city: string;
  zone: string | null;
  price_fcfa: number;
  promo_price_fcfa: number | null;
  revenue_fcfa: number | null;
  quantity: number;
  moq: number;
  whatsapp: string | null;
  images: string[];
};

const cleanPhone = (value: string) => value.replace(/[^+\d]/g, "").trim();

type Props = {
  initial?: ProductFormInitial | null;
  onSubmit: (values: ProductFormValues) => void | Promise<void>;
  submitLabel?: string;
  uploadingStatus?: string;
  onCancel?: () => void;
};

export function ProductForm({
  initial,
  onSubmit,
  submitLabel = "Publier",
  uploadingStatus,
  onCancel,
}: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [city, setCity] = useState(initial?.city ?? "");
  const [zone, setZone] = useState(initial?.zone ?? "");
  const [price, setPrice] = useState<number | "">(initial?.price_fcfa ?? "");
  const [promoPrice, setPromoPrice] = useState<number | "">(
    initial?.promo_price_fcfa ?? "",
  );
  const [revenue, setRevenue] = useState<number | "">(initial?.revenue_fcfa ?? "");
  const [quantity, setQuantity] = useState<number | "">(initial?.quantity ?? "");
  const [moq, setMoq] = useState<number | "">(initial?.moq ?? 1);
  const [whatsapp, setWhatsapp] = useState(initial?.whatsapp ?? "");
  const [images, setImages] = useState<FormImage[]>(
    (initial?.images ?? []).map((url) => ({ url, preview: url })),
  );
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  // onCancel est un simple lien "retour" ; si onCancel absent on rend le lien par défaut.
  useEffect(() => {
    setZone("");
  }, [city]);

  const zones = city ? (CITY_ZONES[city] ?? []) : [];

  const onFiles = (list: FileList | null) => {
    if (!list) return;
    const incoming = Array.from(list);
    if (images.length + incoming.length > MAX_PHOTOS) {
      toast.error(`Ajoutez entre 1 et ${MAX_PHOTOS} photos maximum.`);
    }
    const arr = incoming.slice(0, MAX_PHOTOS - images.length).filter((file) => {
      const isImage = file.type ? file.type.startsWith("image/") : /\.(jpe?g|png|webp|heic|heif|gif|avif)$/i.test(file.name);
      if (!isImage) {
        toast.error(`${file.name} n'est pas une image.`);
        return false;
      }
      if (file.size > MAX_PHOTO_SIZE) {
        toast.error(`${file.name} est trop lourde (max 15 Mo).`);
        return false;
      }
      return true;
    });

    if (arr.length === 0) return;
    setImages((prev) => [...prev, ...arr.map((f) => ({ file: f, preview: "" }))]);
    arr.forEach((f) => {
      const r = new FileReader();
      r.onload = () => {
        const p = r.result as string;
        setImages((prev) =>
          prev.map((img) =>
            img.file === f && !img.preview ? { ...img, preview: p } : img,
          ),
        );
      };
      r.readAsDataURL(f);
    });
  };

  const removeImage = (i: number) => {
    setImages((prev) => prev.filter((_, j) => j !== i));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const stop = (message: string) => {
      setFormError(message);
      toast.error(message);
    };
    setFormError("");
    const trimmedName = name.trim();
    const trimmedDescription = description.trim();
    const normalizedWhatsapp = cleanPhone(whatsapp);
    const existingImages = images.filter((i) => i.url).map((i) => i.url!);
    const newFiles = images.filter((i) => i.file).map((i) => i.file!);
    const totalImages = existingImages.length + newFiles.length;

    if (trimmedName.length < 2) return stop("Nom du produit requis");
    if (!category || !city) return stop("Catégorie et localité requises");
    if (totalImages < 1 || totalImages > MAX_PHOTOS)
      return stop(`Ajoutez entre 1 et ${MAX_PHOTOS} photos.`);
    if (price === "" || promoPrice === "" || quantity === "" || moq === "")
      return stop("Prix avant, prix maintenant, stock et MOQ requis");
    if (Number(price) <= 0 || Number(promoPrice) <= 0)
      return stop("Les prix doivent être supérieurs à 0");
    if (Number(promoPrice) > Number(price)) {
      return stop("Le prix maintenant ne peut pas dépasser le prix avant");
    }
    if (Number(quantity) < 0 || Number(moq) < 1) return stop("Stock ou MOQ invalide");
    if (normalizedWhatsapp.length < 9) {
      return stop("Numéro WhatsApp obligatoire avec indicatif");
    }

    setSubmitting(true);
    try {
      await onSubmit({
        name: trimmedName,
        description: trimmedDescription,
        category,
        city,
        zone: zone || "",
        price_fcfa: Number(price),
        promo_price_fcfa: Number(promoPrice),
        revenue_fcfa: revenue === "" ? null : Number(revenue),
        quantity: Number(quantity),
        moq: Number(moq),
        whatsapp: normalizedWhatsapp,
        existingImages,
        newFiles,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur pendant l'enregistrement";
      setFormError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {formError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
          {formError}
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="name">Nom du produit *</Label>
        <Input
          id="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex: T-shirts coton bio (lot)"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="desc">Description</Label>
        <Textarea
          id="desc"
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Détails techniques, état, conditions..."
        />
      </div>

      <div className="space-y-2 rounded-2xl border border-border bg-card p-3 sm:p-4">
        <div className="flex items-center justify-between gap-3">
          <Label>Photos *</Label>
          <span className="text-xs text-muted-foreground">
            {images.length}/{MAX_PHOTOS}
          </span>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
          {images.map((img, i) => (
            <div
              key={i}
              className="relative aspect-square rounded-lg overflow-hidden border border-border"
            >
              <img src={img.preview} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => removeImage(i)}
                className="absolute top-1 right-1 grid h-6 w-6 place-items-center rounded-full bg-background/90 text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          {images.length < MAX_PHOTOS && (
            <label className="aspect-square rounded-lg border-2 border-dashed border-border grid place-items-center text-muted-foreground hover:border-foreground/30 hover:text-foreground transition cursor-pointer">
              <ImagePlus className="h-6 w-6" />
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => onFiles(e.target.files)}
              />
            </label>
          )}
        </div>
        <p className="text-xs text-muted-foreground">Ajoutez 1 à 5 photos nettes du produit.</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="category">Catégorie *</Label>
          <select id="category" required value={category} onChange={(e) => setCategory(e.target.value)} className="form-select">
            <option value="">Choisir...</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="city">Pays / Ville *</Label>
          <select id="city" required value={city} onChange={(e) => setCity(e.target.value)} className="form-select">
            <option value="">Choisir...</option>
            {Object.entries(WEST_AFRICA_LOCATIONS).map(([country, cities]) => (
              <optgroup key={country} label={country}>
                {cities.map((c) => <option key={`${country}-${c}`} value={c}>{c}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
      </div>

      {zones.length > 0 && (
        <div className="space-y-1.5">
          <Label htmlFor="zone">Zone / Quartier (optionnel)</Label>
          <select id="zone" value={zone} onChange={(e) => setZone(e.target.value)} className="form-select">
            <option value="">Préciser dans {city}...</option>
            {zones.map((z) => <option key={z} value={z}>{z}</option>)}
          </select>
        </div>
      )}

      <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
        💡 StockMe est une marketplace de <span className="font-semibold text-foreground">vente en gros (B2B)</span>, pas un site e-commerce classique. Mettez un prix <span className="font-semibold text-foreground">réaliste et attractif</span> pour écouler votre lot plus vite.
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="price">Prix avant (FCFA) *</Label>
          <Input
            id="price"
            type="number"
            min={0}
            required
            value={price}
            onChange={(e) => setPrice(e.target.value === "" ? "" : Number(e.target.value))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="promo">Prix maintenant (FCFA) *</Label>
          <Input
            id="promo"
            type="number"
            min={0}
            required
            value={promoPrice}
            onChange={(e) => setPromoPrice(e.target.value === "" ? "" : Number(e.target.value))}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="qty">Stock disponible *</Label>
          <Input
            id="qty"
            type="number"
            min={0}
            required
            value={quantity}
            onChange={(e) => setQuantity(e.target.value === "" ? "" : Number(e.target.value))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="moq">Commande min (MOQ) *</Label>
          <Input
            id="moq"
            type="number"
            min={1}
            required
            value={moq}
            onChange={(e) => setMoq(e.target.value === "" ? "" : Number(e.target.value))}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="rev">Chiffre d'affaires réalisé (FCFA)</Label>
        <Input
          id="rev"
          type="number"
          min={0}
          value={revenue}
          onChange={(e) => setRevenue(e.target.value === "" ? "" : Number(e.target.value))}
          placeholder="Optionnel"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="wa">Numéro WhatsApp *</Label>
        <Input
          id="wa"
          type="tel"
          required
          placeholder="+221..."
          value={whatsapp}
          onChange={(e) => setWhatsapp(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Visible uniquement par les utilisateurs connectés.
        </p>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-border">
        <Button type="button" variant="outline" onClick={onCancel}>
          Annuler
        </Button>
        <Button type="submit" variant="volt" disabled={submitting} className="h-11 px-6">
          {submitting ? (uploadingStatus || "Publication...") : submitLabel}
        </Button>
      </div>
    </form>
  );
}
