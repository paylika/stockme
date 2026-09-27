import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/stockme-client";
import { ensureSession } from "@/lib/auth-session";
import { Header } from "@/components/Header";
import { MobileNav } from "@/components/MobileNav";
import { MobileFooter } from "@/components/MobileFooter";
import { ProductForm, ProductFormValues } from "@/components/ProductForm";
import { PhotoFailurePanel } from "@/components/PhotoFailurePanel";
import { Button } from "@/components/ui/button";
import { uploadImagesResilient, uploadProductImage, MAX_PHOTOS, FREE_MAX_PHOTOS, type UploadFailure } from "@/lib/image-upload";
import { requireUserId } from "@/lib/current-user";
import { trackPublishProduct } from "@/lib/meta-pixel";
import { FREE_PRODUCTS, EXTRA_PUBLICATION_PRICE, PRO_AVAILABLE, PRO_MONTHLY_BOOST_CREDIT } from "@/lib/pricing";
import { formatFCFA } from "@/lib/format";
import { useSellerMoney } from "@/components/SellerMoneyProvider";
import { Package, Rocket, Wallet } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard/new")({
  component: NewProduct,
});

/**
 * Message renvoyé par le garde-fou de la base (`products_guard_limits`) quand le
 * vendeur a épuisé ses publications offertes et que son solde est trop bas.
 * On le reconnaît pour afficher un VRAI bouton de rechargement au lieu d'une
 * simple erreur rouge. Exemple :
 *   « Vous avez atteint vos 20 produits publiés offerts. Chaque publication
 *     supplémentaire coûte 500 FCFA : rechargez votre solde (disponible : 0 FCFA). »
 */
const PUBLICATION_LIMIT_RE = /publi[ée]s offerts|publication suppl[ée]mentaire|rechargez votre solde/i;

type Pending = {
  productId: string;
  urls: string[];
  files: File[];
  failures: UploadFailure[];
};

