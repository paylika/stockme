import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/stockme-client";
import { Header } from "@/components/Header";
import { MobileFooter } from "@/components/MobileFooter";
import { MobileNav } from "@/components/MobileNav";
import { ProductCard, type ListingProduct } from "@/components/ProductCard";
import { Button } from "@/components/ui/button";
import { JsonLd } from "@/components/JsonLd";
import { VerifiedBadge, VerifiedBadgeGold } from "@/components/VerifiedBadge";
import { buildSeoHead, breadcrumbLd, SITE_URL } from "@/lib/seo";
import { COUNTRY_FLAGS, countryOfCity } from "@/lib/constants";
import { whatsappLink } from "@/lib/format";
import { toast } from "sonner";
import { ArrowLeft, Copy, Eye, Heart, MapPin, MessageCircle, Package, Phone, Store } from "lucide-react";

const formatCount = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));

type PublicSeller = {
  id: string;
  shop_name: string | null;
  full_name: string | null;
  avatar_url: string | null;
  city: string | null;
  bio: string | null;
  created_at: string;
  products_count: number;
  is_verified?: boolean;
  verified_until?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
};

type SellerStats = {
  total_products: number;
  total_views: number;
  total_contacts: number;
  total_favorites: number;
} | null;

export const Route = createFileRoute("/vendeur/$id")({
  loader: async ({ params }) => {
    // 1) Fonction publique dédiée (lisible même par un visiteur non connecté).
    const { data } = await supabase.rpc("get_public_seller", { p_seller_id: params.id });
    let seller = (data as PublicSeller | null) ?? null;

    // 2) Repli tant que la fonction n'est pas créée en base : lecture du profil
    //    (autorisée pour les utilisateurs connectés).
    if (!seller) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("id,shop_name,full_name,avatar_url,city,bio,created_at,phone,whatsapp")
        .eq("id", params.id)
        .maybeSingle();
      if (prof) seller = { ...(prof as Omit<PublicSeller, "products_count">), products_count: 0 };
    }

    // 3) Dernier repli : le WhatsApp du produit est public — on l'utilise pour
    //    que le contact du vendeur soit TOUJOURS affiché sur sa boutique.
    if (!seller?.whatsapp && !seller?.phone) {
      const { data: prod } = await supabase
        .from("products")
        .select("whatsapp")
        .eq("owner_id", params.id)
        .eq("published", true)
        .not("whatsapp", "is", null)
        .limit(1)
        .maybeSingle();
      const wa = (prod as { whatsapp: string | null } | null)?.whatsapp ?? null;
      if (wa) seller = { ...(seller ?? ({ id: params.id } as PublicSeller)), whatsapp: wa };
    }

    return { seller };
  },
  head: ({ loaderData }) => {
    const s = loaderData?.seller;
    const name = s?.shop_name || s?.full_name || "Boutique vendeur";
    const { meta, links } = buildSeoHead({
      title: s ? `${name} — stock en gros à ${s.city ?? "Afrique de l'Ouest"} | StockMe` : "Boutique vendeur | StockMe",
      description: s
        ? `${name} sur StockMe : ${s.products_count} produit(s) en gros et en dropshipping${s.city ? ` à ${s.city}` : ""}. Contact direct WhatsApp, sans intermédiaire.`
        : "Découvrez la boutique de ce fournisseur sur StockMe.",
      image: s?.avatar_url ?? undefined,
      path: s ? `/vendeur/${s.id}` : "/",
      keywords: `boutique vendeur, fournisseur grossiste${s?.city ? `, ${s.city}` : ""}, stock en gros, dropshipping, Afrique de l'Ouest, StockMe`,
    });
    return { meta, links };
  },
  component: SellerPage,
});

