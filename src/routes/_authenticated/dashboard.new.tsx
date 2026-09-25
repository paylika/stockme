import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/stockme-client";
import { Header } from "@/components/Header";
import { MobileNav } from "@/components/MobileNav";
import { MobileFooter } from "@/components/MobileFooter";
import { ProductForm, ProductFormValues } from "@/components/ProductForm";
import { PhotoFailurePanel } from "@/components/PhotoFailurePanel";
import { Button } from "@/components/ui/button";
import { uploadImagesResilient, MAX_PHOTOS, FREE_MAX_PHOTOS, type UploadFailure } from "@/lib/image-upload";
import { requireUserId } from "@/lib/current-user";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard/new")({
  component: NewProduct,
});

type Pending = {
  productId: string;
  urls: string[];
  files: File[];
  failures: UploadFailure[];
};

function NewProduct() {
  const navigate = useNavigate();
  const [uploadingStatus, setUploadingStatus] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [retrying, setRetrying] = useState(false);
  // Compte gratuit : 2 photos. Fournisseur vérifié : 5.
  const [maxPhotos, setMaxPhotos] = useState(FREE_MAX_PHOTOS);

  useEffect(() => {
    (async () => {
      const { data: s } = await supabase.auth.getSession();
      const uid = s.session?.user?.id;
      if (!uid) return;
      const { data } = await supabase.from("profiles").select("verified,verified_until").eq("id", uid).maybeSingle();
      const p = data as { verified: boolean; verified_until: string | null } | null;
      const ok = !!p?.verified && (!p.verified_until || new Date(p.verified_until) > new Date());
      setMaxPhotos(ok ? MAX_PHOTOS : FREE_MAX_PHOTOS);
    })();
  }, []);

  const submit = async (values: ProductFormValues) => {
    const userId = await requireUserId("Reconnectez-vous pour publier le produit.");

    const { urls, failures } = await uploadImagesResilient(values.newFiles, userId, setUploadingStatus);

    // Une fiche SANS PHOTO ne s'affiche jamais correctement pour l'acheteur
    // (carte vide dans le catalogue). On ne publie donc pas tant qu'au moins
    // une photo n'est pas arrivée : le formulaire reste rempli et le vendeur
    // peut relancer l'envoi d'un seul clic sur « Publier ».
    if (urls.length === 0) {
      setUploadingStatus("");
      const why = failures[0]?.reason ? ` (${failures[0].reason})` : "";
      toast.error(
        `Aucune photo n'a pu être envoyée${why}. Vérifiez votre connexion, puis appuyez de nouveau sur Publier — votre produit n'a pas été publié.`,
        { duration: 10000 },
      );
      return;
    }

    setUploadingStatus("Publication du produit...");

    const payload = {
      owner_id: userId,
      name: values.name,
      description: values.description || null,
      category: values.category,
      city: values.city,
      zone: values.zone || null,
      price_fcfa: values.price_fcfa,
      promo_price_fcfa: values.promo_price_fcfa,
      revenue_fcfa: values.revenue_fcfa,
      quantity: values.quantity,
      moq: values.moq,
      whatsapp: values.whatsapp,
      images: urls,
      published: true,
      sold_out: false,
      dropshipping: values.dropshipping,
      sizes: values.sizes,
      colors: values.colors,
      weight_grams: values.weight_grams,
      price_tiers: values.price_tiers,
    };

    let insertError: string | null = null;
    let productId: string | null = null;
    let priceTiersDropped = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const { data, error } = await supabase.from("products").insert(payload).select("id").single();
        if (error) throw new Error(error.message);
        productId = (data as { id: string } | null)?.id ?? null;
        insertError = null;
        break;
      } catch (err) {
        insertError = err instanceof Error ? err.message : "erreur réseau";
        // La colonne `price_tiers` n'existe pas encore (SQL non collé) : on
        // retire les paliers et on republie immédiatement, sans bloquer le vendeur.
        if (!priceTiersDropped && /price_tiers/i.test(insertError) && "price_tiers" in payload) {
          delete (payload as { price_tiers?: unknown }).price_tiers;
          priceTiersDropped = true;
          attempt = 0;
          continue;
        }
        if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 1000));
      }
    }
    if (insertError) throw new Error(`Produit non publié : ${insertError}`);

    // Protecteur : si la colonne des paliers de prix n'existe pas encore en base
    // (script SQL non collé), on publie quand même le produit sans les paliers.
    if (priceTiersDropped) {
      toast.warning("Produit publié, mais les prix dégressifs n'ont pas pu être enregistrés.");
    }

    // Le numéro WhatsApp du profil suit celui du produit (best effort).
    if (values.whatsapp) {
      await supabase.from("profiles").update({ whatsapp: values.whatsapp }).eq("id", userId);
    }

    setUploadingStatus("");

    if (failures.length > 0 && productId) {
      const failedNames = new Set(failures.map((f) => f.fileName));
      setPending({
        productId,
        urls,
        files: values.newFiles.filter((f) => failedNames.has(f.name)),
        failures,
      });
      toast.warning("Produit publié ! Une photo au moins n'a pas pu être envoyée — renvoyez-la ci-dessous.");
      return;
    }

    if (failures.length > 0) {
      toast.warning("Produit publié, mais des photos n'ont pas pu être envoyées.");
    } else {
      toast.success("Produit publié !");
    }
    navigate({ to: "/dashboard" });
  };

  const retryPhotos = async () => {
    if (!pending) return;
    setRetrying(true);
    try {
      const userId = await requireUserId("Reconnectez-vous pour renvoyer la photo.");

      const { urls, failures } = await uploadImagesResilient(pending.files, userId, setUploadingStatus);
      const allImages = [...pending.urls, ...urls];

      if (urls.length > 0) {
        const { error } = await supabase.from("products").update({ images: allImages }).eq("id", pending.productId);
        if (error) throw new Error(error.message);
      }

      if (failures.length === 0) {
        toast.success("Photo(s) ajoutée(s) au produit !");
        navigate({ to: "/dashboard" });
        return;
      }

      const stillFailed = new Set(failures.map((f) => f.fileName));
      setPending({
        ...pending,
        urls: allImages,
        files: pending.files.filter((f) => stillFailed.has(f.name)),
        failures,
      });
      toast.error("L'envoi a encore échoué. Réessayez dans un instant.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur pendant l'envoi");
    } finally {
      setUploadingStatus("");
      setRetrying(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-6 sm:py-10">
        <h1 className="text-2xl sm:text-4xl font-bold tracking-tight">Ajouter un produit</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Photos, prix, localité et WhatsApp sont obligatoires.
        </p>

        {pending ? (
          // Le produit est déjà publié : on masque le formulaire pour éviter
          // une seconde publication par erreur.
          <div className="mt-6 space-y-4">
            <PhotoFailurePanel
              failures={pending.failures}
              published
              retrying={retrying}
              status={uploadingStatus}
              onRetry={retryPhotos}
              productId={pending.productId}
            />
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => navigate({ to: "/dashboard" })}>
                Aller à mes produits
              </Button>
              <Button type="button" variant="ghost" onClick={() => setPending(null)}>
                Publier un autre article
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-6 sm:mt-8">
            <ProductForm
              onSubmit={submit}
              submitLabel="Publier"
              uploadingStatus={uploadingStatus}
              maxPhotos={maxPhotos}
              onCancel={() => navigate({ to: "/dashboard" })}
            />
          </div>
        )}
      </div>
      <MobileFooter />
      <MobileNav />
    </div>
  );
}
