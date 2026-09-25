import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/stockme-client";
import { Header } from "@/components/Header";
import { MobileNav } from "@/components/MobileNav";
import { MobileFooter } from "@/components/MobileFooter";
import { Button } from "@/components/ui/button";
import { formatFCFA, whatsappLink } from "@/lib/format";
import { useAuth } from "@/hooks/useAuth";
import { IntensityGauge, computeIntensity } from "@/components/IntensityGauge";
import { JsonLd } from "@/components/JsonLd";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { BackLink } from "@/components/BackLink";
import { clearMobileAction, setMobileAction } from "@/lib/mobile-action";
import { buildSeoHead, productLd, breadcrumbLd } from "@/lib/seo";
import { countryOfCity, isAdminEmail } from "@/lib/constants";
import { CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Eye, Heart, Lock, MapPin, MessageCircle, Package, Phone, Share2, ShieldCheck, Store, Zap } from "lucide-react";
import { toast } from "sonner";

type Product = {
  id: string; name: string; description: string | null; category: string;
  price_fcfa: number; promo_price_fcfa: number | null; revenue_fcfa: number | null;
  quantity: number; moq: number; city: string; zone: string | null;
  images: string[]; owner_id: string; whatsapp: string | null;
  published: boolean; sold_out: boolean; dropshipping: boolean;
  sizes: string[]; colors: string[]; weight_grams: number | null;
};
type Profile = { full_name: string | null; whatsapp: string | null; phone: string | null; city: string | null; shop_name: string | null; avatar_url?: string | null };
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
};
type Similar = {
  id: string; name: string; price_fcfa: number; promo_price_fcfa: number | null;
  city: string; zone: string | null; images: string[]; sold_out: boolean;
  views: number; contacts: number; favorites: number;
  owner_id?: string; seller_verified?: boolean;
};
type SellerStats = {
  total_products: number;
  total_views: number;
  total_contacts: number;
  total_favorites: number;
  stock_value: number;
  countries: { country: string | null; value: number }[];
  trend: { day: string; value: number }[];
};

export const Route = createFileRoute("/product/$id")({
  loader: async ({ params }) => {
    const { data } = await supabase
      .from("products")
      .select("id,name,description,images,price_fcfa,promo_price_fcfa,city,category,quantity,moq,sold_out")
      .eq("id", params.id)
      .maybeSingle();
    return {
      seo: data as null | {
        id: string;
        name: string;
        description: string | null;
        images: string[];
        price_fcfa: number;
        promo_price_fcfa: number | null;
        city: string;
        category: string;
        quantity: number;
        moq: number;
        sold_out: boolean;
      },
    };
  },
  head: ({ loaderData }) => {
    const p = loaderData?.seo;
    const title = p ? `${p.name} — ${formatFCFA(p.promo_price_fcfa ?? p.price_fcfa)} · ${p.city} | StockMe` : "Produit | StockMe";
    const description = p
      ? (p.description?.slice(0, 150) || `${p.name} disponible à ${p.city}. ${p.category} en gros au meilleur prix, contact direct WhatsApp sur StockMe.`)
      : "Découvrez ce stock disponible sur StockMe.";
    const image = p?.images?.[0];
    const { meta, links } = buildSeoHead({
      title,
      description,
      image,
      path: p ? `/product/${p.id}` : "/product",
      type: "product",
    });
    return { meta, links };
  },
  component: ProductPage,
});

