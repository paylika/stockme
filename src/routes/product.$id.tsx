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
import { buildSeoHead, productLd, breadcrumbLd } from "@/lib/seo";
import { countryOfCity } from "@/lib/constants";
import { ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, Eye, Heart, Lock, MapPin, MessageCircle, Package, Phone, Share2, ShieldCheck, Store, Zap } from "lucide-react";
import { toast } from "sonner";

type Product = {
  id: string; name: string; description: string | null; category: string;
  price_fcfa: number; promo_price_fcfa: number | null; revenue_fcfa: number | null;
  quantity: number; moq: number; city: string; zone: string | null;
  images: string[]; owner_id: string; whatsapp: string | null;
  published: boolean; sold_out: boolean; dropshipping: boolean;
};
type Profile = { full_name: string | null; whatsapp: string | null; phone: string | null; city: string | null; shop_name: string | null };
type Similar = { id: string; name: string; price_fcfa: number; promo_price_fcfa: number | null; city: string; images: string[] };
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
  const [similar, setSimilar] = useState<Similar[]>([]);
  const [activeImg, setActiveImg] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isFav, setIsFav] = useState(false);
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
        const [{ data: prof }, { data: sim }] = await Promise.all([
          supabase.from("profiles").select("full_name,whatsapp,phone,city,shop_name").eq("id", p.owner_id).maybeSingle(),
          supabase.from("products").select("id,name,price_fcfa,promo_price_fcfa,city,images")
            .eq("category", p.category).neq("id", p.id).order("created_at", { ascending: false }).limit(8),
        ]);
        if (!cancel) {
          setProfile(prof as Profile | null);
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

  // Produit dépublié : accessible uniquement à son propriétaire.
  if (!product.published && user?.id !== product.owner_id) {
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
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Retour
          </Link>
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
            </div>

            {product.description && (
              <div className="mt-6">
                <h2 className="text-sm font-semibold tracking-wider uppercase text-muted-foreground">Description</h2>
                <p className="mt-2 text-sm leading-relaxed whitespace-pre-line">{product.description}</p>
              </div>
            )}

            <h2 className="mt-8 text-sm font-semibold tracking-wider uppercase text-muted-foreground">À propos du vendeur</h2>
            <div className="mt-3 rounded-2xl border border-border p-5 bg-card shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs text-muted-foreground">Fournisseur</div>
                  <div className="font-semibold">{profile?.shop_name || profile?.full_name || "Vendeur"}</div>
                  <span className="mt-1 inline-flex items-center gap-1 text-xs text-volt font-medium">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Vérifié
                  </span>
                </div>
                {stats ? (
                  <IntensityGauge value={intensity} size={110} />
                ) : (
                  <div className="h-16 w-16 rounded-full shimmer bg-muted" />
                )}
              </div>

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
                <div className="mt-4 rounded-xl border border-dashed border-border bg-background/50 p-4 text-center">
                  <Lock className="mx-auto h-5 w-5 text-volt" />
                  <p className="mt-2 text-sm font-medium">Numéro réservé aux membres</p>
                  <p className="mt-1 text-xs text-muted-foreground">Créez un compte gratuit pour voir le numéro WhatsApp.</p>
                  <Link to="/auth" className="mt-3 block">
                    <Button variant="volt" className="w-full h-11">Créer un compte gratuit</Button>
                  </Link>
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
                  <Link key={s.id} to="/product/$id" params={{ id: s.id }} className="group rounded-xl border border-border bg-card overflow-hidden hover:border-foreground/30 transition">
                    <div className="aspect-[4/3] bg-muted overflow-hidden">
                      {s.images[0] ? (
                        <img src={s.images[0]} alt={s.name} className="h-full w-full object-cover transition-transform group-hover:scale-105" loading="lazy" />
                      ) : (
                        <div className="grid h-full place-items-center text-muted-foreground"><Package className="h-8 w-8" /></div>
                      )}
                    </div>
                    <div className="p-3">
                      <h3 className="font-semibold leading-tight line-clamp-1 text-sm">{s.name}</h3>
                      <p className="mt-0.5 text-[11px] text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" />{s.city}</p>
                      <div className="mt-1 font-bold text-sm">{formatFCFA(sp ? s.promo_price_fcfa! : s.price_fcfa)}</div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}
      </div>
      <MobileFooter />
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

