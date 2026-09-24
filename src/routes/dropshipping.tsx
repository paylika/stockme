import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/stockme-client";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { MobileNav } from "@/components/MobileNav";
import { MobileFooter } from "@/components/MobileFooter";
import { ProductCard, type ListingProduct } from "@/components/ProductCard";
import { useVerifiedSellers } from "@/hooks/useVerifiedSellers";
import { buildSeoHead } from "@/lib/seo";
import { Package, Store, Truck, Zap } from "lucide-react";

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
  const verified = useVerifiedSellers();

  useEffect(() => {
    let cancel = false;
    (async () => {
      const { data } = await supabase
        .from("products")
        .select("id,name,category,price_fcfa,promo_price_fcfa,quantity,moq,city,zone,images,sold_out,dropshipping,owner_id")
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
            Vendez sans stock — ou faites livrer votre stock
          </h1>
          <p className="mt-2 max-w-2xl text-sm sm:text-base text-muted-foreground leading-relaxed">
            En dropshipping, <strong className="text-foreground">rien n'est acheté à l'avance</strong> :
            l'e-commerçant trouve la commande, le fournisseur livre. Chacun y gagne.
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-border bg-background/50 p-5">
              <div className="flex items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-volt/15 text-volt">
                  <Store className="h-4 w-4" />
                </span>
                <h2 className="text-sm font-bold">Vous avez du stock ?</h2>
              </div>
              <ol className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li className="flex gap-2"><span className="font-bold text-foreground">1.</span> Publiez votre produit en cochant <strong className="text-foreground">Dropshipping</strong>.</li>
                <li className="flex gap-2"><span className="font-bold text-foreground">2.</span> Un e-commerçant vous passe la commande.</li>
                <li className="flex gap-2"><span className="font-bold text-foreground">3.</span> Vous livrez le client et vous lui versez son bénéfice.</li>
              </ol>
            </div>

            <div className="rounded-2xl border border-border bg-background/50 p-5">
              <div className="flex items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Truck className="h-4 w-4" />
                </span>
                <h2 className="text-sm font-bold">Vous êtes e-commerçant ?</h2>
              </div>
              <ol className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li className="flex gap-2"><span className="font-bold text-foreground">1.</span> Choisissez un produit en dropshipping (sans acheter de stock).</li>
                <li className="flex gap-2"><span className="font-bold text-foreground">2.</span> Vendez-le à vos clients avec votre marge.</li>
                <li className="flex gap-2"><span className="font-bold text-foreground">3.</span> Le fournisseur livre — vous touchez votre bénéfice.</li>
              </ol>
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
                <ProductCard
                  key={p.id}
                  product={p}
                  sellerVerified={!!p.owner_id && verified.has(p.owner_id)}
                  delayMs={i * 45}
                />
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