function SellerPage() {
  const { id } = Route.useParams();
  const seller = Route.useLoaderData()?.seller ?? null;
  const [stats, setStats] = useState<SellerStats>(null);
  const [products, setProducts] = useState<ListingProduct[] | null>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const { data: prods } = await supabase
        .from("products")
        .select("id,name,category,price_fcfa,promo_price_fcfa,quantity,moq,city,zone,images,sold_out,dropshipping")
        .eq("owner_id", id)
        .eq("published", true)
        .order("created_at", { ascending: false });
      if (cancel) return;
      setProducts((prods as ListingProduct[] | null) ?? []);

      const { data } = await supabase.rpc("get_seller_stats", { p_seller_id: id });
      if (!cancel) setStats((data as SellerStats) ?? null);
    })();
    return () => {
      cancel = true;
    };
  }, [id]);

  const displayName = seller?.shop_name || seller?.full_name || "Boutique vendeur";
  const initials = (seller?.shop_name || seller?.full_name || "SM")
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const country = seller?.city ? countryOfCity(seller.city) : null;
  const online = products?.length ?? seller?.products_count ?? 0;
  // Contact du vendeur, affiché en évidence pour éviter que les acheteurs
  // contactent le support StockMe en croyant joindre le vendeur.
  const sellerContact = (seller?.whatsapp || seller?.phone || "").trim() || null;
  const waLink = sellerContact
    ? whatsappLink(
        sellerContact,
        `Bonjour ${seller?.shop_name || seller?.full_name || ""}, je vous contacte via StockMe au sujet de vos produits.`,
      )
    : "#";

  return (
    <div className="min-h-screen bg-background">
      <JsonLd
        data={breadcrumbLd([
          { name: "Accueil", path: "/" },
          { name: displayName, path: `/vendeur/${id}` },
        ])}
      />

      <Header />

      <section className="border-b border-border">
        <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Retour aux produits
          </Link>

          {!seller && products !== null && products.length === 0 ? (
            <div className="mt-10 text-center">
              <h1 className="text-2xl font-bold">Boutique introuvable</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Ce vendeur n'existe pas ou n'a plus de produit en ligne.
              </p>
            </div>
          ) : (
            <>
              <div className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-center">
                <div className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-full bg-volt text-2xl font-bold text-volt-foreground">
                  {seller?.avatar_url ? (
                    <img src={seller.avatar_url} alt={displayName} className="h-full w-full object-cover" />
                  ) : (
                    <span>{initials}</span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">{displayName}</h1>
                    {seller?.is_verified &&
                      (seller.verified_until ? (
                        <VerifiedBadge size="md" />
                      ) : (
                        <VerifiedBadgeGold size="md" />
                      ))}
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    {seller?.city && (
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5" /> {COUNTRY_FLAGS[country ?? ""] ?? ""} {seller.city}
                      </span>
                    )}
                    {seller?.created_at && (
                      <span className="inline-flex items-center gap-1.5">
                        <Store className="h-3.5 w-3.5" /> Membre depuis{" "}
                        {new Date(seller.created_at).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
                      </span>
                    )}
                  </div>

                  {seller?.bio && (
                    <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{seller.bio}</p>
                  )}
                </div>
              </div>

              <div className="mt-6 grid max-w-lg grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat icon={<Package className="h-3.5 w-3.5" />} value={online} label="Produits" />
                <Stat icon={<Eye className="h-3.5 w-3.5" />} value={stats?.total_views ?? 0} label="Vues" />
                <Stat icon={<MessageCircle className="h-3.5 w-3.5" />} value={stats?.total_contacts ?? 0} label="Contacts" />
                <Stat icon={<Heart className="h-3.5 w-3.5" />} value={stats?.total_favorites ?? 0} label="Favoris" />
              </div>

              {/* ===== Contact direct du vendeur (bien visible) ===== */}
              {sellerContact && (
                <div className="mt-6 rounded-2xl border border-volt/40 bg-volt/10 p-4 sm:p-5">
                  <div className="flex flex-wrap items-start gap-3">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-volt text-volt-foreground">
                      <MessageCircle className="h-5 w-5" />
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        Numéro du vendeur — contact direct
                      </p>
                      <p className="mt-0.5 text-xl font-bold tracking-tight">{sellerContact}</p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        C'est bien le numéro de <strong className="text-foreground">{displayName}</strong>. StockMe ne
                        vend pas ces produits et ne reçoit pas les commandes : écrivez directement au vendeur.
                      </p>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <a href={waLink} target="_blank" rel="noopener noreferrer">
                          <Button variant="volt" className="h-11">
                            <MessageCircle className="mr-1.5 h-4 w-4" /> Écrire sur WhatsApp
                          </Button>
                        </a>
                        <a href={`tel:${sellerContact}`}>
                          <Button variant="outline" className="h-11">
                            <Phone className="mr-1.5 h-4 w-4" /> Appeler
                          </Button>
                        </a>
                        <Button
                          variant="outline"
                          className="h-11"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(sellerContact);
                              toast.success("Numéro du vendeur copié");
                            } catch {
                              toast.error("Copie impossible");
                            }
                          }}
                        >
                          <Copy className="mr-1.5 h-4 w-4" /> Copier
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
        <h2 className="text-lg font-bold tracking-tight sm:text-xl">
          {products === null ? "Chargement du stock…" : `Ses produits en ligne (${online})`}
        </h2>

        {products === null ? (
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="aspect-square rounded-2xl shimmer bg-muted" />
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="mt-5 grid place-items-center rounded-3xl border border-dashed border-border bg-muted/30 py-16 text-center">
            <Package className="h-10 w-10 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-semibold">Aucun produit en ligne</h3>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              Ce vendeur n'a pas de stock publié pour le moment. Revenez bientôt.
            </p>
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4">
            {products.map((p, i) => (
              <ProductCard key={p.id} product={p} sellerVerified={!!seller?.is_verified} delayMs={i * 40} />
            ))}
          </div>
        )}

        <p className="mt-8 text-center text-xs text-muted-foreground">
          Boutique hébergée sur StockMe —{" "}
          <a href={SITE_URL} className="underline underline-offset-2 hover:text-foreground">
            www.stockme.store
          </a>
        </p>
      </section>

      <MobileFooter />
      <MobileNav />
    </div>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-2 py-3">
      <div className="flex items-center justify-center gap-1 text-muted-foreground sm:justify-start">
        {icon}
        <span className="text-[11px] uppercase tracking-wider">{label}</span>
      </div>
      <div className="mt-1 text-lg font-bold">{formatCount(value)}</div>
    </div>
  );
}
