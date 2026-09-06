import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/stockme-client";
import { Header } from "@/components/Header";
import { MobileNav } from "@/components/MobileNav";
import { MobileFooter } from "@/components/MobileFooter";
import { formatFCFA } from "@/lib/format";
import { Heart, MapPin, Package } from "lucide-react";

type Fav = { product_id: string; products: { id: string; name: string; price_fcfa: number; promo_price_fcfa: number | null; city: string; images: string[]; category: string; sold_out: boolean } | null };

export const Route = createFileRoute("/_authenticated/favorites")({
  component: Favorites,
});

function Favorites() {
  const [items, setItems] = useState<Fav[] | null>(null);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data } = await supabase.from("favorites")
        .select("product_id, products(id,name,price_fcfa,promo_price_fcfa,city,images,category,sold_out)")
        .eq("user_id", u.user.id)
        .eq("products.published", true)
        .order("created_at", { ascending: false });
      setItems((data as unknown as Fav[]) ?? []);
    })();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6 sm:py-10">
        <h1 className="text-2xl sm:text-4xl font-bold tracking-tight">Mes favoris</h1>
        <p className="mt-1 text-sm text-muted-foreground">Vos produits sauvegardés.</p>

        <div className="mt-6 sm:mt-8">
          {items === null ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className="aspect-[4/3] rounded-xl shimmer bg-muted" />)}
            </div>
          ) : items.length === 0 ? (
            <div className="grid place-items-center py-16 text-center border border-dashed border-border rounded-2xl">
              <Heart className="h-10 w-10 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">Aucun favori</h3>
              <p className="mt-1 text-sm text-muted-foreground">Cliquez sur le ❤️ d'un produit pour le sauvegarder.</p>
              <Link to="/" className="mt-4 text-sm text-volt underline underline-offset-2 hover:no-underline">Parcourir le stock</Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-5">
              {items.filter(i => i.products).map((i) => {
                const p = i.products!;
                const promo = p.promo_price_fcfa && p.promo_price_fcfa < p.price_fcfa;
                return (
                  <Link key={p.id} to="/product/$id" params={{ id: p.id }} className="group rounded-xl border border-border bg-card overflow-hidden hover:border-foreground/30 transition">
                    <div className="relative aspect-[4/3] bg-muted overflow-hidden">
                      {p.images[0] ? (
                        <img src={p.images[0]} alt={p.name} className="h-full w-full object-cover transition-transform group-hover:scale-105" loading="lazy" />
                      ) : (
                        <div className="grid h-full place-items-center text-muted-foreground"><Package className="h-10 w-10" /></div>
                      )}
                      {p.sold_out && (
                        <div className="absolute top-2 right-2 rounded-full bg-destructive text-background px-2 py-0.5 text-[10px] font-bold">
                          Épuisé
                        </div>
                      )}
                    </div>
                    <div className="p-3 sm:p-4">
                      <h3 className="font-semibold line-clamp-1 text-sm sm:text-base">{p.name}</h3>
                      <p className="mt-0.5 text-[11px] text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" />{p.city}</p>
                      <div className="mt-2 font-bold">{formatFCFA(promo ? p.promo_price_fcfa! : p.price_fcfa)}</div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <MobileFooter />
      <MobileNav />
    </div>
  );
}
