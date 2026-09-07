import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/stockme-client";
import { Header } from "@/components/Header";
import { MobileNav } from "@/components/MobileNav";
import { MobileFooter } from "@/components/MobileFooter";
import { ProductForm, ProductFormInitial, ProductFormValues } from "@/components/ProductForm";
import { uploadImages } from "@/lib/image-upload";
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

  useEffect(() => {
    let cancel = false;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) {
        navigate({ to: "/auth", search: { redirect: `/dashboard/edit/${id}`, mode: "login" } });
        return;
      }
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (cancel) return;
      if (error || !data || data.owner_id !== u.user.id) {
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
        images: data.images ?? [],
      });
      setLoading(false);
    })();
    return () => {
      cancel = true;
    };
  }, [id]);

  const submit = async (values: ProductFormValues) => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw new Error("Reconnectez-vous pour modifier le produit.");

    const urls = await uploadImages(values.newFiles, u.user.id, setUploadingStatus);
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
      })
      .eq("id", id);
    if (error) throw new Error(error.message);

    if (values.whatsapp) {
      await supabase.from("profiles").update({ whatsapp: values.whatsapp }).eq("id", u.user.id);
    }

    toast.success("Produit mis à jour !");
    navigate({ to: "/dashboard" });
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

        <div className="mt-6 sm:mt-8">
          <ProductForm
            initial={product}
            onSubmit={submit}
            submitLabel="Enregistrer"
            uploadingStatus={uploadingStatus}
            onCancel={() => navigate({ to: "/dashboard" })}
          />
        </div>
      </div>
      <MobileFooter />
      <MobileNav />
    </div>
  );
}
