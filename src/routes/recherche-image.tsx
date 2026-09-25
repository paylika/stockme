import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Camera, Loader2, RefreshCw, Search, Sparkles, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/stockme-client";
import { SiteHeader } from "@/components/SiteHeader";
import { MobileNav } from "@/components/MobileNav";
import { MobileFooter } from "@/components/MobileFooter";
import { Button } from "@/components/ui/button";
import { ProductCard, type ListingProduct } from "@/components/ProductCard";
import { takePendingImage, prepareImageForSearch, type PendingImage } from "@/lib/image-search";
import { buildSeoHead } from "@/lib/seo";
import { useVisitorCountry } from "@/lib/geo";
import { WEST_AFRICA_LOCATIONS } from "@/lib/constants";

export const Route = createFileRoute("/recherche-image")({
  head: () =>
    buildSeoHead({
      title: "Recherche par image — StockMe",
      description:
        "Envoyez la photo d'un produit : StockMe reconnaît l'article et vous montre les fournisseurs qui le proposent en gros, en mettant en avant les boutiques vérifiées.",
      path: "/recherche-image",
      keywords: "recherche par image, reconnaissance produit, gros Afrique de l'Ouest, StockMe",
    }),
  component: ImageSearchPage,
});

type Result = {
  ok: boolean;
  reason?: string;
  recognized?: boolean;
  produit?: string;
  categorie?: string | null;
  couleurs?: string[];
  matieres?: string[];
  genre?: string;
  marque?: string;
  keywords?: string[];
  products?: ListingProduct[];
  fallback?: boolean;
  remaining?: number;
};