function ProductPage() {
  const { id } = Route.useParams();
  const { user, loading: authLoading } = useAuth();
  const loaderSeo = Route.useLoaderData()?.seo;
  const seoLd = loaderSeo ? (
    <>
      <JsonLd
        data={productLd({
          id: loaderSeo.id,
          name: loaderSeo.name,
          description: loaderSeo.description,
          images: loaderSeo.images,
          category: loaderSeo.category,
          price_fcfa: loaderSeo.price_fcfa,
          promo_price_fcfa: loaderSeo.promo_price_fcfa,
          quantity: loaderSeo.quantity,
          moq: loaderSeo.moq,
          sold_out: loaderSeo.sold_out,
          city: loaderSeo.city,
        })}
      />
      <JsonLd
        data={breadcrumbLd([
          { name: "Accueil", path: "/" },
          { name: loaderSeo.name, path: `/product/${loaderSeo.id}` },
        ])}
      />
    </>
  ) : null;
  const [product, setProduct] = useState<Product | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [seller, setSeller] = useState<PublicSeller | null>(null);
  const [similar, setSimilar] = useState<Similar[]>([]);
  const [activeImg, setActiveImg] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isFav, setIsFav] = useState(false);
  const [descOpen, setDescOpen] = useState(false);
  const [sellerStats, setSellerStats] = useState<SellerStats | null>(null);
  const viewerCountryRef = useRef<string | null>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      setActiveImg(0);
      const { data } = await supabase.from("products").select("*").eq("id", id).maybeSingle();
      if (cancel) return;
      const p = data as Product | null;
      setProduct(p);
      if (p) {
        const [{ data: prof }, { data: sim }, { data: pub }] = await Promise.all([
          supabase.from("profiles").select("full_name,whatsapp,phone,city,shop_name,avatar_url").eq("id", p.owner_id).maybeSingle(),
          supabase.rpc("get_similar_products", { p_product_id: p.id, p_limit: 8 }),
          // Profil public (fonctionne même pour un visiteur non connecté)
          supabase.rpc("get_public_seller", { p_seller_id: p.owner_id }),
        ]);
        if (!cancel) {
          const publicSeller = (pub as PublicSeller | null) ?? null;
          setSeller(publicSeller);
          setProfile(
            (prof as Profile | null) ??
              (publicSeller
                ? {
                    full_name: publicSeller.full_name,
                    shop_name: publicSeller.shop_name,
                    city: publicSeller.city,
                    avatar_url: publicSeller.avatar_url,
                    whatsapp: null,
                    phone: null,
                  }
                : null),
          );
          setSimilar((sim as Similar[] | null) ?? []);
        }
        // Statistiques réelles du vendeur (insignes)
        supabase
          .rpc("get_seller_stats", { p_seller_id: p.owner_id })
          .then(({ data }) => setSellerStats((data as SellerStats | null) ?? null));
      }
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [id]);

  // 1 vue produit par visite (dédupliquée par session)
  useEffect(() => {
    if (!product) return;
    const key = `stockme:viewed:${id}`;
    if (typeof window !== "undefined" && !sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, "1");
      supabase.rpc("log_product_event", { p_product_id: id, p_event: "view" }).then(() => {});
    }
  }, [product, id]);

  // Pays de l'acheteur (pour les contacts) — déduit du profil
  useEffect(() => {
    if (!user) { viewerCountryRef.current = null; return; }
    supabase
      .from("profiles")
      .select("city")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        viewerCountryRef.current = countryOfCity(data?.city);
      });
  }, [user]);

  const logContact = () => {
    supabase
      .rpc("log_product_event", { p_product_id: id, p_event: "contact", p_country: viewerCountryRef.current })
      .then(() => {});
  };

  useEffect(() => {
    if (!user) { setIsFav(false); return; }
    (async () => {
      const { data } = await supabase.from("favorites").select("id").eq("user_id", user.id).eq("product_id", id).maybeSingle();
      setIsFav(!!data);
    })();
  }, [user, id]);

  /**
   * Action d'achat intégrée à la barre de navigation mobile : la navigation
   * reste visible et le contact est toujours à portée de pouce.
   *
   * ⚠️ Ce hook DOIT rester avant les retours anticipés du rendu (chargement,
   * produit introuvable, produit dépublié). Placé après, il changerait le
   * nombre de hooks entre deux rendus et ferait planter la page (React #310).
   */
  useEffect(() => {
    if (!product || product.sold_out || authLoading) {
      clearMobileAction();
      return;
    }

    const effectivePrice =
      product.promo_price_fcfa && product.promo_price_fcfa < product.price_fcfa
        ? product.promo_price_fcfa
        : product.price_fcfa;

    if (!user) {
      setMobileAction({
        label: formatFCFA(effectivePrice),
        href: `/auth?mode=signup&redirect=/product/${id}`,
        icon: "login",
        ariaLabel: "Se connecter pour voir le contact du vendeur",
      });
      return () => clearMobileAction();
    }

    const number = product.whatsapp || profile?.whatsapp || "";
    if (number) {
      const message = product.dropshipping
        ? `Bonjour, je souhaite commander "${product.name}" (dropshipping) sur StockMe.`
        : `Bonjour, je suis intéressé par votre stock de "${product.name}" sur StockMe.`;
      setMobileAction({
        label: formatFCFA(effectivePrice),
        href: whatsappLink(number, message),
        icon: "whatsapp",
        ariaLabel: product.dropshipping ? "Commander sur WhatsApp" : "Contacter le vendeur sur WhatsApp",
      });
    } else {
      clearMobileAction();
    }

    return () => clearMobileAction();
  }, [product, profile, user, authLoading, id]);

  const scrollerRef = useRef<HTMLDivElement>(null);

  const goTo = (i: number) => {
    const el = scrollerRef.current;
    if (!el || !product) return;
    const n = product.images.length;
    if (!n) return;
    const idx = (i + n) % n;
    el.scrollTo({ left: idx * el.clientWidth, behavior: "smooth" });
    setActiveImg(idx);
  };

  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el || !el.clientWidth) return;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    setActiveImg((prev) => (prev === idx ? prev : idx));
  };

  const share = async () => {
    if (!product) return;
    const url = typeof window !== "undefined" ? window.location.href : "";
    const text = `${product.name} — ${formatFCFA(product.promo_price_fcfa ?? product.price_fcfa)} · ${product.city} sur StockMe`;
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: product.name, text, url });
        return;
      }
      await navigator.clipboard.writeText(`${text}\n${url}`);
      toast.success("Lien copié — collez-le sur WhatsApp");
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
      window.open(`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`, "_blank");
    }
  };

  const toggleFav = async () => {
    if (!user) return toast.error("Connectez-vous pour ajouter aux favoris");
    if (isFav) {
      await supabase.from("favorites").delete().eq("user_id", user.id).eq("product_id", id);
      setIsFav(false);
      toast.success("Retiré des favoris");
    } else {
      await supabase.from("favorites").insert({ user_id: user.id, product_id: id });
      setIsFav(true);
      toast.success("Ajouté aux favoris");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        {seoLd}
        <Header />
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10 grid lg:grid-cols-2 gap-10">
          <div className="aspect-square rounded-xl shimmer bg-muted" />
          <div className="space-y-4">
            <div className="h-8 w-2/3 shimmer bg-muted rounded" />
            <div className="h-5 w-1/3 shimmer bg-muted rounded" />
            <div className="h-32 shimmer bg-muted rounded" />
          </div>
        </div>
        <MobileFooter />
      <MobileNav />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="mx-auto max-w-3xl px-4 py-20 text-center">
          <h1 className="text-2xl font-bold">Produit introuvable</h1>
          <Link to="/" className="mt-4 inline-block text-volt underline">Retour aux produits</Link>
        </div>
        <MobileFooter />
      <MobileNav />
      </div>
    );
  }

  // Produit dépublié : accessible au propriétaire et aux admins (modération).
  if (!product.published && user?.id !== product.owner_id && !isAdminEmail(user?.email)) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="mx-auto max-w-3xl px-4 py-20 text-center">
          <h1 className="text-2xl font-bold">Produit introuvable</h1>
          <p className="mt-2 text-sm text-muted-foreground">Ce produit n'est plus disponible.</p>
          <Link to="/" className="mt-4 inline-block text-volt underline">Retour aux produits</Link>
        </div>
        <MobileFooter />
      <MobileNav />
      </div>
    );
  }

  const waNumber = product.whatsapp || profile?.whatsapp || "";
  const waMsg = product.dropshipping
    ? `Bonjour, je souhaite commander "${product.name}" (dropshipping) sur StockMe.`
    : `Bonjour, je suis intéressé par votre stock de "${product.name}" sur StockMe.`;
  const wa = waNumber ? whatsappLink(waNumber, waMsg) : null;
  const img = product.images[activeImg];
  const hasPromo = product.promo_price_fcfa && product.promo_price_fcfa < product.price_fcfa;

  const stats = sellerStats;
  const contactRate = stats && stats.total_views > 0 ? Math.round((stats.total_contacts / stats.total_views) * 100) : 0;
  const intensity = stats ? computeIntensity(stats) : 0;

  return (
    <div className="min-h-screen bg-background">
      {seoLd}
      <Header />
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-4 sm:py-8">
        <div className="flex items-center justify-between mb-4 sm:mb-6">
          <BackLink fallback="/" label="Retour" />
          <div className="flex items-center gap-2">
            <button onClick={share} className="grid h-9 w-9 place-items-center rounded-full border border-border bg-card hover:bg-accent" aria-label="Partager">
              <Share2 className="h-4 w-4" />
            </button>
            <button onClick={toggleFav} className={`grid h-9 w-9 place-items-center rounded-full border border-border ${isFav ? "bg-volt text-volt-foreground border-volt" : "bg-card hover:bg-accent"}`} aria-label="Favori">
              <Heart className={`h-4 w-4 ${isFav ? "fill-current" : ""}`} />
            </button>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-6 lg:gap-10">
          <div className="space-y-3 lg:sticky lg:top-24 lg:self-start">
            <div className="relative">
              <div
                ref={scrollerRef}
                onScroll={onScroll}
                className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth rounded-2xl border border-border bg-muted [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
              >
                {product.images.length ? (
                  product.images.map((src, i) => (
                    <div key={i} className="w-full shrink-0 snap-center aspect-square">
                      <img src={src} alt={`${product.name} — photo ${i + 1}`} className="h-full w-full object-cover" />
                    </div>
                  ))
                ) : (
                  <div className="grid w-full aspect-square place-items-center text-muted-foreground"><Package className="h-16 w-16" /></div>
                )}
              </div>

              {product.images.length > 1 && (
                <>
                  <button onClick={() => goTo(activeImg - 1)} aria-label="Photo précédente"
                    className="hidden sm:grid absolute left-2 top-1/2 -translate-y-1/2 h-9 w-9 place-items-center rounded-full bg-background/80 border border-border backdrop-blur hover:bg-background">
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button onClick={() => goTo(activeImg + 1)} aria-label="Photo suivante"
                    className="hidden sm:grid absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 place-items-center rounded-full bg-background/80 border border-border backdrop-blur hover:bg-background">
                    <ChevronRight className="h-4 w-4" />
                  </button>
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-full bg-background/80 px-2.5 py-1.5 backdrop-blur border border-border">
                    {product.images.map((_, i) => (
                      <button key={i} onClick={() => goTo(i)} aria-label={`Aller à la photo ${i + 1}`}
                        className={`h-1.5 rounded-full transition-all ${activeImg === i ? "w-5 bg-volt" : "w-1.5 bg-foreground/30"}`} />
                    ))}
                  </div>
                </>
              )}
            </div>

            {product.images.length > 1 && (
              <div className="grid grid-cols-5 gap-2">
                {product.images.map((src, i) => (
                  <button key={i} onClick={() => goTo(i)}
                    className={`aspect-square rounded-md overflow-hidden border-2 transition ${activeImg === i ? "border-volt" : "border-border hover:border-foreground/30"}`}>
                    <img src={src} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="text-xs font-medium tracking-[0.18em] uppercase text-muted-foreground">{product.category}</p>
            <h1 className="mt-2 text-2xl sm:text-4xl font-bold tracking-tight text-balance">{product.name}</h1>

            <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-sm">
              <MapPin className="h-3.5 w-3.5" /> {product.zone ? `${product.zone}, ${product.city}` : product.city}
            </div>

            {product.dropshipping && (
              <div className="mt-5 mb-3 rounded-2xl border border-dashed border-volt/50 bg-volt/10 p-4">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-volt">
                  <Zap className="h-4 w-4" /> Produit en dropshipping
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Vendu et <strong>livré sur commande</strong>, unité par unité. Le vendeur vous livre après votre commande.
                </p>
              </div>
            )}
            <div className="mt-3 rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-sm">
              {hasPromo ? (
                <div className="flex items-baseline gap-3 flex-wrap">
                  <div className="text-3xl sm:text-4xl font-bold tracking-tight">{formatFCFA(product.promo_price_fcfa!)}</div>
                  <div className="text-base line-through text-muted-foreground">{formatFCFA(product.price_fcfa)}</div>
                  <span className="rounded-full bg-volt text-volt-foreground px-2 py-0.5 text-[10px] font-bold">PROMO</span>
                </div>
              ) : (
                <div className="text-3xl sm:text-4xl font-bold tracking-tight">{formatFCFA(product.price_fcfa)}</div>
              )}
              <div className="mt-1 text-sm text-muted-foreground">prix unitaire</div>

              <div className="mt-5 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-muted-foreground text-xs uppercase tracking-wider">Stock</div>
                  <div className="mt-0.5 font-semibold">{product.quantity} unités</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs uppercase tracking-wider">Commande min</div>
                  <div className="mt-0.5 font-semibold">{product.moq} unités</div>
                </div>
                {product.revenue_fcfa ? (
                  <div className="col-span-2">
                    <div className="text-muted-foreground text-xs uppercase tracking-wider">CA déjà généré</div>
                    <div className="mt-0.5 font-semibold text-foreground">{formatFCFA(product.revenue_fcfa)}</div>
                  </div>
                ) : null}
              </div>

              {(product.sizes?.length > 0 || product.colors?.length > 0 || product.weight_grams) && (
                <div className="mt-4 space-y-3 border-t border-border pt-4 text-sm">
                  {product.sizes?.length > 0 && (
                    <div>
                      <div className="text-muted-foreground text-xs uppercase tracking-wider">Tailles</div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {product.sizes.map((s) => (
                          <span key={s} className="rounded-md border border-border bg-background px-2 py-0.5 text-xs font-semibold">{s}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {product.colors?.length > 0 && (
                    <div>
                      <div className="text-muted-foreground text-xs uppercase tracking-wider">Couleurs</div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {product.colors.map((c) => (
                          <span key={c} className="rounded-md border border-border bg-background px-2 py-0.5 text-xs font-medium">{c}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {product.weight_grams ? (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground text-xs uppercase tracking-wider">Poids</span>
                      <span className="font-semibold">{(product.weight_grams / 1000).toLocaleString("fr-FR")} kg</span>
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            <h2 className="mt-5 text-sm font-semibold tracking-wider uppercase text-muted-foreground">À propos du vendeur</h2>
            <div className="mt-3 rounded-2xl border border-border p-5 bg-card shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Link
                    to="/vendeur/$id"
                    params={{ id: product.owner_id }}
                    aria-label="Voir la boutique du vendeur"
                    className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full bg-volt text-base font-bold text-volt-foreground"
                  >
                    {profile?.avatar_url ? (
                      <img src={profile.avatar_url} alt={profile.shop_name || profile.full_name || "Vendeur"} className="h-full w-full object-cover" />
                    ) : (
                      <span>
                        {(profile?.shop_name || profile?.full_name || "V")
                          .split(/\s+/)
                          .map((w) => w[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase()}
                      </span>
                    )}
                  </Link>
                  <div className="min-w-0">
                    <div className="text-xs text-muted-foreground">Fournisseur</div>
                    <Link
                      to="/vendeur/$id"
                      params={{ id: product.owner_id }}
                      className="block truncate font-semibold hover:text-primary"
                      title="Voir tous ses produits"
                    >
                      {profile?.shop_name || profile?.full_name || "Vendeur"}
                    </Link>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                      {seller?.is_verified && <VerifiedBadge compact />}
                      {profile?.city && (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="h-3 w-3" /> {profile.city}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {stats ? (
                  <IntensityGauge value={intensity} size={110} />
                ) : (
                  <div className="h-16 w-16 rounded-full shimmer bg-muted" />
                )}
              </div>

              <Link
                to="/vendeur/$id"
                params={{ id: product.owner_id }}
                className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border text-sm font-semibold transition hover:bg-accent"
              >
                <Store className="h-4 w-4" /> Voir la boutique
                {typeof seller?.products_count === "number" && seller.products_count > 0
                  ? ` (${seller.products_count})`
                  : ""}
              </Link>

              {stats && (
                <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <BadgeStat icon={Store} label="Produits" value={String(stats.total_products)} />
                  <BadgeStat icon={Eye} label="Vues" value={formatCount(stats.total_views)} />
                  <BadgeStat icon={MessageCircle} label="Contacts" value={formatCount(stats.total_contacts)} />
                  <BadgeStat icon={Heart} label="Favoris" value={formatCount(stats.total_favorites)} />
                  <div className="col-span-2 sm:col-span-4">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Taux de contact</span>
                      <span className="font-semibold text-foreground">{contactRate}%</span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-volt transition-all duration-700"
                        style={{ width: `${contactRate}%` }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {product.sold_out ? (
                <div className="mt-4 rounded-xl border border-dashed border-border bg-background/50 p-4 text-center">
                  <Package className="mx-auto h-5 w-5 text-muted-foreground" />
                  <p className="mt-2 text-sm font-medium">Produit épuisé</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Revenez bientôt ou contactez le vendeur pour un réapprovisionnement.
                  </p>
                </div>
              ) : authLoading ? (
                <div className="mt-4 h-11 rounded-md bg-muted shimmer" />
              ) : !user ? (
                <div className="mt-4 border-t border-border pt-4">
                  <p className="flex items-center gap-1.5 text-sm font-semibold">
                    <Lock className="h-4 w-4 text-volt" /> Voir le numéro WhatsApp du vendeur
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Connectez-vous ou créez un compte <strong className="font-semibold text-foreground">gratuit</strong> pour
                    contacter le vendeur directement sur WhatsApp.
                  </p>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <Link to="/auth" search={{ mode: "login" }} className="flex-1">
                      <Button variant="outline" className="h-11 w-full">Se connecter</Button>
                    </Link>
                    <Link to="/auth" search={{ mode: "signup" }} className="flex-1">
                      <Button variant="volt" className="h-11 w-full">Créer un compte</Button>
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="mt-4 flex flex-col sm:flex-row gap-2">
                  {wa ? (
                    <a href={wa} target="_blank" rel="noopener noreferrer" onClick={() => logContact()} className="flex-1">
                      <Button variant="volt" className="w-full h-11">
                        <MessageCircle className="mr-1 h-4 w-4" /> {product.dropshipping ? "Commander sur WhatsApp" : "WhatsApp"}
                      </Button>
                    </a>
                  ) : (
                    <Button variant="volt" disabled className="flex-1 h-11">Contact indisponible</Button>
                  )}
                  {(product.whatsapp || profile?.phone) && (
                    <a href={`tel:${product.whatsapp || profile?.phone}`} onClick={() => logContact()}>
                      <Button variant="outline" className="h-11 w-full sm:w-auto">
                        <Phone className="h-4 w-4" />
                      </Button>
                    </a>
                  )}
                </div>
              )}
            </div>

            {product.description && (
              <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-card">
                <button
                  type="button"
                  onClick={() => setDescOpen((v) => !v)}
                  aria-expanded={descOpen}
                  className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition hover:bg-muted/40"
                >
                  <span className="text-sm font-semibold">Description</span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${descOpen ? "rotate-180" : ""}`}
                  />
                </button>
                {descOpen && (
                  <p className="px-5 pb-5 text-sm leading-relaxed whitespace-pre-line text-muted-foreground">
                    {product.description}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {similar.length > 0 && (
          <section className="mt-12">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight">Produits similaires</h2>
            <p className="text-sm text-muted-foreground">Dans la catégorie {product.category}</p>
            <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
              {similar.map((s) => {
                const sp = s.promo_price_fcfa && s.promo_price_fcfa < s.price_fcfa;
                return (
                  <Link key={s.id} to="/product/$id" params={{ id: s.id }} className="group flex flex-col rounded-xl border border-border bg-card overflow-hidden hover:border-foreground/30 transition">
                    <div className="relative aspect-[4/3] bg-muted overflow-hidden">
                      {s.images[0] ? (
                        <img src={s.images[0]} alt={s.name} className="h-full w-full object-cover transition-transform group-hover:scale-105" loading="lazy" />
                      ) : (
                        <div className="grid h-full place-items-center text-muted-foreground"><Package className="h-8 w-8" /></div>
                      )}
                      {s.sold_out && (
                        <span className="absolute right-2 top-2 rounded-full bg-destructive px-2 py-0.5 text-[10px] font-bold text-background">
                          Épuisé
                        </span>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col p-3">
                      <h3 className="font-semibold leading-tight line-clamp-1 text-sm">{s.name}</h3>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        {s.seller_verified && <VerifiedBadge compact />}
                        <p className="flex items-center gap-1 text-[11px] text-muted-foreground"><MapPin className="h-3 w-3" />{s.city}</p>
                      </div>
                      <div className="mt-1 font-bold text-sm">{formatFCFA(sp ? s.promo_price_fcfa! : s.price_fcfa)}</div>
                      <div className="mt-2 flex items-center gap-3 border-t border-border pt-2 text-[11px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1"><Eye className="h-3 w-3" /> {s.views}</span>
                        <span className="inline-flex items-center gap-1"><MessageCircle className="h-3 w-3" /> {s.contacts}</span>
                        {s.favorites > 0 && (
                          <span className="inline-flex items-center gap-1"><Heart className="h-3 w-3" /> {s.favorites}</span>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}
      </div>
      <MobileFooter />

      {/* L'action d'achat est intégrée à la barre de navigation mobile
          (voir <MobileNav />) : la navigation reste entièrement visible. */}
      <MobileNav />
    </div>
  );
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(n);
}

function BadgeStat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-background/50 p-3">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className="mt-1 text-lg font-bold tracking-tight">{value}</div>
    </div>
  );
}

