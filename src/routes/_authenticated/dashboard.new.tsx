import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/stockme-client";
import { Header } from "@/components/Header";
import { MobileNav } from "@/components/MobileNav";
import { MobileFooter } from "@/components/MobileFooter";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { CATEGORIES, WEST_AFRICA_LOCATIONS, CITY_ZONES } from "@/lib/constants";
import { ArrowLeft, ImagePlus, X } from "lucide-react";
import { toast } from "sonner";
import { MAX_PHOTOS, MAX_PHOTO_SIZE, uploadProductImage } from "@/lib/image-upload";

const cleanPhone = (value: string) => value.replace(/[^+\d]/g, "").trim();


export const Route = createFileRoute("/_authenticated/dashboard/new")({
  component: NewProduct,
});

function NewProduct() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [city, setCity] = useState("");
  const [zone, setZone] = useState("");
  const [price, setPrice] = useState<number | "">("");
  const [promoPrice, setPromoPrice] = useState<number | "">("");
  const [revenue, setRevenue] = useState<number | "">("");
  const [quantity, setQuantity] = useState<number | "">("");
  const [moq, setMoq] = useState<number | "">(1);
  const [whatsapp, setWhatsapp] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");

  const [formError, setFormError] = useState("");

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data } = await supabase
        .from("profiles")
        .select("whatsapp, city")
        .eq("id", u.user.id)
        .maybeSingle();
      if (data?.whatsapp) setWhatsapp(data.whatsapp);
      if (data?.city) setCity(data.city);
    })();
  }, []);

  // Reset zone when city changes
  useEffect(() => {
    setZone("");
  }, [city]);

  const zones = city ? (CITY_ZONES[city] ?? []) : [];

  const onFiles = (list: FileList | null) => {
    if (!list) return;
    const incoming = Array.from(list);
    if (files.length + incoming.length > MAX_PHOTOS) {
      toast.error(`Ajoutez entre 1 et ${MAX_PHOTOS} photos maximum.`);
    }
    const arr = incoming.slice(0, MAX_PHOTOS - files.length).filter((file) => {
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
    setFiles((p) => [...p, ...arr]);
    arr.forEach((f) => {
      const r = new FileReader();
      r.onload = () => setPreviews((p) => [...p, r.result as string]);
      r.readAsDataURL(f);
    });
  };

  const removeImg = (i: number) => {
    setFiles((p) => p.filter((_, j) => j !== i));
    setPreviews((p) => p.filter((_, j) => j !== i));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const stop = (message: string) => {
      setFormError(message);
      toast.error(message);
    };
    setFormError("");
    const trimmedName = name.trim();
    const trimmedDescription = description.trim();
    const normalizedWhatsapp = cleanPhone(whatsapp);
    if (trimmedName.length < 2) return stop("Nom du produit requis");
    if (!category || !city) return stop("Catégorie et localité requises");
    if (files.length < 1 || files.length > MAX_PHOTOS)
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
      const { data: u, error: userError } = await supabase.auth.getUser();
      if (userError || !u.user) throw new Error("Reconnectez-vous pour publier le produit.");

      const urls: string[] = [];
      let index = 0;
      for (const f of files) {
        index += 1;
        setUploadStatus(`Envoi de la photo ${index}/${files.length}...`);
        urls.push(await uploadProductImage(f, u.user.id));
      }
      setUploadStatus("Publication du produit...");


      const payload = {
        owner_id: u.user.id,
        name: trimmedName,
        description: trimmedDescription || null,
        category,
        city,
        zone: zone || null,
        price_fcfa: Number(price),
        promo_price_fcfa: Number(promoPrice),
        revenue_fcfa: revenue === "" ? null : Number(revenue),
        quantity: Number(quantity),
        moq: Number(moq),
        whatsapp: normalizedWhatsapp,
        images: urls,
      };

      let insertError: string | null = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const { error } = await supabase.from("products").insert(payload);
          if (error) throw new Error(error.message);
          insertError = null;
          break;
        } catch (err) {
          insertError = err instanceof Error ? err.message : "erreur réseau";
          if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 1000));
        }
      }
      if (insertError) throw new Error(`Produit non publié : ${insertError}`);

      // Update profile whatsapp if changed
      if (normalizedWhatsapp) {
        await supabase
          .from("profiles")
          .update({ whatsapp: normalizedWhatsapp })
          .eq("id", u.user.id);
      }

      toast.success("Produit publié !");
      navigate({ to: "/dashboard" });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Erreur pendant la publication";
      setFormError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
      setUploadStatus("");
    }

  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-6 sm:py-10">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 sm:mb-6"
        >
          <ArrowLeft className="h-4 w-4" /> Retour au stock
        </Link>

        <h1 className="text-2xl sm:text-4xl font-bold tracking-tight">Ajouter un produit</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Photos, prix, localité et WhatsApp sont obligatoires.
        </p>

        <form onSubmit={submit} className="mt-6 sm:mt-8 space-y-5">
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
                {files.length}/{MAX_PHOTOS}
              </span>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
              {previews.map((src, i) => (
                <div
                  key={i}
                  className="relative aspect-square rounded-lg overflow-hidden border border-border"
                >
                  <img src={src} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removeImg(i)}
                    className="absolute top-1 right-1 grid h-6 w-6 place-items-center rounded-full bg-background/90 text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {files.length < MAX_PHOTOS && (
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
              <select id="category" required value={category} onChange={(e) => setCategory(e.target.value)} className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                <option value="">Choisir...</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="city">Pays / Ville *</Label>
              <select id="city" required value={city} onChange={(e) => setCity(e.target.value)} className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
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
              <select id="zone" value={zone} onChange={(e) => setZone(e.target.value)} className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                <option value="">Préciser dans {city}...</option>
                {zones.map((z) => <option key={z} value={z}>{z}</option>)}
              </select>
            </div>
          )}

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
            <Link to="/dashboard">
              <Button type="button" variant="outline">
                Annuler
              </Button>
            </Link>
            <Button type="submit" variant="volt" disabled={submitting} className="h-11 px-6">
              {submitting ? (uploadStatus || "Publication...") : "Publier"}
            </Button>
          </div>
        </form>
      </div>
      <MobileFooter />
      <MobileNav />
    </div>
  );
}