function NewProduct() {
  const navigate = useNavigate();
  const money = useSellerMoney();
  const [uploadingStatus, setUploadingStatus] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [retrying, setRetrying] = useState(false);
  // 5 photos par produit pour tout le monde (gratuit compris).
  const [maxPhotos, setMaxPhotos] = useState(FREE_MAX_PHOTOS);
  /** Publications déjà en ligne, et solde : sert à prévenir du prix de 500 F. */
  const [quota, setQuota] = useState<{ published: number; balance: number } | null>(null);
  /** Numéro WhatsApp du compte : pré-rempli dans le formulaire. */
  const [accountWhatsapp, setAccountWhatsapp] = useState<string | null>(null);
  /** La base a refusé la publication faute de solde : on propose le rechargement. */
  const [limitRefusal, setLimitRefusal] = useState<string | null>(null);

  /* ============ ANTI-DOUBLON ============
     1. `submittingRef` : un seul envoi à la fois (les appuis répétés sont ignorés).
     2. `submissionToken` : un jeton unique pour CE formulaire, envoyé à la base
        qui a un index UNIQUE dessus. Même si la requête était rejouée par le
        réseau, une seule fiche peut exister. C'est la garantie définitive. */
  const submittingRef = useRef(false);
  const submissionToken = useRef(
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  ).current;

  useEffect(() => {
    (async () => {
      const s = await ensureSession();
      const uid = s?.user?.id;
      if (!uid) return;
      const [{ data: prof }, { count }, { data: wallet }] = await Promise.all([
        supabase.from("profiles").select("verified,verified_until,whatsapp").eq("id", uid).maybeSingle(),
        supabase.from("products").select("id", { count: "exact", head: true }).eq("owner_id", uid).eq("published", true),
        supabase.from("wallets").select("balance_fcfa").eq("user_id", uid).maybeSingle(),
      ]);
      const p = prof as { verified: boolean; verified_until: string | null; whatsapp: string | null } | null;
      const ok = !!p?.verified && (!p.verified_until || new Date(p.verified_until) > new Date());
      setMaxPhotos(ok ? MAX_PHOTOS : FREE_MAX_PHOTOS);
      setAccountWhatsapp(p?.whatsapp ?? null);
      setQuota({ published: count ?? 0, balance: (wallet as { balance_fcfa: number } | null)?.balance_fcfa ?? 0 });
    })();
  }, []);

  const submitOnce = async (values: ProductFormValues) => {
    const userId = await requireUserId("Reconnectez-vous pour publier le produit.");

    /**
     * NE JAMAIS FAIRE ATTENDRE LE VENDEUR PLUSIEURS MINUTES.
     *
     * Avant : on retentait TOUTES les photos en échec ici, avec 5 tentatives de
     * 25 s chacune — le bouton « Publier » tournait plusieurs minutes sans rien
     * afficher. C'était le deuxième bug de publication.
     *
     * Maintenant :
     *   • si AU MOINS UNE photo est déjà arrivée → on publie TOUT DE SUITE avec
     *     celles-là (la fiche est vendable), les autres seront renvoyées après ;
     *   • si AUCUNE photo n'est arrivée → UNE seule tentative rapide sur la
     *     première photo, puis on enregistre la fiche en brouillon.
     */
    let lateUrls: string[] = [];
    let failures: UploadFailure[] = [];
    if (values.newFiles.length > 0 && values.uploadedUrls.length === 0) {
      const res = await uploadImagesResilient(values.newFiles.slice(0, 1), userId, setUploadingStatus);
      lateUrls = res.urls;
      failures = res.failures;
    } else if (values.newFiles.length > 0) {
      // Des photos sont prêtes : on n'attend pas les autres pour publier.
      failures = values.newFiles.map((f) => ({ fileName: f.name, reason: "Envoi à reprendre après publication" }));
    }

    const urls = [...values.uploadedUrls, ...lateUrls];

    const payload = {
      owner_id: userId,
      name: values.name,
      description: values.description || null,
      category: values.category,
      city: values.city,
      zone: values.zone || null,
      price_fcfa: values.price_fcfa,
      promo_price_fcfa: values.promo_price_fcfa,
      quantity: values.quantity,
      moq: values.moq,
      whatsapp: values.whatsapp,
      images: urls,
      published: true,
      sold_out: false,
      dropshipping: values.dropshipping,
      sizes: values.sizes,
      colors: values.colors,
      weight_grams: values.weight_grams,
      price_tiers: values.price_tiers,
      /* Jeton anti-doublon : la base refuse deux fiches avec le même jeton. */
      submission_token: submissionToken,
    };

    // GARANTIE : même sans aucune photo, on n'abandonne JAMAIS le vendeur.
    // Sa fiche est enregistrée en BROUILLON (invisible du catalogue) : il ne
    // retape ni le nom, ni le prix, ni les paliers. Il renvoie les photos
    // ci-dessous, et la fiche part en ligne automatiquement dès qu'une photo
    // est arrivée. Sans cette sécurité, un réseau faible faisait tout perdre.
    if (urls.length === 0) {
      setUploadingStatus("Enregistrement de votre fiche...");
      const { data: draft, error: draftError } = await supabase
        .from("products")
        .insert({ ...payload, images: [], published: false })
        .select("id")
        .single();

      setUploadingStatus("");

      if (draftError || !draft?.id) {
        const why = failures[0]?.reason ? ` (${failures[0].reason})` : "";
        toast.error(
          `Aucune photo n'a pu être envoyée${why}, et l'enregistrement a échoué. Vos informations restent dans le formulaire : appuyez de nouveau sur Publier.`,
          { duration: 12000 },
        );
        return;
      }

      setPending({
        productId: draft.id as string,
        urls: [],
        files: values.newFiles,
        failures,
      });
      toast.warning(
        "Aucune photo n'a pu être envoyée : votre fiche est ENREGISTRÉE (pas encore en ligne). Renvoyez les photos ci-dessous — elle sera publiée automatiquement.",
        { duration: 15000 },
      );
      return;
    }

    // Certaines photos manquent mais au moins une est arrivée : on publie (la
    // fiche est vendable). Le panneau « renvoyer les photos » en bas de page
    // s'occupe du reste juste après.
    setUploadingStatus("Publication du produit...");

    let insertError: string | null = null;
    let productId: string | null = null;
    let priceTiersDropped = false;
    let tokenDropped = false;
    let alreadyThere = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const { data, error } = await supabase.from("products").insert(payload).select("id").single();
        if (error) throw new Error(error.message);
        productId = (data as { id: string } | null)?.id ?? null;
        insertError = null;
        break;
      } catch (err) {
        insertError = err instanceof Error ? err.message : "erreur réseau";

        /**
         * ANTI-DOUBLON (le bug des dizaines de publications identiques).
         *
         * Chaque formulaire porte un JETON unique, avec un index unique en base.
         * Si le vendeur appuie 10 fois (ou si le réseau rejoue la requête), le
         * premier insert passe et LES AUTRES SONT REFUSÉS par la base. Ici on
         * comprend ce refus et on va chercher la fiche déjà créée : le vendeur
         * voit « publié », jamais 10 copies.
         */
        if (/duplicate key|unique constraint|23505/i.test(insertError)) {
          const { data: existing } = await supabase
            .from("products")
            .select("id,published")
            .eq("submission_token", submissionToken)
            .maybeSingle();
          const found = existing as { id: string; published: boolean } | null;
          if (found?.id) {
            productId = found.id;
            insertError = null;
            // La fiche existait en brouillon (photos arrivées plus tard) :
            // on la met en ligne maintenant, au lieu d'en créer une deuxième.
            if (!found.published) {
              await supabase
                .from("products")
                .update({ ...payload, submission_token: submissionToken })
                .eq("id", found.id);
            } else {
              alreadyThere = true;
            }
            break;
          }
        }

        // La colonne `submission_token` n'existe pas encore (SQL non collé) :
        // on retire le jeton et on republie, sans bloquer le vendeur.
        if (!tokenDropped && /submission_token/i.test(insertError) && "submission_token" in payload) {
          delete (payload as { submission_token?: unknown }).submission_token;
          tokenDropped = true;
          attempt = 0;
          continue;
        }

        // La colonne `price_tiers` n'existe pas encore (SQL non collé) : on
        // retire les paliers et on republie immédiatement, sans bloquer le vendeur.
        if (!priceTiersDropped && /price_tiers/i.test(insertError) && "price_tiers" in payload) {
          delete (payload as { price_tiers?: unknown }).price_tiers;
          priceTiersDropped = true;
          attempt = 0;
          continue;
        }
        if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 1000));
      }
    }
    // Limite de publications atteinte et solde insuffisant : la base refuse.
    // Au lieu d'une erreur rouge sans issue, on affiche un VRAI bouton de
    // rechargement (500 F) et le formulaire reste rempli tel quel.
    if (insertError && PUBLICATION_LIMIT_RE.test(insertError)) {
      const found = /disponible\s*:\s*(\d+)/i.exec(insertError);
      const solde = found ? Number(found[1]) : 0;
      setLimitRefusal(insertError);
      setQuota((q) => ({ published: q?.published ?? FREE_PRODUCTS, balance: solde }));
      setUploadingStatus("");
      toast.error(`Solde insuffisant : il faut ${formatFCFA(EXTRA_PUBLICATION_PRICE)} pour publier ce produit.`, {
        duration: 12000,
      });
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (insertError) throw new Error(`Produit non publié : ${insertError}`);

    // Protecteur : si la colonne des paliers de prix n'existe pas encore en base
    // (script SQL non collé), on publie quand même le produit sans les paliers.
    if (priceTiersDropped) {
      toast.warning("Produit publié, mais les prix dégressifs n'ont pas pu être enregistrés.");
    }

    // Le numéro WhatsApp du profil suit celui du produit (best effort).
    if (values.whatsapp) {
      await supabase.from("profiles").update({ whatsapp: values.whatsapp }).eq("id", userId);
    }

    setUploadingStatus("");

    if (failures.length > 0 && productId) {
      const failedNames = new Set(failures.map((f) => f.fileName));
      setPending({
        productId,
        urls,
        files: values.newFiles.filter((f) => failedNames.has(f.name)),
        failures,
      });
      toast.warning("Produit publié ! Une photo au moins n'a pas pu être envoyée — renvoyez-la ci-dessous.");
      return;
    }

    if (failures.length > 0) {
      toast.warning("Produit publié, mais des photos n'ont pas pu être envoyées.");
    } else if (alreadyThere) {
      toast.info("Ce produit était déjà publié — pas de doublon créé.");
    } else {
      toast.success("Produit publié !");
    }
    /* Pixel Meta : le vendeur vient de publier — c'est le vrai passage à l'acte. */
    trackPublishProduct(values.name, Number(values.price_fcfa) || undefined);
    navigate({ to: "/dashboard" });
  };

  /**
   * VERROU ANTI-DOUBLON, niveau 1 : un seul envoi à la fois.
   * Sur un téléphone lent, le vendeur appuie plusieurs fois sur « Publier »
   * avant que le bouton ne se grise — sans ce verrou, chaque appui créait un
   * produit. (Niveau 2 : le jeton unique en base, dans `submitOnce`.)
   */
  const submit = async (values: ProductFormValues) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    try {
      await submitOnce(values);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Publication impossible.");
    } finally {
      submittingRef.current = false;
    }
  };

  const retryPhotos = async () => {
    if (!pending) return;
    setRetrying(true);
    try {
      const userId = await requireUserId("Reconnectez-vous pour renvoyer la photo.");

      const { urls, failures } = await uploadImagesResilient(pending.files, userId, setUploadingStatus);
      const allImages = [...pending.urls, ...urls];

      if (urls.length > 0) {
        /**
         * Dès qu'une photo arrive, on remet la fiche EN LIGNE si elle était en
         * brouillon : le vendeur n'a rien d'autre à faire. (Le garde-fou de la
         * base exige au moins une photo : c'est donc le bon moment.)
         */
        const wasDraft = pending.urls.length === 0;
        const { error } = await supabase
          .from("products")
          .update(wasDraft ? { images: allImages, published: true } : { images: allImages })
          .eq("id", pending.productId);
        if (error) throw new Error(error.message);

        if (wasDraft) {
          toast.success("Photos envoyées : votre produit est EN LIGNE !");
          /* Pixel Meta : la publication a bien eu lieu. */
          trackPublishProduct("Produit publié après reprise");
          setPending(null);
          navigate({ to: "/dashboard" });
          return;
        }
      }

      if (failures.length === 0) {
        toast.success("Photo(s) ajoutée(s) au produit !");
        navigate({ to: "/dashboard" });
        return;
      }

      const stillFailed = new Set(failures.map((f) => f.fileName));
      setPending({
        ...pending,
        urls: allImages,
        files: pending.files.filter((f) => stillFailed.has(f.name)),
        failures,
      });
      toast.error("L'envoi a encore échoué. Réessayez dans un instant.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur pendant l'envoi");
    } finally {
      setUploadingStatus("");
      setRetrying(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-6 sm:py-10">
        <h1 className="text-2xl sm:text-4xl font-bold tracking-tight">Ajouter un produit</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Photos, prix, localité et WhatsApp sont obligatoires.
        </p>

        {/* Prix de la publication au-delà du quota offert : le vendeur doit le
            savoir AVANT de remplir le formulaire, et avoir un bouton pour
            recharger les 500 F immédiatement (sans quitter la page). */}
        {quota && quota.published >= FREE_PRODUCTS && !pending && (
          <div
            className={`mt-4 rounded-2xl border p-4 ${
              quota.balance >= EXTRA_PUBLICATION_PRICE
                ? "border-volt/40 bg-volt/10"
                : "border-destructive/30 bg-destructive/5"
            }`}
          >
            <div className="flex items-start gap-3">
              <Package className="mt-0.5 h-5 w-5 shrink-0 text-volt" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">Vous avez atteint vos {FREE_PRODUCTS} produits offerts</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  Vous avez {quota.published} produits en ligne. Chaque publication supplémentaire coûte{" "}
                  <strong className="text-foreground">{formatFCFA(EXTRA_PUBLICATION_PRICE)}</strong>, prélevés
                  automatiquement sur votre solde : <strong className="text-foreground">{formatFCFA(quota.balance)}</strong>{" "}
                  disponible.
                </p>
                {quota.balance >= EXTRA_PUBLICATION_PRICE ? (
                  <p className="mt-1.5 text-xs font-semibold text-success">
                    Votre solde suffit : remplissez le formulaire puis appuyez sur Publier — les{" "}
                    {formatFCFA(EXTRA_PUBLICATION_PRICE)} seront prélevés à ce moment-là.
                  </p>
                ) : (
                  <p className="mt-1.5 text-xs font-semibold text-destructive">
                    Il vous manque {formatFCFA(EXTRA_PUBLICATION_PRICE - quota.balance)} : rechargez pour pouvoir
                    publier.
                  </p>
                )}
                {limitRefusal && (
                  <p className="mt-1.5 rounded-lg border border-destructive/30 bg-destructive/10 px-2.5 py-1.5 text-[11px] leading-relaxed text-destructive">
                    Votre dernière tentative a été refusée : {limitRefusal.replace(/^Produit non publié\s*:\s*/i, "")}
                  </p>
                )}
              </div>
            </div>

            {/* Le bouton utile : il ouvre la recharge de 500 F par-dessus la page
                (le formulaire n'est pas perdu, rien n'est rechargé). */}
            <div className="mt-3 flex flex-wrap gap-2">
              {money ? (
                <>
                  <Button variant="volt" className="h-10" onClick={() => money.openTopUp(EXTRA_PUBLICATION_PRICE)}>
                    <Wallet className="mr-1.5 h-4 w-4" /> Recharger {formatFCFA(EXTRA_PUBLICATION_PRICE)}
                  </Button>
                  {quota.balance < EXTRA_PUBLICATION_PRICE && (
                    <Button variant="outline" className="h-10" onClick={() => money.openTopUp()}>
                      Autre montant
                    </Button>
                  )}
                </>
              ) : (
                <Link to="/profile" search={{ tab: "wallet" }}>
                  <Button variant="volt" className="h-10">
                    <Wallet className="mr-1.5 h-4 w-4" /> Recharger mon solde
                  </Button>
                </Link>
              )}
            </div>

            {/* L'autre réponse au quota : l'offre qui SUPPRIME la limite. Plus
                rentable qu'acheter des publications une par une. */}
            {PRO_AVAILABLE && (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-volt/40 bg-volt/10 px-3 py-2">
                <Rocket className="h-4 w-4 shrink-0 text-volt" />
                <p className="min-w-0 flex-1 text-[11px] leading-snug">
                  <strong>Vendeur Pro — 2 900 F/mois :</strong> publications illimitées et{" "}
                  {formatFCFA(PRO_MONTHLY_BOOST_CREDIT)} de mise en avant versés sur votre solde chaque mois.
                </p>
                <Link to="/tarifs">
                  <Button variant="outline" className="h-9">
                    Voir l'offre
                  </Button>
                </Link>
              </div>
            )}
          </div>
        )}

        {pending ? (
          // Le produit est déjà publié : on masque le formulaire pour éviter
          // une seconde publication par erreur.
          <div className="mt-6 space-y-4">
            <PhotoFailurePanel
              failures={pending.failures}
              published
              retrying={retrying}
              status={uploadingStatus}
              onRetry={retryPhotos}
              productId={pending.productId}
            />
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => navigate({ to: "/dashboard" })}>
                Aller à mes produits
              </Button>
              <Button type="button" variant="ghost" onClick={() => setPending(null)}>
                Publier un autre article
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-6 sm:mt-8">
            <ProductForm
              onSubmit={submit}
              submitLabel="Publier"
              uploadingStatus={uploadingStatus}
              maxPhotos={maxPhotos}
              defaultWhatsapp={accountWhatsapp}
              onCancel={() => navigate({ to: "/dashboard" })}
              /* ENVOI IMMÉDIAT : chaque photo part dès qu'elle est choisie,
                 pendant que le vendeur remplit le reste de la fiche. */
              uploadFile={async (file) => {
                const userId = await requireUserId("Reconnectez-vous pour envoyer les photos.");
                return uploadProductImage(file, userId);
              }}
            />
          </div>
        )}
      </div>
      <MobileFooter />
      <MobileNav />
    </div>
  );
}
