import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/stockme-client";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { MobileNav } from "@/components/MobileNav";
import { MobileFooter } from "@/components/MobileFooter";
import { ProductCard, type ListingProduct } from "@/components/ProductCard";
import { buildSeoHead } from "@/lib/seo";
import { Package, Truck, Zap } from "lucide-react";

export const Route = createFileRoute("/dropshipping")({
  head: () => {
    const { meta, links } = buildSeoHead({
      title: "Dropshipping — Produits livrés sur commande | StockMe",
      description:
        "Découvrez des produits en dropshipping : livrés sur commande, unité par unité, sans stock. Contactez le vendeur et recevez votre produit.",
      path: "/dropshipping",
      keywords: "dropshipping, livraison sur commande, e-commerce sans stock, Afrique de l'Ouest, grossiste dropshipping",
    });
    return { meta, links };
  },
  component: DropshippingPage,
});

function DropshippingPage() {
  const [items, setItems] = useState<ListingProduct[] | null>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const { data } = await supabase
        .from("products")
        .select("id,name,category,price_fcfa,promo_price_fcfa,quantity,moq,city,zone,images,sold_out")
        .eq("published", true)
        .eq("dropshipping", true)
        .order("created_at", { ascending: false })
        .limit(60);
      if (!cancel) setItems((data as ListingProduct[] | null) ?? []);
    })();
    return () => {
      cancel = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <Header />
      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-6 sm:py-10">
        {/* Bannière dropshipping */}
        <section className="rounded-3xl border border-border bg-card p-6 sm:p-8">
          <div className="flex items-center gap-2 text-volt">
            <Zap className="h-5 w-5" />
            <p className="text-[11px] font-semibold tracking-[0.2em] uppercase">Dropshipping</p>
          </div>
          <h1 className="mt-2 font-display text-2xl sm:text-4xl font-bold tracking-tight">
            Des produits livrés sur commande
          </h1>
          <p className="mt-2 max-w-2xl text-sm sm:text-base text-muted-foreground leading-relaxed">
            Contrairement à la <strong>vente en gros</strong> (lots), ces produits sont vendus
            <strong> unité par unité</strong> et le vendeur <strong>livre dès qu'il y a une commande</strong> —
            exactement comme en dropshipping. Commandez directement, sans acheter de stock.
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="flex items-start gap-3 rounded-2xl border border-border bg-background/50 p-4">
              <Truck className="mt-0.5 h-5 w-5 shrink-0 text-volt" />
              <div>
                <p className="text-sm font-semibold">Livraison à la commande</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Le vendeur vous livre après votre commande.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-2xl border border-border bg-background/50 p-4">
              <Package className="mt-0.5 h-5 w-5 shrink-0 text-volt" />
              <div>
                <p className="text-sm font-semibold">Pas de stock à acheter</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Vous commandez, il livre. Simple et rapide.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
            {items === null ? "Chargement…" : `${items.length} produit${items.length > 1 ? "s" : ""} en dropshipping`}
          </h2>

          {items === null ? (
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="aspect-square rounded-2xl shimmer bg-muted" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="mt-6 grid place-items-center py-16 text-center border border-dashed border-border rounded-3xl bg-muted/30">
              <Package className="h-10 w-10 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">Aucun produit en dropshipping</h3>
              <p className="mt-1 text-sm text-muted-foreground max-w-xs">
                Revenez bientôt — les vendeurs ajoutent régulièrement des produits livrables sur commande.
              </p>
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
              {items.map((p, i) => (
                <ProductCard key={p.id} product={p} delayMs={i * 45} />
              ))}
            </div>
          )}
        </section>
      </main>
      <Footer />
      <MobileFooter />
      <MobileNav />
    </div>
  );
}
