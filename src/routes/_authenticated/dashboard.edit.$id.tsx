import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/stockme-client";
import { Header } from "@/components/Header";
import { MobileNav } from "@/components/MobileNav";
import { MobileFooter } from "@/components/MobileFooter";
import { ProductForm, ProductFormInitial, ProductFormValues } from "@/components/ProductForm";
import { PhotoFailurePanel } from "@/components/PhotoFailurePanel";
import { uploadImagesResilient, MAX_PHOTOS, FREE_MAX_PHOTOS, type UploadFailure } from "@/lib/image-upload";
import { requireUserId } from "@/lib/current-user";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard/edit/$id")({
  component: EditProduct,
});

function EditProduct() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState<ProductFormInitial | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploadingStatus, setUploadingStatus] = useState("");
  const [pending, setPending] = useState<{ urls: string[]; files: File[]; failures: UploadFailure[] } | null>(null);
  const [retrying, setRetrying] = useState(false);
  // Compte gratuit : 2 photos — on ne force JAMAIS à supprimer des photos déjà
  // en ligne : la limite ne s'applique qu'aux ajouts.
  const [verifiedSeller, setVerifiedSeller] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: s } = await supabase.auth.getSession();
      const uid = s.session?.user?.id;
      if (!uid) return;
      const { data } = await supabase.from("profiles").select("verified,verified_until").eq("id", uid).maybeSingle();
      const p = data as { verified: boolean; verified_until: string | null } | null;
      setVerifiedSeller(!!p?.verified && (!p.verified_until || new Date(p.verified_until) > new Date()));
    })();
  }, []);

  useEffect(() => {
    let cancel = false;
    (async () => {
      let userId: string | null = null;
      try {
        userId = await requireUserId();
      } catch {
        userId = null;
      }
      if (!userId) {
        navigate({ to: "/auth", search: { redirect: `/dashboard/edit/${id}`, mode: "login" } });
        return;
      }
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (cancel) return;
      if (error || !data || data.owner_id !== userId) {
        toast.error("Produit introuvable ou accès non autorisé");
        navigate({ to: "/dashboard" });
        return;
      }
      setProduct({
        name: data.name,
        description: data.description,
        category: data.category,
        city: data.city,
        zone: data.zone,
        price_fcfa: data.price_fcfa,
        promo_price_fcfa: data.promo_price_fcfa,
        revenue_fcfa: data.revenue_fcfa,
        quantity: data.quantity,
        moq: data.moq,
        whatsapp: data.whatsapp,
        dropshipping: data.dropshipping ?? false,
        sizes: data.sizes ?? [],
        colors: data.colors ?? [],
        weight_grams: data.weight_grams,
        price_tiers: data.price_tiers,
        images: data.images ?? [],
      });
      setLoading(false);
    })();
    return () => {
      cancel = true;
    };
  }, [id]);

  const submit = async (values: ProductFormValues) => {
    const userId = await requireUserId("Reconnectez-vous pour modifier le produit.");

    // Les photos ne bloquent jamais l'enregistrement : les images déjà en ligne
    // sont conservées, et une photo qui échoue peut être renvoyée juste après.
    const { urls, failures } = await uploadImagesResilient(values.newFiles, userId, setUploadingStatus);
    setUploadingStatus("Enregistrement...");
    const images = [...values.existingImages, ...urls];

    const { error } = await supabase
      .from("products")
      .update({
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
        images,
        dropshipping: values.dropshipping,
        sizes: values.sizes,
        colors: values.colors,
        weight_grams: values.weight_grams,
        price_tiers: values.price_tiers,
      })
      .eq("id", id);
    if (error) throw new Error(error.message);

    if (values.whatsapp) {
      await supabase.from("profiles").update({ whatsapp: values.whatsapp }).eq("id", userId);
    }

    setUploadingStatus("");

    if (failures.length > 0) {
      const failedNames = new Set(failures.map((f) => f.fileName));
      setPending({
        urls: values.existingImages,
        files: values.newFiles.filter((f) => failedNames.has(f.name)),
        failures,
      });
      toast.warning("Produit mis à jour. Une photo au moins n'a pas pu être envoyée — renvoyez-la ci-dessous.");
      return;
    }

    toast.success("Produit mis à jour !");
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
        const { error } = await supabase.from("products").update({ images: allImages }).eq("id", id);
        if (error) throw new Error(error.message);
      }

      if (failures.length === 0) {
        toast.success("Photo(s) ajoutée(s) au produit !");
        navigate({ to: "/dashboard" });
        return;
      }

      const stillFailed = new Set(failures.map((f) => f.fileName));
      setPending({ ...pending, urls: allImages, files: pending.files.filter((f) => stillFailed.has(f.name)), failures });
      toast.error("L'envoi a encore échoué. Réessayez dans un instant.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur pendant l'envoi");
    } finally {
      setUploadingStatus("");
      setRetrying(false);
    }
  };

  if (loading || !product) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-10">
          <div className="h-8 w-64 shimmer bg-muted rounded" />
          <div className="mt-6 space-y-4">
            <div className="h-11 shimmer bg-muted rounded" />
            <div className="h-32 shimmer bg-muted rounded" />
          </div>
        </div>
        <MobileFooter />
        <MobileNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-6 sm:py-10">
        <h1 className="text-2xl sm:text-4xl font-bold tracking-tight">Modifier le produit</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Mettez à jour les informations, photos, prix et statut.
        </p>

        {pending && (
          <div className="mt-4">
            <PhotoFailurePanel
              failures={pending.failures}
              published
              retrying={retrying}
              status={uploadingStatus}
              onRetry={retryPhotos}
              productId={id}
            />
          </div>
        )}

        <div className="mt-6 sm:mt-8">
          <ProductForm
            initial={product}
            onSubmit={submit}
            submitLabel="Enregistrer"
            uploadingStatus={uploadingStatus}
            maxPhotos={verifiedSeller ? MAX_PHOTOS : Math.max(FREE_MAX_PHOTOS, product?.images?.length ?? 0)}
            onCancel={() => navigate({ to: "/dashboard" })}
          />
        </div>
      </div>
      <MobileFooter />
      <MobileNav />
    </div>
  );
}
