// ⚠️ IMPORTANT : remplace par le vrai domaine de production (ex: https://stockme.sn)
export const SITE_URL = "https://stockme.app";

export const siteName = "StockMe";
export const siteEmail = "met.app.orderly@gmail.com";
export const sitePhone = "+221786635331";
export const defaultTitle =
  "StockMe — Marketplace B2B de stock en gros en Afrique de l'Ouest";
export const defaultDescription =
  "Écoulez votre stock dormant et trouvez des produits en gros près de chez vous. Marketplace B2B d'Afrique de l'Ouest, contact direct WhatsApp, sans intermédiaire.";
export const defaultImage =
  "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/3222f741-6e0f-4629-be4e-f7edebd9e5fb/id-preview-9fa2ac45--9b779be2-ba90-44e1-bd94-3f69841c7713.lovable.app-1778311385306.png";

type SeoOptions = {
  title?: string;
  description?: string;
  path?: string;
  image?: string;
  noindex?: boolean;
  type?: "website" | "product" | "article";
  locale?: "fr_FR" | "fr_SN" | "fr_CI";
  keywords?: string;
};

export function buildSeoHead(opts: SeoOptions = {}) {
  const canonical = SITE_URL + (opts.path || "/");
  const title = opts.title ?? defaultTitle;
  const description = opts.description ?? defaultDescription;
  const image = opts.image ?? defaultImage;
  const noindex = opts.noindex === true;

  const meta: Record<string, string>[] = [
    { title },
    { name: "description", content: description },
    { name: "robots", content: noindex ? "noindex, nofollow" : "index, follow" },
    { name: "author", content: siteName },
    { name: "theme-color", content: "#0f172a" },
    { name: "apple-mobile-web-app-title", content: siteName },
  ];

  if (opts.keywords) meta.push({ name: "keywords", content: opts.keywords });

  // Open Graph
  meta.push({ property: "og:site_name", content: siteName });
  meta.push({ property: "og:locale", content: opts.locale || "fr_FR" });
  meta.push({ property: "og:title", content: title });
  meta.push({ property: "og:description", content: description });
  meta.push({ property: "og:type", content: opts.type || "website" });
  meta.push({ property: "og:url", content: canonical });
  meta.push({ property: "og:image", content: image });
  meta.push({ property: "og:image:width", content: "1200" });
  meta.push({ property: "og:image:height", content: "630" });

  // Twitter
  meta.push({ name: "twitter:card", content: "summary_large_image" });
  meta.push({ name: "twitter:title", content: title });
  meta.push({ name: "twitter:description", content: description });
  meta.push({ name: "twitter:image", content: image });

  // Géolocalisation cible (Afrique de l'Ouest)
  meta.push({ name: "geo.region", content: "SN" });
  meta.push({ name: "geo.placename", content: "Afrique de l'Ouest" });

  const links = [{ rel: "canonical", href: canonical }];

  return { meta, links };
}

// ---------- JSON-LD (données structurées) ----------

export const organizationLd = () => ({
  "@context": "https://schema.org",
  "@type": "Organization",
  name: siteName,
  url: SITE_URL,
  logo: `${SITE_URL}/favicon.ico`,
  email: siteEmail,
  telephone: sitePhone,
  contactPoint: {
    "@type": "ContactPoint",
    email: siteEmail,
    telephone: sitePhone,
    contactType: "customer service",
    availableLanguage: ["fr"],
  },
  areaServed: [
    { "@type": "Country", name: "Sénégal" },
    { "@type": "Country", name: "Côte d'Ivoire" },
    { "@type": "Country", name: "Mali" },
    { "@type": "Country", name: "Burkina Faso" },
    { "@type": "Country", name: "Guinée" },
    { "@type": "Country", name: "Niger" },
    { "@type": "Country", name: "Bénin" },
    { "@type": "Country", name: "Togo" },
    { "@type": "Country", name: "Ghana" },
    { "@type": "Country", name: "Nigeria" },
  ],
});

export const webSiteLd = () => ({
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: siteName,
  url: SITE_URL,
  potentialAction: {
    "@type": "SearchAction",
    target: `${SITE_URL}/?q={search_term_string}`,
    "query-input": "required name=search_term_string",
  },
});

export const productLd = (p: {
  id: string;
  name: string;
  description?: string | null;
  images: string[];
  category: string;
  price_fcfa: number;
  promo_price_fcfa?: number | null;
  quantity: number;
  moq: number;
  sold_out: boolean;
  city: string;
}) => {
  const price =
    p.promo_price_fcfa && p.promo_price_fcfa < p.price_fcfa ? p.promo_price_fcfa : p.price_fcfa;
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    image: p.images,
    description: p.description || undefined,
    category: p.category,
    brand: { "@type": "Brand", name: siteName },
    offers: {
      "@type": "Offer",
      price,
      priceCurrency: "XOF",
      availability: p.sold_out ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
      itemCondition: "https://schema.org/NewCondition",
      priceValidUntil: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10),
      url: `${SITE_URL}/product/${p.id}`,
      seller: { "@type": "Organization", name: siteName },
    },
  };
};

export const breadcrumbLd = (items: { name: string; path: string }[]) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: items.map((it, i) => ({
    "@type": "ListItem",
    position: i + 1,
    name: it.name,
    item: SITE_URL + it.path,
  })),
});
