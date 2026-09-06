import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/stockme-client";
import { Header } from "@/components/Header";
import { MobileNav } from "@/components/MobileNav";
import { MobileFooter } from "@/components/MobileFooter";
import { ProductForm, ProductFormValues } from "@/components/ProductForm";
import { uploadImages } from "@/lib/image-upload";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard/new")({
  component: NewProduct,
});

function NewProduct() {
  const navigate = useNavigate();
  const [uploadingStatus, setUploadingStatus] = useState("");

  const submit = async (values: ProductFormValues) => {
    const { data: u, error: userError } = await supabase.auth.getUser();
    if (userError || !u.user) throw new Error("Reconnectez-vous pour publier le produit.");

    const urls = await uploadImages(values.newFiles, u.user.id, setUploadingStatus);
    setUploadingStatus("Publication du produit...");

    const payload = {
      owner_id: u.user.id,
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
    if (values.whatsapp) {
      await supabase
        .from("profiles")
        .update({ whatsapp: values.whatsapp })
        .eq("id", u.user.id);
    }

    toast.success("Produit publié !");
    navigate({ to: "/dashboard" });
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-6 sm:py-10">
        <h1 className="text-2xl sm:text-4xl font-bold tracking-tight">Ajouter un produit</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Photos, prix, localité et WhatsApp sont obligatoires.
        </p>

        <div className="mt-6 sm:mt-8">
          <ProductForm
            onSubmit={submit}
            submitLabel="Publier"
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