function ImageSearchPage() {
  const navigate = useNavigate();
  const visitor = useVisitorCountry();
  const [pending, setPending] = useState<PendingImage | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const startedRef = useRef(false);

  // Le pays détecté sert à proposer la bonne zone dans les filtres du haut.
  const [country, setCountry] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (visitor.country) setCountry(visitor.country);
  }, [visitor.country]);

  const analyse = async (p: PendingImage) => {
    setLoading(true);
    setResult(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("lecture impossible"));
        reader.readAsDataURL(p.file);
      });

      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;

      const res = await fetch("/api/ai/image-search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ image: dataUrl }),
      });
      const json = (await res.json()) as Result;
      setResult(json);
      if (!json.ok && json.reason === "quota") {
        toast.error("Vous avez atteint la limite de 30 recherches par image aujourd'hui.");
      }
    } catch {
      setResult({ ok: false, reason: "network" });
      toast.error("L'analyse a échoué. Vérifiez votre connexion et réessayez.");
    } finally {
      setLoading(false);
    }
  };

  // Photo choisie depuis la barre de recherche : on l'analyse dès l'arrivée.
  useEffect(() => {
    if (startedRef.current) return;
    const p = takePendingImage();
    if (!p) return;
    startedRef.current = true;
    setPending(p);
    void analyse(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chooseFile = async (file: File | undefined | null) => {
    if (!file) return;
    const res = await prepareImageForSearch(file);
    if (!res.ok) {
      toast.error(res.reason);
      return;
    }
    const p = takePendingImage();
    if (!p) return;
    setPending(p);
    void analyse(p);
  };

  const keywords = result?.keywords ?? [];
  const products = result?.products ?? [];

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader
        q=""
        onQChange={() => {}}
        country={country}
        city={undefined}
        countries={[]}
        cities={country ? WEST_AFRICA_LOCATIONS[country] ?? [] : []}
        onUpdate={() => {}}
        onSubmit={() => {}}
      />

      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="inline-flex items-center gap-2 text-xl font-bold tracking-tight sm:text-2xl">
              <Camera className="h-5 w-5 text-volt" /> Recherche par image
            </h1>
            <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
              Montrez-nous le produit, on retrouve le fournisseur.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="h-10" onClick={() => inputRef.current?.click()}>
              <RefreshCw className="mr-1.5 h-4 w-4" /> Une autre photo
            </Button>
            <Link to="/browse">
              <Button variant="ghost" className="h-10">
                <Search className="mr-1.5 h-4 w-4" /> Recherche par texte
              </Button>
            </Link>
          </div>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            void chooseFile(f);
          }}
        />

        {/* Bandeau : la photo analysée + ce que l'IA a reconnu */}
        <div className="mt-5 rounded-3xl border border-border bg-card p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-4">
            <div className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-2xl border border-border bg-muted">
              {pending ? (
                <img src={pending.preview} alt="Photo analysée" className="h-full w-full object-cover" />
              ) : (
                <Camera className="h-7 w-7 text-muted-foreground" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              {loading ? (
                <>
                  <p className="inline-flex items-center gap-2 text-sm font-semibold">
                    <Loader2 className="h-4 w-4 animate-spin text-volt" /> Analyse de votre photo…
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    La reconnaissance prend quelques secondes. Ne fermez pas la page.
                  </p>
                </>
              ) : !pending ? (
                <>
                  <p className="text-sm font-semibold">Aucune photo pour l'instant</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Choisissez une photo de produit (depuis votre téléphone ou vos fichiers).
                  </p>
                  <Button variant="volt" className="mt-2 h-10" onClick={() => inputRef.current?.click()}>
                    <Camera className="mr-1.5 h-4 w-4" /> Choisir une photo
                  </Button>
                </>
              ) : result?.ok && result.recognized ? (
                <>
                  <p className="inline-flex items-center gap-1.5 text-sm font-bold">
                    <Sparkles className="h-4 w-4 text-volt" /> Reconnu : {result.produit || "produit"}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {result.categorie && (
                      <span className="rounded-full bg-volt/15 px-2 py-0.5 text-[11px] font-semibold text-foreground">
                        {result.categorie}
                      </span>
                    )}
                    {result.genre && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                        {result.genre}
                      </span>
                    )}
                    {result.marque && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                        {result.marque}
                      </span>
                    )}
                    {(result.couleurs ?? []).concat(result.matieres ?? []).map((k) => (
                      <span key={k} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                        {k}
                      </span>
                    ))}
                  </div>
                  {keywords.length > 0 && (
                    <p className="mt-2 truncate text-[11px] text-muted-foreground">
                      Recherché : {keywords.slice(0, 6).join(" · ")}
                    </p>
                  )}
                </>
              ) : result && !result.ok ? (
                <>
                  <p className="inline-flex items-center gap-1.5 text-sm font-bold">
                    <TriangleAlert className="h-4 w-4 text-destructive" /> Analyse impossible
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {result.reason === "quota"
                      ? "Limite de 30 recherches par image atteinte aujourd'hui. Revenez demain, ou cherchez par texte."
                      : result.reason === "ai_not_configured"
                      ? "La reconnaissance d'image n'est pas encore activée."
                      : "Réessayez avec une autre photo (produit bien visible, fond simple)."}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold">Aucun produit reconnu sur cette photo</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Essayez une photo du produit seul, bien éclairée, sur un fond neutre.
                  </p>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Résultats */}
        {!loading && pending && result?.ok && result.recognized && (
          <>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-muted-foreground">
                {products.length} produit{products.length > 1 ? "s" : ""} correspondant
                {products.length > 1 ? "s" : ""}
              </h2>
              <p className="text-[11px] text-muted-foreground">
                Mises en avant puis fournisseurs vérifiés en premier.
              </p>
            </div>

            {products.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-dashed border-border p-8 text-center">
                <p className="text-sm font-semibold">Rien de correspondant dans le catalogue</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Ce produit n'est peut-être pas encore disponible. Essayez un mot-clé dans la recherche par texte.
                </p>
                {keywords[0] && (
                  <Link to="/browse" search={{ q: keywords[0] } as never} className="mt-3 inline-block">
                    <Button variant="volt" className="h-10">
                      Chercher « {keywords[0]} »
                    </Button>
                  </Link>
                )}
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4">
                {products.map((p, i) => (
                  <ProductCard key={p.id} product={p} sellerVerified={!!p.seller_verified} delayMs={i * 40} />
                ))}
              </div>
            )}

            <p className="mt-6 text-center text-[11px] text-muted-foreground">
              Votre photo est analysée pour retrouver le produit, elle n'est pas publiée sur StockMe.{" "}
              <Link to="/legal/confidentialite" className="underline underline-offset-2">
                En savoir plus
              </Link>
            </p>
          </>
        )}
      </div>

      <MobileFooter />
      <MobileNav />
    </div>
  );
}
