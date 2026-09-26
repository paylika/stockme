import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  CATEGORIES,
  WEST_AFRICA_LOCATIONS,
  WEST_AFRICA_COUNTRIES,
  CITY_ZONES,
  CITY_TO_COUNTRY,
  SENEGAL_REGIONS,
  SENEGAL_REGION_NAMES,
} from "@/lib/constants";
import { ImagePlus, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { MAX_PHOTOS, MAX_PHOTO_SIZE } from "@/lib/image-upload";
import { formatFCFA } from "@/lib/format";
import { normalizeTiers, validateTiers, type PriceTier } from "@/lib/price-tiers";

export type FormImage = { url?: string; file?: File; preview: string };

export type ProductFormValues = {
  name: string;
  description: string;
  category: string;
  city: string;
  zone: string;
  price_fcfa: number;
  promo_price_fcfa: number | null;
  quantity: number;
  moq: number;
  whatsapp: string;
  dropshipping: boolean;
  sizes: string[];
  colors: string[];
  weight_grams: number | null;
  /** Paliers de prix par quantité (facultatif) : plus on prend, moins c'est cher. */
  price_tiers: PriceTier[] | null;
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
  quantity: number;
  moq: number;
  whatsapp: string | null;
  dropshipping: boolean;
  sizes: string[];
  colors: string[];
  weight_grams: number | null;
  price_tiers?: unknown;
  images: string[];
};

const cleanPhone = (value: string) => value.replace(/[^+\d]/g, "").trim();

const SIZE_OPTIONS = ["XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL", "5XL"];
const COLOR_OPTIONS = ["Noir", "Blanc", "Beige", "Gris", "Bleu", "Rouge", "Vert", "Jaune", "Marron", "Rose", "Violet", "Orange", "Doré"];

/**
 * Tailles proposées SELON LA CATÉGORIE, en groupes distincts.
 *
 * Avant, tout était mélangé dans une seule rangée (du XS au 5XL) : un vendeur de
 * chaussures ne trouvait pas ses pointures, et un vendeur de cosmétiques voyait
 * des tailles qui ne le concernent pas. Désormais chaque catégorie a ses
 * groupes, clairement étiquetés — et on peut toujours ajouter une taille libre.
 */
const SIZE_PRESET_GROUPS: Record<string, { label: string; values: string[] }[]> = {
  "Mode & Textile": [
    { label: "Vêtements", values: ["XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL", "5XL"] },
    { label: "Pointures", values: ["36", "37", "38", "39", "40", "41", "42", "43", "44", "45", "46"] },
  ],
  "Sport & Loisirs": [{ label: "Vêtements", values: ["XS", "S", "M", "L", "XL", "XXL"] }],
  "Bébé & Enfant": [
    { label: "Âges", values: ["0-3 mois", "3-6 mois", "6-12 mois", "1-2 ans", "2-4 ans", "4-6 ans", "6-8 ans"] },
  ],
};

/** Couleur réelle affichée dans la pastille. */
const COLOR_HEX: Record<string, string> = {
  Noir: "#111827",
  Blanc: "#ffffff",
  Beige: "#e7d8c9",
  Gris: "#9ca3af",
  Bleu: "#2563eb",
  Rouge: "#dc2626",
  Vert: "#16a34a",
  Jaune: "#facc15",
  Marron: "#8b5e3c",
  Rose: "#ec4899",
  Violet: "#7c3aed",
  Orange: "#f97316",
  Doré: "#d4af37",
};

type Props = {
  initial?: ProductFormInitial | null;
  onSubmit: (values: ProductFormValues) => void | Promise<void>;
  submitLabel?: string;
  uploadingStatus?: string;
  onCancel?: () => void;
  /** Nombre de photos autorisées : 2 en compte gratuit, 5 pour un vendeur vérifié. */
  maxPhotos?: number;
  /** Numéro WhatsApp du compte : pré-rempli pour ne pas le retaper à chaque produit. */
  defaultWhatsapp?: string | null;
};

export function ProductForm({
  initial,
  onSubmit,
  submitLabel = "Publier",
  uploadingStatus,
  defaultWhatsapp,
  onCancel,
  maxPhotos = MAX_PHOTOS,
}: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [city, setCity] = useState(initial?.city ?? "");
  const [country, setCountry] = useState<string>(
    () => (initial?.city ? CITY_TO_COUNTRY[initial.city] : undefined) ?? "Sénégal",
  );
  const [region, setRegion] = useState<string>(() => {
    const c = initial?.city ?? "";
    return SENEGAL_REGION_NAMES.find((r) => SENEGAL_REGIONS[r]?.includes(c)) ?? "";
  });
  const [zone, setZone] = useState(initial?.zone ?? "");
  const [price, setPrice] = useState<number | "">(initial?.price_fcfa ?? "");
  // Le prix promo est FACULTATIF : vide = pas de promotion, donc pas de badge.
  const [promoPrice, setPromoPrice] = useState<number | "">(
    initial?.promo_price_fcfa ?? "",
  );
  // Paliers de prix par quantité : de X à Y pièces → Z F l'unité.
  const [tiers, setTiers] = useState<{ from: number | ""; to: number | ""; price: number | "" }[]>(
    () => normalizeTiers(initial?.price_tiers).map((t) => ({ from: t.from, to: t.to ?? "", price: t.price })),
  );
  const [quantity, setQuantity] = useState<number | "">(initial?.quantity ?? "");
  const [moq, setMoq] = useState<number | "">(initial?.moq ?? 1);
  const [whatsapp, setWhatsapp] = useState(initial?.whatsapp ?? defaultWhatsapp ?? "");
  const [dropshipping, setDropshipping] = useState(initial?.dropshipping ?? false);
  const [sizes, setSizes] = useState<string[]>(initial?.sizes ?? []);
  const [colors, setColors] = useState<string[]>(initial?.colors ?? []);
  const [colorInput, setColorInput] = useState("");
  const [sizeInput, setSizeInput] = useState("");
  // Poids : on stocke toujours en grammes, mais le vendeur choisit son unité.
  const [weightValue, setWeightValue] = useState<number | "">(() => {
    const g = initial?.weight_grams;
    if (g == null) return "";
    return g >= 1000 ? Math.round((g / 1000) * 100) / 100 : g;
  });
  const [weightUnit, setWeightUnit] = useState<"kg" | "g">(
    initial?.weight_grams != null && initial.weight_grams >= 1000 ? "kg" : "g",
  );
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

  const isSenegal = country === "Sénégal";
  const cityOptions = isSenegal
    ? region
      ? SENEGAL_REGIONS[region] ?? []
      : Array.from(new Set(Object.values(SENEGAL_REGIONS).flat())).sort((a, b) => a.localeCompare(b, "fr"))
    : WEST_AFRICA_LOCATIONS[country] ?? [];

  const toggleSize = (s: string) =>
    setSizes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  const toggleColor = (c: string) =>
    setColors((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  /** Ajout d'une taille libre (pointure, contenance, âge…). */
  const addSize = () => {
    const v = sizeInput.trim();
    if (!v) return;
    setSizes((prev) => (prev.some((s) => s.toLowerCase() === v.toLowerCase()) ? prev : [...prev, v]));
    setSizeInput("");
  };

  const addColor = () => {
    const c = colorInput.trim();
    if (!c) return;
    setColors((prev) => (prev.includes(c) ? prev : [...prev, c]));
    setColorInput("");
  };

  // Groupes de tailles de la catégorie choisie (vêtements / pointures / âges).
  const sizeGroups = SIZE_PRESET_GROUPS[category] ?? [];
  const presetValues = sizeGroups.flatMap((g) => g.values);

  const onFiles = (list: FileList | null) => {
    if (!list) return;
    const incoming = Array.from(list);
    if (images.length + incoming.length > maxPhotos) {
      toast.error(`Ajoutez entre 1 et ${maxPhotos} photos maximum.`);
    }
    const arr = incoming.slice(0, maxPhotos - images.length).filter((file) => {
      const isImage = file.type ? file.type.startsWith("image/") : /\.(jpe?g|png|webp|heic|heif|gif|avif)$/i.test(file.name);
      if (!isImage) {
        toast.error(`${file.name} n'est pas une image.`);
        return false;
      }
      if (file.size > MAX_PHOTO_SIZE) {
        toast.error(`${file.name} est trop lourde (max 15 Mo). Choisissez une photo plus légère.`);
        return false;
      }
      return true;
    });

    if (arr.length === 0) return;
    // Aperçu via object URL : beaucoup plus léger en mémoire que les data URL
    // (5 photos de 15 Mo en base64 faisaient planter l'onglet sur mobile).
    const added: FormImage[] = arr.map((f) => ({ file: f, preview: URL.createObjectURL(f) }));
    setImages((prev) => [...prev, ...added]);
  };

  const removeImage = (i: number) => {
    setImages((prev) => {
      const target = prev[i];
      if (target?.file && target.preview.startsWith("blob:")) URL.revokeObjectURL(target.preview);
      return prev.filter((_, j) => j !== i);
    });
  };

  // Libère la mémoire des aperçus quand on quitte la page.
  const imagesRef = useRef(images);
  imagesRef.current = images;
  useEffect(
    () => () => {
      imagesRef.current.forEach((img) => {
        if (img.file && img.preview.startsWith("blob:")) URL.revokeObjectURL(img.preview);
      });
    },
    [],
  );

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
    if (totalImages < 1 || totalImages > maxPhotos)
      return stop(`Ajoutez entre 1 et ${maxPhotos} photos.`);
    if (price === "" || quantity === "" || moq === "")
      return stop("Prix, stock et MOQ requis");
    if (Number(price) <= 0) return stop("Le prix doit être supérieur à 0");
    const promoValue = promoPrice === "" ? null : Number(promoPrice);
    if (promoValue !== null) {
      if (promoValue <= 0) return stop("Le prix promo doit être supérieur à 0");
      if (promoValue >= Number(price))
        return stop("Le prix promo doit être INFÉRIEUR au prix normal (sinon il n'y a pas de promotion)");
    }
    if (Number(quantity) < 0 || Number(moq) < 1) return stop("Stock ou MOQ invalide");

    // Paliers de prix : quantités croissantes, prix décroissants, dans le MOQ.
    const cleanTiers: PriceTier[] = tiers
      .filter((t) => t.from !== "" && t.price !== "")
      .map((t) => ({ from: Number(t.from), to: t.to === "" ? null : Number(t.to), price: Number(t.price) }));
    const tierError = validateTiers(cleanTiers, Number(moq), promoValue ?? Number(price));
    if (tierError) return stop(tierError);
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
        promo_price_fcfa: promoValue,
        quantity: Number(quantity),
        moq: Number(moq),
        whatsapp: normalizedWhatsapp,
        dropshipping,
        sizes,
        colors,
        weight_grams:
          weightValue === ""
            ? null
            : Math.round(weightUnit === "kg" ? Number(weightValue) * 1000 : Number(weightValue)),
        price_tiers: cleanTiers.length > 0 ? cleanTiers : null,
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
            {images.length}/{maxPhotos}
          </span>
        </div>
        {/* Une SEULE ligne qui défile : avec 10 photos, une grille passait sur
            2 ou 3 lignes et repoussait tout le formulaire vers le bas. */}
        <div className="no-scrollbar -mx-1 flex snap-x gap-2.5 overflow-x-auto px-1 pb-1">
          {images.map((img, i) => (
            <div
              key={i}
              className="relative aspect-square w-24 shrink-0 snap-start overflow-hidden rounded-lg border border-border sm:w-28"
            >
              <img src={img.preview} alt="" className="h-full w-full object-cover" />
              {/* Numéro : la 1re photo est la vignette affichée dans le catalogue. */}
              <span className="absolute bottom-1 left-1 rounded-full bg-background/85 px-1.5 text-[10px] font-bold">
                {i + 1}
              </span>
              <button
                type="button"
                aria-label={`Retirer la photo ${i + 1}`}
                onClick={() => removeImage(i)}
                className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-background/90 text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          {images.length < maxPhotos && (
            <label className="grid aspect-square w-24 shrink-0 snap-start cursor-pointer place-items-center rounded-lg border-2 border-dashed border-border text-muted-foreground transition hover:border-foreground/30 hover:text-foreground sm:w-28">
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
        <p className="text-xs text-muted-foreground">
          {images.length > 1 && (
            <>
              <strong className="text-foreground">Glissez la ligne</strong> pour voir toutes vos photos.{" "}
            </>
          )}
          Ajoutez 1 à {maxPhotos} photos nettes du produit. La 1<sup>re</sup> sert de vignette dans le catalogue. Elles
          sont <strong className="text-foreground">compressées automatiquement</strong> avant l'envoi : la publication
          fonctionne même avec une connexion lente.
        </p>
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
          <Label htmlFor="country">Pays *</Label>
          <select
            id="country"
            required
            value={country}
            onChange={(e) => { setCountry(e.target.value); setRegion(""); setCity(""); }}
            className="form-select"
          >
            {WEST_AFRICA_COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {isSenegal && (
          <div className="space-y-1.5">
            <Label htmlFor="region">Région *</Label>
            <select
              id="region"
              required
              value={region}
              onChange={(e) => { setRegion(e.target.value); setCity(""); }}
              className="form-select"
            >
              <option value="">Choisir...</option>
              {SENEGAL_REGION_NAMES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="city">{isSenegal ? "Ville / Commune *" : "Ville *"}</Label>
          <select
            id="city"
            required
            value={city}
            disabled={isSenegal && !region}
            onChange={(e) => setCity(e.target.value)}
            className="form-select disabled:cursor-not-allowed disabled:opacity-60"
          >
            <option value="">{isSenegal && !region ? "Choisir la région d'abord" : "Choisir..."}</option>
            {city && !cityOptions.includes(city) && <option value={city}>{city}</option>}
            {cityOptions.map((c) => <option key={c} value={c}>{c}</option>)}
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
          <Label htmlFor="price">Prix normal (FCFA) *</Label>
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
          <Label htmlFor="promo">Prix promo (FCFA) — facultatif</Label>
          <Input
            id="promo"
            type="number"
            min={0}
            placeholder="laisser vide = pas de promo"
            value={promoPrice}
            onChange={(e) => setPromoPrice(e.target.value === "" ? "" : Number(e.target.value))}
          />
        </div>
      </div>

      {/* Aperçu du badge rouge : on montre au vendeur ce que l'acheteur verra. */}
      {promoPrice !== "" && Number(price) > 0 && Number(promoPrice) < Number(price) && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs">
          <span className="inline-flex items-center gap-1 rounded-full bg-destructive px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
            −{Math.round((1 - Number(promoPrice) / Number(price)) * 100)} % promo
          </span>
          <span className="text-muted-foreground">
            Vos acheteurs verront{" "}
            <strong className="text-foreground">{formatFCFA(Number(promoPrice))}</strong> au lieu de{" "}
            <span className="line-through">{formatFCFA(Number(price))}</span>.
          </span>
        </div>
      )}
      {promoPrice !== "" && Number(price) > 0 && Number(promoPrice) >= Number(price) && (
        <p className="rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          Le prix promo doit être inférieur au prix normal.
        </p>
      )}

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

      {/* ===== Paliers de prix (le cœur du gros) ===== */}
      <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <div>
          <Label>Prix dégressifs par quantité — recommandé</Label>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            Comme sur Alibaba : plus l'acheteur prend de pièces, moins l'unité lui coûte. Exemple : de 10 à 99 pièces à
            1 000 F, puis de 100 à 499 à 800 F, et 650 F au-delà de 500. Les acheteurs en gros cherchent exactement ça —
            les fiches avec paliers reçoivent nettement plus de commandes.
          </p>
        </div>

        {tiers.map((t, i) => (
          <div key={i} className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-muted/30 p-2.5">
            <div className="space-y-1">
              <Label className="text-[11px]">De (pièces)</Label>
              <Input
                type="number"
                min={1}
                value={t.from}
                onChange={(e) =>
                  setTiers((prev) =>
                    prev.map((row, j) => (j === i ? { ...row, from: e.target.value === "" ? "" : Number(e.target.value) } : row)),
                  )
                }
                className="h-9 w-24"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">À (vide = et plus)</Label>
              <Input
                type="number"
                min={1}
                placeholder="et plus"
                value={t.to}
                onChange={(e) =>
                  setTiers((prev) =>
                    prev.map((row, j) => (j === i ? { ...row, to: e.target.value === "" ? "" : Number(e.target.value) } : row)),
                  )
                }
                className="h-9 w-24"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Prix unitaire (FCFA)</Label>
              <Input
                type="number"
                min={1}
                value={t.price}
                onChange={(e) =>
                  setTiers((prev) =>
                    prev.map((row, j) => (j === i ? { ...row, price: e.target.value === "" ? "" : Number(e.target.value) } : row)),
                  )
                }
                className="h-9 w-28"
              />
            </div>
            <button
              type="button"
              onClick={() => setTiers((prev) => prev.filter((_, j) => j !== i))}
              className="mb-0.5 grid h-9 w-9 place-items-center rounded-lg border border-border text-muted-foreground hover:border-destructive/50 hover:text-destructive"
              aria-label="Retirer ce palier"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={() =>
            setTiers((prev) => {
              // Pré-remplissage intelligent : on enchaîne après le dernier palier.
              const last = prev[prev.length - 1];
              const from = prev.length === 0 ? (moq === "" ? 10 : Number(moq)) : Number(last.to || 0) + 1 || 0;
              return [...prev, { from, to: "", price: "" }];
            })
          }
          disabled={tiers.length >= 4}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-volt/50 bg-volt/10 px-3 text-xs font-semibold disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> Ajouter un palier
        </button>
        {tiers.length > 0 && (
          <p className="text-[11px] text-muted-foreground">
            Le premier palier doit commencer à votre commande minimum ({moq === "" ? "MOQ" : moq} pièces) ou après, et
            les prix doivent baisser quand la quantité augmente.
          </p>
        )}
      </div>

      {/* ===== Tailles & couleurs : deux blocs séparés, chacun avec son compteur ===== */}
      <div className="space-y-4">
        {/* ---- Tailles ---- */}
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label>Tailles disponibles</Label>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
              {sizes.length === 0 ? "facultatif" : `${sizes.length} taille${sizes.length > 1 ? "s" : ""}`}
            </span>
          </div>

          {sizeGroups.length > 0 ? (
            <>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Touchez les tailles que vous avez en stock. Vous pouvez aussi en ajouter une à la main.
              </p>
              {sizeGroups.map((group) => (
                <div key={group.label} className="mt-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {group.label}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {group.values.map((s) => {
                      const active = sizes.includes(s);
                      return (
                        <button
                          key={s}
                          type="button"
                          onClick={() => toggleSize(s)}
                          className={`h-9 min-w-11 rounded-lg border px-3 text-xs font-semibold transition ${
                            active
                              ? "border-volt bg-volt text-volt-foreground"
                              : "border-input bg-background text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {s}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </>
          ) : (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Pas de taille pour cette catégorie ? Laissez vide. Sinon ajoutez-les ci-dessous (ex. « 1 L », « 5 kg »,
              « 42 »).
            </p>
          )}

          {/* Tailles ajoutées à la main : toujours visibles, en évidence. */}
          {sizes.filter((s) => !presetValues.includes(s)).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {sizes
                .filter((s) => !presetValues.includes(s))
                .map((s) => (
                  <span
                    key={s}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-volt bg-volt/15 px-3 text-xs font-semibold text-volt"
                  >
                    {s}
                    <button type="button" onClick={() => toggleSize(s)} aria-label={`Retirer ${s}`}>
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
            </div>
          )}

          <div className="mt-2 flex gap-2">
            <Input
              value={sizeInput}
              onChange={(e) => setSizeInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addSize();
                }
              }}
              placeholder="Autre taille…"
              className="h-10"
            />
            <Button type="button" variant="outline" className="h-10" onClick={addSize}>
              Ajouter
            </Button>
          </div>
        </div>

        {/* ---- Couleurs (avec pastille de couleur) ---- */}
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label>Couleurs disponibles</Label>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
              {colors.length === 0 ? "facultatif" : `${colors.length} couleur${colors.length > 1 ? "s" : ""}`}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Touchez une couleur pour l'ajouter. La pastille montre la couleur réelle.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {COLOR_OPTIONS.map((c) => {
              const active = colors.includes(c);
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggleColor(c)}
                  className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-medium transition ${
                    active ? "border-volt bg-volt/15 text-foreground" : "border-input bg-background text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span
                    className="h-3.5 w-3.5 shrink-0 rounded-full border border-black/20"
                    style={{ background: COLOR_HEX[c] ?? "#e5e7eb" }}
                  />
                  {c}
                </button>
              );
            })}
          </div>
          {colors.filter((c) => !COLOR_OPTIONS.includes(c)).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {colors.filter((c) => !COLOR_OPTIONS.includes(c)).map((c) => (
                <span key={c} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-volt bg-volt/15 px-3 text-xs font-medium text-volt">
                  {c}
                  <button type="button" onClick={() => toggleColor(c)} aria-label={`Retirer ${c}`}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="mt-2 flex gap-2">
            <Input
              value={colorInput}
              onChange={(e) => setColorInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addColor(); } }}
              placeholder="Autre couleur…"
              className="h-10"
            />
            <Button type="button" variant="outline" className="h-10" onClick={addColor}>Ajouter</Button>
          </div>
        </div>

        {/* ---- Poids, avec choix de l'unité (g ou kg) ---- */}
        <div className="space-y-1.5 rounded-2xl border border-border bg-card p-4">
          <Label htmlFor="weight">Poids d'une pièce</Label>
          <div className="flex gap-2">
            <Input
              id="weight"
              type="number"
              min={0}
              step={weightUnit === "kg" ? "0.1" : "1"}
              value={weightValue}
              onChange={(e) => setWeightValue(e.target.value === "" ? "" : Number(e.target.value))}
              placeholder={weightUnit === "kg" ? "Ex : 0.5" : "Ex : 500"}
              className="flex-1"
            />
            {/* Choix de l'unité : grammes ou kilos, comme on parle au marché. */}
            <div className="flex shrink-0 overflow-hidden rounded-xl border border-input">
              {(["g", "kg"] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setWeightUnit(u)}
                  className={`h-10 w-12 text-sm font-semibold transition ${
                    weightUnit === u ? "bg-volt text-volt-foreground" : "bg-background text-muted-foreground"
                  }`}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Optionnel — utile pour calculer la livraison.
            {weightValue !== "" && weightUnit === "kg" && (
              <>
                {" "}
                Soit <strong className="text-foreground">{Math.round(Number(weightValue) * 1000)} g</strong>.
              </>
            )}
            {weightValue !== "" && weightUnit === "g" && Number(weightValue) >= 1000 && (
              <>
                {" "}
                Soit <strong className="text-foreground">{(Number(weightValue) / 1000).toFixed(2)} kg</strong>.
              </>
            )}
          </p>
        </div>
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
          Pré-rempli avec le numéro de votre compte. Si vous le changez ici, il sera aussi mis à jour sur votre compte.
          Visible uniquement par les acheteurs connectés.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={dropshipping}
            onChange={(e) => setDropshipping(e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 rounded-md border-input accent-volt"
          />
          <span className="text-sm">
            <span className="font-semibold">Produit en dropshipping</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
              Cochez si vous avez du stock et acceptez de <strong className="text-foreground">livrer sur commande</strong> :
              un e-commerçant vous apporte la commande, vous livrez le client et vous lui versez son bénéfice.
              Décoché = <strong className="text-foreground">vente en gros</strong> (lots, affiché sur l'accueil).
            </span>
          </span>
        </label>
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
