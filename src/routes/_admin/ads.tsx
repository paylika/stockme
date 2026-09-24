import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/stockme-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { uploadImage } from "@/lib/image-upload";
import { formatFCFA } from "@/lib/format";
import { toast } from "sonner";
import {
  CalendarClock,
  Eye,
  EyeOff,
  ImagePlus,
  Megaphone,
  Package,
  Plus,
  Store,
  Trash2,
} from "lucide-react";

type Ad = {
  id: string;
  kind: string;
  product_id: string | null;
  title: string | null;
  description: string | null;
  image_url: string | null;
  cta_label: string | null;
  href: string | null;
  starts_at: string;
  ends_at: string | null;
  active: boolean;
  weight: number;
  created_at: string;
};

type Vendor = { id: string; full_name: string | null };
type VendorProduct = { id: string; name: string; images: string[]; city: string; price_fcfa: number };

export const Route = createFileRoute("/_admin/ads")({
  component: AdminAdsPage,
});

const pad = (n: number) => String(n).padStart(2, "0");
const toLocalInput = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

const normalizeHref = (v: string) => {
  const s = v.trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  if (/^\+?[\d\s]+$/.test(s)) return `https://wa.me/${s.replace(/\D/g, "")}`;
  return `https://${s}`;
};

function adStatus(a: Ad) {
  const now = Date.now();
  const start = new Date(a.starts_at).getTime();
  const end = a.ends_at ? new Date(a.ends_at).getTime() : Infinity;
  if (!a.active) return { label: "Désactivée", cls: "bg-secondary text-muted-foreground" };
  if (now < start) return { label: "Programmée", cls: "bg-primary/10 text-primary" };
  if (now > end) return { label: "Expirée", cls: "bg-secondary text-muted-foreground" };
  return { label: "En diffusion", cls: "bg-volt/15 text-volt" };
}

