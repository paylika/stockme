import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Header } from "@/components/Header";
import { MobileNav } from "@/components/MobileNav";
import { MobileFooter } from "@/components/MobileFooter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CATEGORIES, WEST_AFRICA_COUNTRIES, WEST_AFRICA_LOCATIONS } from "@/lib/constants";
import { formatFCFA } from "@/lib/format";
import { createBuyingRequest } from "@/lib/buying-requests";
import { useAuth } from "@/hooks/useAuth";
import { useVisitorCountry } from "@/lib/geo";
import { compressImage, uploadImage, MAX_PHOTO_SIZE } from "@/lib/image-upload";
import { requireUserId } from "@/lib/current-user";
import { toast } from "sonner";
import { Camera, Loader2, Lock, Package, Send, Sparkles, X } from "lucide-react";

export const Route = createFileRoute("/demandes/nouvelle")({
  head: () => ({
    meta: [
      { title: "Publier ma demande d'achat — trouvez le produit introuvable | StockMe" },
      {
        name: "description",
        content:
          "Décrivez le produit que vous cherchez, la quantité et votre budget : les fournisseurs d'Afrique de l'Ouest vous répondent. Gratuit, sans intermédiaire.",
      },
    ],
  }),
  component: NewRequestPage,
});

const UNITS = ["pièces", "cartons", "lots", "sacs", "kg", "paires", "palettes"];

type AiResult = {
  ok: boolean;
  recognized?: boolean;
  produit?: string;
  categorie?: string | null;
  keywords?: string[];
  products?: { id: string; name: string; images: string[] | null; price_fcfa: number; city: string }[];
};

function NewRequestPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const visitor = useVisitorCountry();
  const fileRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("pièces");
  const [budget, setBudget] = useState("");
  const [negotiable, setNegotiable] = useState(false);
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [analysing, setAnalysing] = useState(false);
  const [similar, setSimilar] = useState<AiResult["products"]>([]);
  const [busy, setBusy] = useState(false);

  // Le pays détecté pré-remplit le champ (modifiable).
  const effectiveCountry = country || visitor.country || "";
  const cityOptions = WEST_AFRICA_LOCATIONS[effectiveCountry] ?? [];

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="mx-auto max-w-2xl px-4 py-16">
          <div className="h-40 rounded-2xl shimmer bg-muted" />
        </div>
        <MobileFooter />
        <MobileNav />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
          <div className="rounded-2xl border border-dashed border-border p-6 text-center">
            <Lock className="mx-auto h-7 w-7 text-muted-foreground" />
            <h1 className="mt-3 text-xl font-bold tracking-tight">Connectez-vous pour publier une demande</h1>
            <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
              La publication est réservée aux comptes StockMe : c'est ce qui garantit aux fournisseurs qu'il y a un
              vrai acheteur derrière chaque demande.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Link to="/auth" search={{ redirect: "/demandes/nouvelle", mode: "signup" } as never}>
                <Button variant="volt" className="h-11">
                  Créer mon compte gratuit
                </Button>
              </Link>
              <Link to="/auth" search={{ redirect: "/demandes/nouvelle", mode: "login" } as never}>
                <Button variant="outline" className="h-11">
                  Se connecter
                </Button>
              </Link>
            </div>
            <Link to="/demandes" className="mt-4 inline-block text-xs underline underline-offset-2 text-muted-foreground">
              Voir les demandes des autres acheteurs
            </Link>
          </div>
        </div>
        <MobileFooter />
        <MobileNav />
      </div>
    );
  }

  /** Photo du produit cherché : elle aide les fournisseurs ET remplit le formulaire. */
  const onPhoto = async (file: File | null) => {
    if (!file) return;
    if (file.size > MAX_PHOTO_SIZE) return toast.error("Photo trop lourde (15 Mo maximum).");

    setAnalysing(true);
    try {
      const userId = await requireUserId("Reconnectez-vous pour continuer.");
      const blob = await compressImage(file);
      const ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
      const compressed = new File([blob], `demande.${ext}`, { type: blob.type || "image/jpeg" });
      const url = await uploadImage(compressed, userId, "demandes");
      setImageUrl(url);

      // Analyse IA : elle propose un titre, une catégorie, et cherche si le
      // produit existe DÉJÀ sur StockMe (mieux que d'attendre une réponse).
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("lecture impossible"));
        reader.readAsDataURL(compressed);
      });
      const res = await fetch("/api/ai/image-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl }),
      });
      const json = (await res.json()) as AiResult;
      if (json.ok) {
        if (json.produit && !title) setTitle(json.produit.slice(0, 90));
        if (json.categorie && !category) setCategory(json.categorie);
        setKeywords(json.keywords ?? []);
        setSimilar((json.products ?? []).slice(0, 3));
      }
    } catch {
      toast.error("La photo n'a pas pu être analysée — vous pouvez continuer sans.");
    } finally {
      setAnalysing(false);
    }
  };

  const submit = async () => {
    if (title.trim().length < 8) return toast.error("Décrivez ce que vous cherchez (8 caractères minimum).");
    setBusy(true);
    try {
      const { id, masked } = await createBuyingRequest({
        title: title.trim(),
        description: description.trim() || undefined,
        category: category || undefined,
        quantity: quantity ? Number(quantity) : null,
        unit,
        budget_fcfa: negotiable || !budget ? null : Number(budget),
        city: city || undefined,
        country: effectiveCountry || undefined,
        image_url: imageUrl,
        ai_keywords: keywords,
      });
      if (masked) {
        toast.warning("Votre numéro de téléphone a été masqué : les fournisseurs vous répondent ici, vous choisissez qui contacter.");
      }
      toast.success("Demande publiée ! Les fournisseurs concernés sont prévenus.", { duration: 6000 });
      navigate({ to: "/demandes/$id", params: { id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Publication impossible.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-10">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Publier ma demande</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          Décrivez ce que vous cherchez : les fournisseurs qui l'ont vous envoient leur prix.{" "}
          <strong className="text-foreground">Votre numéro reste privé</strong> — vous choisissez qui contacter.
        </p>

        {/* ---------- La photo (le plus rapide) ---------- */}
        <div className="mt-5 rounded-2xl border border-volt/40 bg-volt/5 p-4">
          <p className="flex items-center gap-2 text-sm font-bold">
            <Sparkles className="h-4 w-4 text-volt" /> Une photo vaut mieux qu'une description
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Prenez en photo le produit que vous cherchez (chez un concurrent, dans un catalogue, sur internet).
            L'IA reconnaît le produit, propose le titre — et vérifie tout de suite s'il existe déjà sur StockMe.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            {imageUrl ? (
              <span className="relative">
                <img src={imageUrl} alt="" className="h-20 w-20 rounded-xl border border-border object-cover" />
                <button
                  type="button"
                  aria-label="Retirer la photo"
                  onClick={() => {
                    setImageUrl(null);
                    setSimilar([]);
                    setKeywords([]);
                  }}
                  className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-destructive text-white"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={analysing}
                className="grid h-20 w-20 place-items-center rounded-xl border-2 border-dashed border-border text-muted-foreground transition hover:border-volt hover:text-volt"
              >
                {analysing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-6 w-6" />}
              </button>
            )}
            <div className="min-w-0 flex-1 text-xs text-muted-foreground">
              {analysing ? (
                "Analyse de la photo…"
              ) : imageUrl ? (
                <>
                  Photo ajoutée.{" "}
                  <button type="button" className="font-semibold underline" onClick={() => fileRef.current?.click()}>
                    Changer
                  </button>
                </>
              ) : (
                "Facultatif — mais les demandes avec photo reçoivent beaucoup plus de réponses."
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                void onPhoto(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
          </div>

          {similar && similar.length > 0 && (
            <div className="mt-3 rounded-xl border border-success/40 bg-success/5 p-3">
              <p className="text-xs font-bold text-success">
                Ce produit existe peut-être déjà sur StockMe — inutile d'attendre :
              </p>
              <ul className="mt-2 flex gap-2 overflow-x-auto no-scrollbar">
                {similar.map((p) => (
                  <li key={p.id} className="w-28 shrink-0">
                    <Link to="/product/$id" params={{ id: p.id }} className="block">
                      {p.images?.[0] ? (
                        <img src={p.images[0]} alt="" className="h-20 w-28 rounded-lg object-cover" />
                      ) : (
                        <span className="grid h-20 w-28 place-items-center rounded-lg bg-muted">
                          <Package className="h-4 w-4 text-muted-foreground" />
                        </span>
                      )}
                      <span className="mt-1 block truncate text-[11px] font-semibold">{p.name}</span>
                      <span className="block text-[10px] text-muted-foreground">{formatFCFA(p.price_fcfa)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* ---------- Le formulaire ---------- */}
        <div className="mt-5 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="t">Ce que je recherche *</Label>
            <Input
              id="t"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex : climatiseur split 1,5 CV marque LG"
              maxLength={120}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="d">Précisions (facultatif)</Label>
            <textarea
              id="d"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={1200}
              placeholder="Couleur, taille, modèle, état (neuf / occasion), conditionnement…"
              className="form-input h-auto py-2.5"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="q">Quantité</Label>
              <Input
                id="q"
                type="number"
                inputMode="numeric"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="Ex : 50"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="u">Unité</Label>
              <select id="u" value={unit} onChange={(e) => setUnit(e.target.value)} className="form-select">
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="b">Budget total (FCFA)</Label>
            <Input
              id="b"
              type="number"
              inputMode="numeric"
              min={0}
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder="Ex : 250000"
              disabled={negotiable}
            />
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={negotiable}
                onChange={(e) => setNegotiable(e.target.checked)}
                className="h-4 w-4 rounded border-input accent-volt"
              />
              Budget à négocier (je ne veux pas afficher de montant)
            </label>
            <p className="text-[11px] text-muted-foreground">
              Les demandes avec un budget réaliste reçoivent beaucoup plus de réponses : les fournisseurs savent tout
              de suite s'ils peuvent vous servir.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="c">Catégorie (facultatif)</Label>
              <select id="c" value={category} onChange={(e) => setCategory(e.target.value)} className="form-select">
                <option value="">Choisir…</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p">Pays</Label>
              <select
                id="p"
                value={effectiveCountry}
                onChange={(e) => setCountry(e.target.value)}
                className="form-select"
              >
                <option value="">Choisir…</option>
                {WEST_AFRICA_COUNTRIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="v">Ville de livraison</Label>
            <Input
              id="v"
              list="demande-villes"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Ex : Dakar"
            />
            <datalist id="demande-villes">
              {cityOptions.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>

          <div className="rounded-xl bg-muted/50 px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
            Votre demande reste en ligne <strong className="text-foreground">30 jours</strong>. Vous pouvez la clôturer
            dès que vous avez trouvé. Les numéros de téléphone écrits dans le texte sont masqués automatiquement :
            <strong className="text-foreground"> les fournisseurs répondent ici, et vous choisissez qui contacter.</strong>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="volt" className="h-12 flex-1 text-sm font-bold" disabled={busy} onClick={submit}>
              {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
              {busy ? "Publication…" : "Publier ma demande"}
            </Button>
            <Button variant="ghost" className="h-12" onClick={() => navigate({ to: "/demandes" })} disabled={busy}>
              Annuler
            </Button>
          </div>
        </div>
      </div>

      <MobileFooter />
      <MobileNav />
    </div>
  );
}
