import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { MobileNav } from "@/components/MobileNav";
import { MobileFooter } from "@/components/MobileFooter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatFCFA, whatsappLink } from "@/lib/format";
import {
  closeBuyingRequest,
  findSimilarProducts,
  getBuyingRequest,
  reportBuyingRequest,
  respondToRequest,
  sellerContactMessage,
  type RequestDetail,
  type RequestSuggestion,
} from "@/lib/buying-requests";
import { useAuth } from "@/hooks/useAuth";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { toast } from "sonner";
import {
  AlertTriangle,
  CalendarClock,
  Check,
  CheckCircle2,
  Flag,
  Loader2,
  MapPin,
  MessageCircle,
  Package,
  Send,
  Share2,
  Sparkles,
  Store,
  Tag,
  Wallet,
} from "lucide-react";

export const Route = createFileRoute("/demandes/$id")({
  component: RequestDetailPage,
});

function RequestDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState<RequestDetail | null>(null);
  const [similar, setSimilar] = useState<RequestSuggestion[]>([]);
  const [loading, setLoading] = useState(true);

  const [message, setMessage] = useState("");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getBuyingRequest(id));
    } catch {
      setData({ ok: false, request: null, responses: [], reason: "error" });
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const share = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (navigator.share) {
        await navigator.share({ title: data?.request?.title ?? "Demande StockMe", url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.success("Lien copié — partagez-le sur WhatsApp");
    } catch {
      /* partage annulé */
    }
  };

  const respond = async () => {
    if (!data?.request) return;
    setBusy(true);
    try {
      await respondToRequest(data.request.id, message.trim(), price ? Number(price) : null);
      setSent(true);
      toast.success("Réponse envoyée ! L'acheteur reçoit votre boutique et votre WhatsApp.", { duration: 7000 });
      await load();
    } catch (err) {
      const text = err instanceof Error ? err.message : "Réponse impossible.";
      toast.error(text, { duration: 8000 });
      if (text.includes("Publiez au moins un produit")) {
        setTimeout(() => navigate({ to: "/dashboard/new" }), 1200);
      }
    } finally {
      setBusy(false);
    }
  };

  const close = async () => {
    if (!data?.request) return;
    setBusy(true);
    try {
      await closeBuyingRequest(data.request.id);
      toast.success("Demande clôturée — elle n'apparaît plus dans la liste.");
      await load();
    } catch {
      toast.error("Impossible de clôturer pour le moment.");
    } finally {
      setBusy(false);
    }
  };

  const report = async () => {
    if (!data?.request) return;
    try {
      await reportBuyingRequest(data.request.id, "Signalée depuis la fiche");
      toast.success("Merci, l'administration va vérifier cette demande.");
    } catch {
      toast.error("Signalement impossible.");
    }
  };

  const r = data?.request;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
        <Link to="/demandes" className="text-xs text-muted-foreground underline underline-offset-2">
          ← Toutes les demandes
        </Link>

        {loading ? (
          <div className="mt-4 h-52 rounded-2xl shimmer bg-muted" />
        ) : !r ? (
          <div className="mt-6 grid place-items-center rounded-2xl border border-dashed border-border py-16 text-center">
            <Package className="h-10 w-10 text-muted-foreground" />
            <h1 className="mt-3 text-lg font-semibold">Cette demande n'existe plus</h1>
            <p className="mt-1 text-sm text-muted-foreground">Elle a peut-être été clôturée par l'acheteur.</p>
            <Link to="/demandes" className="mt-4">
              <Button variant="volt" className="h-11">
                Voir les demandes en cours
              </Button>
            </Link>
          </div>
        ) : (
          <>
            {/* ---------- La demande ---------- */}
            <div className="mt-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
              <div className="flex items-start gap-4">
                {r.image_url ? (
                  <img src={r.image_url} alt="" className="h-24 w-24 shrink-0 rounded-xl object-cover sm:h-28 sm:w-28" />
                ) : (
                  <span className="grid h-24 w-24 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground sm:h-28 sm:w-28">
                    <Sparkles className="h-6 w-6" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{r.title}</h1>
                    <div className="flex shrink-0 gap-1">
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={share} aria-label="Partager">
                        <Share2 className="h-4 w-4" />
                      </Button>
                      {user && !r.mine && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-muted-foreground"
                          onClick={report}
                          aria-label="Signaler"
                          title="Signaler cette demande"
                        >
                          <Flag className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>

                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Store className="h-3.5 w-3.5" /> {r.buyer_name}
                      {r.buyer_verified && <VerifiedBadge compact />}
                    </span>
                    {r.city && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" /> {r.city}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1">
                      <CalendarClock className="h-3.5 w-3.5" /> {r.jours_restants} j restants
                    </span>
                  </p>

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {r.quantity ? (
                      <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold">
                        {r.quantity.toLocaleString("fr-FR")} {r.unit}
                      </span>
                    ) : null}
                    <span className="inline-flex items-center gap-1 rounded-full bg-volt/15 px-2.5 py-1 text-[11px] font-bold">
                      <Wallet className="h-3 w-3" />
                      {r.budget_fcfa ? formatFCFA(r.budget_fcfa) : "Budget à négocier"}
                    </span>
                    {r.category && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
                        <Tag className="h-3 w-3" /> {r.category}
                      </span>
                    )}
                    {r.status !== "open" && (
                      <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
                        {r.status === "closed" ? "Clôturée" : "Masquée"}
                      </span>
                    )}
                  </div>

                  {r.description && (
                    <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                      {r.description}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* ---------- Ça existe déjà : la vente immédiate ---------- */}
            {similar.length > 0 && (
              <div className="mt-4 rounded-2xl border border-success/40 bg-success/5 p-4">
                <p className="flex items-center gap-2 text-sm font-bold text-success">
                  <CheckCircle2 className="h-4 w-4" /> Ce produit existe déjà sur StockMe
                </p>
                <ul className="mt-3 flex gap-3 overflow-x-auto no-scrollbar pb-1">
                  {similar.map((s) => (
                    <li key={s.id} className="w-32 shrink-0">
                      <Link to="/product/$id" params={{ id: s.id }} className="block">
                        {s.images?.[0] ? (
                          <img src={s.images[0]} alt="" className="h-24 w-32 rounded-xl object-cover" />
                        ) : (
                          <span className="grid h-24 w-32 place-items-center rounded-xl bg-muted">
                            <Package className="h-5 w-5 text-muted-foreground" />
                          </span>
                        )}
                        <span className="mt-1 block truncate text-[11px] font-semibold">{s.name}</span>
                        <span className="block text-[10px] text-muted-foreground">
                          dès {formatFCFA(s.promo_price_fcfa ?? s.price_fcfa)}
                          {s.moq > 1 ? ` · min. ${s.moq}` : ""}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* ---------- L'acheteur : les réponses reçues ---------- */}
            {r.mine ? (
              <div className="mt-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-bold tracking-tight">
                    Réponses reçues {r.responses_count > 0 ? `(${r.responses_count})` : ""}
                  </h2>
                  {r.status === "open" && (
                    <Button variant="outline" size="sm" className="h-9" disabled={busy} onClick={close}>
                      <Check className="mr-1 h-3.5 w-3.5" /> J'ai trouvé — clôturer
                    </Button>
                  )}
                </div>

                {data.responses.length === 0 ? (
                  <p className="mt-3 rounded-xl bg-muted/50 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
                    Aucune réponse pour l'instant. Les fournisseurs dont la catégorie correspond voient votre demande
                    dans leur menu. Si personne ne répond sous 48 h, écrivez-nous : nous relançons les fournisseurs
                    concernés.
                  </p>
                ) : (
                  <ul className="mt-3 space-y-3">
                    {data.responses.map((res) => {
                      const wa = res.seller_whatsapp || res.seller_phone || "";
                      return (
                        <li key={res.id} className="rounded-xl border border-border p-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="min-w-0 flex-1 truncate text-sm font-bold">{res.seller_name}</span>
                            {res.seller_verified && <VerifiedBadge compact />}
                            {res.price_fcfa ? (
                              <span className="shrink-0 rounded-full bg-volt/15 px-2.5 py-1 text-[11px] font-bold">
                                {formatFCFA(res.price_fcfa)} / {r.unit}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {res.seller_city ? `${res.seller_city} · ` : ""}
                            {res.seller_products} produit{res.seller_products > 1 ? "s" : ""} en ligne
                          </p>

                          {res.message && (
                            <p className="mt-2 whitespace-pre-line rounded-lg bg-muted/50 px-2.5 py-2 text-xs leading-relaxed">
                              {res.message}
                            </p>
                          )}

                          <div className="mt-3 flex flex-wrap gap-2">
                            {wa ? (
                              <a
                                href={whatsappLink(wa, sellerContactMessage(r, res.seller_name))}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <Button variant="volt" size="sm" className="h-9">
                                  <MessageCircle className="mr-1.5 h-3.5 w-3.5" /> Contacter sur WhatsApp
                                </Button>
                              </a>
                            ) : (
                              <span className="text-[11px] text-muted-foreground">
                                Ce fournisseur n'a pas laissé de numéro.
                              </span>
                            )}
                            <Link to="/vendeur/$id" params={{ id: res.seller_id }}>
                              <Button variant="outline" size="sm" className="h-9">
                                <Store className="mr-1.5 h-3.5 w-3.5" /> Voir sa boutique
                              </Button>
                            </Link>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ) : (
              /* ---------- Le fournisseur : « Je l'ai » ---------- */
              <div className="mt-4 rounded-2xl border border-volt/40 bg-volt/5 p-4 sm:p-5">
                <h2 className="flex items-center gap-2 text-sm font-bold">
                  <Send className="h-4 w-4 text-volt" /> Vous avez ce produit ?
                </h2>

                {!user ? (
                  <>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                      Connectez-vous pour répondre : l'acheteur reçoit alors votre boutique et votre numéro WhatsApp.
                    </p>
                    <Link
                      to="/auth"
                      search={{ redirect: `/demandes/${r.id}`, mode: "login" } as never}
                      className="mt-3 inline-block"
                    >
                      <Button variant="volt" className="h-11">
                        Se connecter pour répondre
                      </Button>
                    </Link>
                  </>
                ) : sent || r.already_responded ? (
                <p className="mt-3 flex items-start gap-2 rounded-xl border border-success/40 bg-success/5 px-3 py-2.5 text-xs leading-relaxed text-success">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      <strong>Réponse envoyée.</strong> L'acheteur a reçu le nom de votre boutique, vos produits et
                      votre numéro WhatsApp : il vous écrit directement s'il est intéressé.
                    </span>
                  </p>
                ) : r.status !== "open" ? (
                  <p className="mt-2 rounded-xl bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground">
                    Cette demande est {r.status === "closed" ? "clôturée" : "indisponible"} : elle n'accepte plus de
                    réponses.
                  </p>
                ) : (
                  <>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                      Un mot sur votre stock et votre prix : c'est ce que l'acheteur verra en premier.
                    </p>
                    <div className="mt-3 space-y-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="m">Votre message</Label>
                        <textarea
                          id="m"
                          rows={3}
                          value={message}
                          onChange={(e) => setMessage(e.target.value)}
                          maxLength={600}
                          placeholder="Ex : j'ai 60 pièces en stock à Dakar, disponibles aujourd'hui, paiement à la livraison."
                          className="form-input h-auto py-2.5"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="pr">Votre prix unitaire (FCFA)</Label>
                        <Input
                          id="pr"
                          type="number"
                          inputMode="numeric"
                          min={0}
                          value={price}
                          onChange={(e) => setPrice(e.target.value)}
                          placeholder="Ex : 4500"
                        />
                      </div>
                      <Button variant="volt" className="h-12 w-full text-sm font-bold" disabled={busy} onClick={respond}>
                        {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
                        {busy ? "Envoi…" : "J'ai ce produit — envoyer"}
                      </Button>
                      <p className="text-[11px] leading-relaxed text-muted-foreground">
                        L'acheteur reçoit : <strong className="text-foreground">le nom de votre boutique</strong>, vos
                        produits en ligne, <strong className="text-foreground">votre numéro WhatsApp</strong>
                        {price ? " et votre prix" : ""}. C'est lui qui vous écrit — vous n'avez rien à démarcher.
                      </p>
                      <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-volt" />
                        Réservé aux vendeurs ayant au moins un produit en ligne. Une seule réponse par demande.
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <MobileFooter />
      <MobileNav />
    </div>
  );
}