function AdminAdsPage() {
  const [ads, setAds] = useState<Ad[] | null>(null);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [vendorProducts, setVendorProducts] = useState<VendorProduct[]>([]);
  const [saving, setSaving] = useState(false);

  // Formulaire
  const [kind, setKind] = useState<"product" | "custom">("product");
  const [vendorId, setVendorId] = useState("");
  const [productId, setProductId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [ctaLabel, setCtaLabel] = useState("En savoir plus");
  const [contact, setContact] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [startsAt, setStartsAt] = useState(() => toLocalInput(new Date()));
  const [endsAt, setEndsAt] = useState(() => toLocalInput(new Date(Date.now() + 7 * 864e5)));
  const [weight, setWeight] = useState(0);

  const load = async () => {
    const { data } = await supabase.from("ads").select("*").order("created_at", { ascending: false });
    setAds((data as Ad[] | null) ?? []);
  };

  useEffect(() => {
    load();
    supabase
      .from("profiles")
      .select("id,full_name")
      .order("full_name", { ascending: true })
      .then(({ data }) => setVendors((data as Vendor[] | null) ?? []));
  }, []);

  useEffect(() => {
    if (!vendorId) {
      setVendorProducts([]);
      setProductId("");
      return;
    }
    supabase
      .from("products")
      .select("id,name,images,city,price_fcfa")
      .eq("owner_id", vendorId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setVendorProducts((data as VendorProduct[] | null) ?? []);
        setProductId("");
      });
  }, [vendorId]);

  const onImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    const r = new FileReader();
    r.onload = () => setPreview(r.result as string);
    r.readAsDataURL(file);
  };

  const reset = () => {
    setVendorId("");
    setProductId("");
    setTitle("");
    setDescription("");
    setCtaLabel("En savoir plus");
    setContact("");
    setImageUrl("");
    setImageFile(null);
    setPreview("");
    setWeight(0);
    setStartsAt(toLocalInput(new Date()));
    setEndsAt(toLocalInput(new Date(Date.now() + 7 * 864e5)));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (kind === "product" && !productId) return toast.error("Choisissez un vendeur puis un produit.");
    if (kind === "custom" && !title.trim()) return toast.error("Le titre de l'annonce est requis.");
    if (kind === "custom" && !contact.trim()) return toast.error("Indiquez un contact (lien ou numéro WhatsApp).");

    const start = new Date(startsAt);
    const end = new Date(endsAt);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return toast.error("Dates invalides.");
    if (end <= start) return toast.error("La fin doit être après le début.");

    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Session expirée.");

      let finalImage = imageUrl;
      if (kind === "custom" && imageFile) {
        finalImage = await uploadImage(imageFile, u.user.id, "ad");
      }

      const { error } = await supabase.from("ads").insert({
        kind,
        product_id: kind === "product" ? productId : null,
        title: kind === "custom" ? title.trim() : null,
        description: kind === "custom" ? description.trim() || null : null,
        image_url: finalImage || null,
        cta_label: kind === "custom" ? ctaLabel.trim() || "En savoir plus" : null,
        href: kind === "custom" ? normalizeHref(contact) : null,
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        active: true,
        weight: Number(weight) || 0,
      });
      if (error) throw new Error(error.message);

      toast.success("Annonce enregistrée !");
      reset();
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (a: Ad) => {
    const { error } = await supabase.from("ads").update({ active: !a.active }).eq("id", a.id);
    if (error) return toast.error(error.message);
    toast.success(!a.active ? "Annonce activée" : "Annonce désactivée");
    load();
  };

  const remove = async (a: Ad) => {
    if (!confirm("Supprimer cette annonce ?")) return;
    const { error } = await supabase.from("ads").delete().eq("id", a.id);
    if (error) return toast.error(error.message);
    toast.success("Annonce supprimée");
    load();
  };

  const selectedProduct = vendorProducts.find((p) => p.id === productId);

  return (
    <div>
      <div className="flex items-center gap-2">
        <Megaphone className="h-5 w-5 text-volt" />
        <p className="text-[11px] font-semibold tracking-[0.2em] uppercase text-muted-foreground">Annonces</p>
      </div>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-2xl sm:text-4xl font-bold tracking-tight">Mise en avant</h1>
        <span className="text-xs text-muted-foreground">
          {ads === null ? "…" : `${ads.length} annonce(s)`}
        </span>
      </div>

      {/* ===== Nouvelle annonce ===== */}
      <form onSubmit={submit} className="mt-6 rounded-2xl border border-border bg-card p-5">
        <h2 className="inline-flex items-center gap-2 text-sm font-semibold">
          <Plus className="h-4 w-4" /> Nouvelle annonce
        </h2>

        {/* Type */}
        <div className="mt-4 inline-flex rounded-xl border border-border bg-background p-1">
          <button
            type="button"
            onClick={() => setKind("product")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              kind === "product" ? "bg-volt text-volt-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Package className="h-3.5 w-3.5" /> Produit d'un vendeur
          </button>
          <button
            type="button"
            onClick={() => setKind("custom")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              kind === "custom" ? "bg-volt text-volt-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Megaphone className="h-3.5 w-3.5" /> Annonce libre (image + texte)
          </button>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {/* Colonne gauche : contenu */}
          <div className="space-y-4">
            {kind === "product" ? (
              <>
                <div className="space-y-1.5">
                  <Label>Vendeur</Label>
                  <select value={vendorId} onChange={(e) => setVendorId(e.target.value)} className="form-select">
                    <option value="">Choisir un vendeur…</option>
                    {vendors.map((v) => (
                      <option key={v.id} value={v.id}>{v.full_name || "Vendeur"}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Produit à mettre en avant</Label>
                  <select
                    value={productId}
                    onChange={(e) => setProductId(e.target.value)}
                    disabled={!vendorId || vendorProducts.length === 0}
                    className="form-select disabled:opacity-60"
                  >
                    <option value="">
                      {!vendorId ? "Choisir un vendeur d'abord" : vendorProducts.length === 0 ? "Aucun produit" : "Choisir un produit…"}
                    </option>
                    {vendorProducts.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}{p.city ? ` — ${p.city}` : ""}</option>
                    ))}
                  </select>
                </div>
                {selectedProduct && (
                  <div className="flex items-center gap-3 rounded-xl border border-border bg-background/50 p-3">
                    {selectedProduct.images?.[0] ? (
                      <img src={selectedProduct.images[0]} alt="" className="h-12 w-12 rounded-lg object-cover" />
                    ) : (
                      <span className="grid h-12 w-12 place-items-center rounded-lg bg-muted"><Package className="h-4 w-4" /></span>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{selectedProduct.name}</p>
                      <p className="text-xs text-muted-foreground">{formatFCFA(selectedProduct.price_fcfa)} · {selectedProduct.city}</p>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label>Titre de l'annonce *</Label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Promo spéciale rentrée" />
                </div>
                <div className="space-y-1.5">
                  <Label>Texte / description</Label>
                  <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Décrivez votre offre…" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Bouton (libellé)</Label>
                    <Input value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} placeholder="En savoir plus" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Contact * (lien ou numéro WhatsApp)</Label>
                    <Input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="+22178… ou https://…" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Image</Label>
                  <div className="flex items-center gap-3">
                    <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-xl border border-border bg-muted">
                      {preview || imageUrl ? (
                        <img src={preview || imageUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <ImagePlus className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <label className="cursor-pointer">
                      <span className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-sm font-medium hover:bg-accent">
                        <ImagePlus className="h-4 w-4" /> Choisir une image
                      </span>
                      <input type="file" accept="image/*" className="hidden" onChange={onImage} />
                    </label>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Colonne droite : programmation */}
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-background/50 p-4">
              <p className="inline-flex items-center gap-2 text-sm font-semibold">
                <CalendarClock className="h-4 w-4" /> Programmation (respectée à la minute)
              </p>
              <div className="mt-3 space-y-3">
                <div className="space-y-1.5">
                  <Label>Début de diffusion *</Label>
                  <input
                    type="datetime-local"
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                    className="form-select"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Fin de diffusion *</Label>
                  <input
                    type="datetime-local"
                    value={endsAt}
                    onChange={(e) => setEndsAt(e.target.value)}
                    className="form-select"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Priorité (plus haut = affiché en premier)</Label>
                  <Input type="number" value={weight} onChange={(e) => setWeight(Number(e.target.value) || 0)} />
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                L'annonce n'apparaîtra <strong>qu'entre ces deux dates</strong>, puis disparaîtra automatiquement.
              </p>
            </div>

            <Button type="submit" variant="volt" className="h-11 w-full" disabled={saving}>
              {saving ? "Enregistrement…" : "Publier l'annonce"}
            </Button>
          </div>
        </div>
      </form>

      {/* ===== Liste des annonces ===== */}
      <h2 className="mt-10 text-lg sm:text-xl font-semibold tracking-tight">Annonces ({ads?.length ?? 0})</h2>
      {ads === null ? (
        <p className="mt-4 text-sm text-muted-foreground">Chargement…</p>
      ) : ads.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Aucune annonce pour le moment.</p>
      ) : (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {ads.map((a) => {
            const st = adStatus(a);
            const img = a.kind === "product" ? null : a.image_url;
            return (
              <div key={a.id} className="flex gap-3 rounded-2xl border border-border bg-card p-4">
                <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-muted">
                  {img ? (
                    <img src={img} alt="" className="h-full w-full object-cover" />
                  ) : a.kind === "product" ? (
                    <Store className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <Megaphone className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.cls}`}>{st.label}</span>
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px]">
                      {a.kind === "product" ? "Produit" : "Annonce libre"}
                    </span>
                    {a.weight !== 0 && <span className="text-[11px] text-muted-foreground">priorité {a.weight}</span>}
                  </div>
                  <p className="mt-1 truncate text-sm font-semibold">
                    {a.kind === "product" ? (
                      <Link to="/product/$id" params={{ id: a.product_id ?? "" }} className="hover:text-primary">
                        Produit mis en avant
                      </Link>
                    ) : (
                      a.title || "Annonce"
                    )}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Du {new Date(a.starts_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                    {" → "}
                    {a.ends_at ? new Date(a.ends_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "sans fin"}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      onClick={() => toggleActive(a)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium transition hover:bg-accent"
                    >
                      {a.active ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      {a.active ? "Désactiver" : "Activer"}
                    </button>
                    <button
                      onClick={() => remove(a)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-destructive/50 hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Supprimer
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
