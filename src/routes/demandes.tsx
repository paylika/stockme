import { createFileRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { MobileNav } from "@/components/MobileNav";
import { MobileFooter } from "@/components/MobileFooter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CATEGORIES } from "@/lib/constants";
import { formatFCFA } from "@/lib/format";
import { listBuyingRequests, type BuyingRequest } from "@/lib/buying-requests";
import { IMG, thumb } from "@/lib/img";
import { useAuth } from "@/hooks/useAuth";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { toast } from "sonner";
import {
  ArrowDown,
  BellRing,
  CalendarClock,
  Check,
  MapPin,
  MessageCircle,
  Package,
  Plus,
  Search,
  Send,
  ShoppingBasket,
  Store,
} from "lucide-react";

export const Route = createFileRoute("/demandes")({
  head: () => ({
    meta: [
      { title: "Ce que les acheteurs cherchent — demandes d'achat en gros | StockMe" },
      {
        name: "description",
        content:
          "Les produits que des acheteurs recherchent en gros en Afrique de l'Ouest, avec la quantité, le budget et la ville. Vous avez la marchandise ? Répondez : l'acheteur vous contacte sur WhatsApp. Vous cherchez un produit introuvable ? Publiez votre demande, c'est gratuit.",
      },
      {
        name: "keywords",
        content:
          "demande d'achat, je recherche un produit, grossiste, fournisseur, stock en gros, Afrique de l'Ouest, StockMe",
      },
    ],
  }),
  component: DemandesRoute,
});

function DemandesRoute() {
  const { pathname } = useLocation();
  // Route parent : les pages /demandes/nouvelle et /demandes/$id s'affichent ici.
  if (pathname !== "/demandes") return <Outlet />;
  return <DemandesPage />;
}

function DemandesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<BuyingRequest[] | null>(null);
  const [mine, setMine] = useState<BuyingRequest[]>([]);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");

  const load = useCallback(async () => {
    try {
      const [all, own] = await Promise.all([
        listBuyingRequests({ q: q || undefined, category: category || undefined, limit: 40 }),
        user ? listBuyingRequests({ mineOnly: true, limit: 10 }) : Promise.resolve([]),
      ]);
      setItems(all);
      setMine(own);
    } catch (err) {
      setItems([]);
      const message = err instanceof Error ? err.message : "";
      if (/function|does not exist|schema cache/i.test(message)) {
        toast.error("Cette page s'active dès que le script SQL des demandes est collé dans Supabase.");
      } else {
        toast.error("Chargement impossible. Réessayez dans un instant.");
      }
    }
  }, [q, category, user]);

  useEffect(() => {
    void load();
  }, [load]);

  const myOpen = mine.filter((r) => r.status === "open");
  const withAnswers = mine.filter((r) => r.status === "open" && r.responses_count > 0);
  const publishHref = user ? "/demandes/nouvelle" : "/auth";

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
        {/* ============ Deux rôles, expliqués en 2 cartes ============ */}
        <h1 className="text-2xl font-bold tracking-tight sm:text-4xl">Demandes d'achat</h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Un acheteur n'a pas trouvé un produit sur StockMe : il l'a écrit ici. Si vous l'avez, vous gagnez un client
          qui a déjà annoncé sa quantité et son budget.
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {/* Je cherche */}
          <div className="flex flex-col rounded-2xl border border-border bg-card p-4">
            <p className="flex items-center gap-2 text-sm font-bold">
              <ShoppingBasket className="h-4 w-4 text-volt" /> Je cherche un produit
            </p>
            <p className="mt-1 flex-1 text-xs leading-relaxed text-muted-foreground">
              Dites ce qu'il vous manque (avec une photo si vous voulez) : les fournisseurs qui l'ont vous envoient
              leur prix. <strong className="text-foreground">Gratuit, sans intermédiaire.</strong>
            </p>
            <Link
              to={publishHref}
              search={(user ? undefined : { redirect: "/demandes/nouvelle", mode: "signup" }) as never}
              className="mt-3"
            >
              <Button variant="volt" className="h-11 w-full text-sm font-bold">
                <Plus className="mr-1.5 h-4 w-4" /> Publier ma demande
              </Button>
            </Link>
          </div>

          {/* Je vends */}
          <div className="flex flex-col rounded-2xl border border-volt/40 bg-volt/5 p-4">
            <p className="flex items-center gap-2 text-sm font-bold">
              <Store className="h-4 w-4 text-volt" /> Je vends (ou je fabrique)
            </p>
            <p className="mt-1 flex-1 text-xs leading-relaxed text-muted-foreground">
              Regardez les demandes ci-dessous et appuyez sur <strong className="text-foreground">« J'ai ce
              produit »</strong> : l'acheteur reçoit votre boutique, vos produits et votre WhatsApp.{" "}
              <strong className="text-foreground">C'est lui qui vous écrit.</strong>
            </p>
            <a href="#demandes-en-cours" className="mt-3">
              <Button variant="outline" className="h-11 w-full text-sm font-bold">
                <ArrowDown className="mr-1.5 h-4 w-4" /> Voir les demandes
              </Button>
            </a>
          </div>
        </div>

        {/* ============ Comment ça marche (3 lignes, pas plus) ============ */}
        <ol className="mt-3 grid gap-2 sm:grid-cols-3">
          {[
            { n: "1", t: "L'acheteur écrit ce qu'il cherche", d: "Produit, quantité, budget, ville." },
            { n: "2", t: "Les fournisseurs répondent", d: "« J'ai ce produit » + leur prix." },
            { n: "3", t: "L'acheteur choisit et écrit", d: "Sur WhatsApp, directement. Sans commission." },
          ].map((s) => (
            <li key={s.n} className="flex items-start gap-2 rounded-xl bg-muted/50 px-3 py-2">
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-volt text-[10px] font-bold text-volt-foreground">
                {s.n}
              </span>
              <span className="min-w-0">
                <span className="block text-[11px] font-bold leading-snug">{s.t}</span>
                <span className="block text-[11px] leading-snug text-muted-foreground">{s.d}</span>
              </span>
            </li>
          ))}
        </ol>

        {/* ============ Vos demandes : les réponses d'abord ============ */}
        {user && withAnswers.length > 0 && (
          <div className="mt-6 rounded-2xl border border-volt/50 bg-volt/10 p-4">
            <p className="flex items-center gap-2 text-sm font-bold">
              <BellRing className="h-4 w-4 text-volt" />
              {withAnswers.length === 1
                ? "Un fournisseur a répondu à votre demande"
                : `${withAnswers.length} de vos demandes ont reçu des réponses`}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Appuyez pour voir son prix, ses produits et lui écrire sur WhatsApp.
            </p>
            <ul className="mt-2 space-y-2">
              {withAnswers.map((r) => (
                <li key={r.id}>
                  <Link
                    to="/demandes/$id"
                    params={{ id: r.id }}
                    className="flex flex-wrap items-center gap-2 rounded-xl border border-volt/40 bg-background px-3 py-2 text-sm transition hover:border-volt"
                  >
                    <span className="min-w-0 flex-1 truncate font-semibold">{r.title}</span>
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-volt px-2.5 py-1 text-[11px] font-bold text-volt-foreground">
                      <MessageCircle className="h-3 w-3" /> {r.responses_count} réponse
                      {r.responses_count > 1 ? "s" : ""} — voir
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ============ La liste ============ */}
        <div id="demandes-en-cours" className="mt-8 scroll-mt-20">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-bold tracking-tight sm:text-xl">
              Les demandes en cours
              {items && items.length > 0 ? (
                <span className="ml-2 text-sm font-normal text-muted-foreground">({items.length})</span>
              ) : null}
            </h2>
            <span className="text-[11px] text-muted-foreground">
              Budget annoncé, quantité et ville : vous savez tout avant de répondre.
            </span>
          </div>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Un produit précis ? (ex : climatiseur)"
                className="h-11 pl-9"
              />
            </div>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="form-select h-11 sm:w-56"
            >
              <option value="">Toutes les catégories</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {items === null ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-36 rounded-2xl shimmer bg-muted" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="mt-4 grid place-items-center rounded-2xl border border-dashed border-border py-14 text-center">
              <Package className="h-10 w-10 text-muted-foreground" />
              <h3 className="mt-3 text-base font-semibold">
                {q || category ? "Aucune demande ne correspond à votre recherche" : "Aucune demande en cours"}
              </h3>
              <p className="mt-1 max-w-md px-4 text-xs leading-relaxed text-muted-foreground">
                {q || category
                  ? "Essayez un autre mot, ou une autre catégorie."
                  : "Un produit introuvable ? Demandez-le : les fournisseurs sont prévenus et vous répondent ici."}
              </p>
              <Button
                variant="volt"
                className="mt-4 h-11"
                onClick={() =>
                  navigate({
                    to: user ? "/demandes/nouvelle" : "/auth",
                    search: user ? undefined : ({ redirect: "/demandes/nouvelle", mode: "signup" } as never),
                  })
                }
              >
                <Plus className="mr-1.5 h-4 w-4" /> Publier ma demande
              </Button>
            </div>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {items.map((r) => (
                <RequestCard key={r.id} request={r} loggedIn={!!user} />
              ))}
            </div>
          )}
        </div>

        {/* ============ Mes demandes publiées ============ */}
        {user && mine.length > 0 && (
          <section className="mt-10">
            <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Mes demandes ({myOpen.length} en cours)
            </h2>
            <ul className="mt-3 space-y-2">
              {mine.map((r) => (
                <li key={r.id}>
                  <Link
                    to="/demandes/$id"
                    params={{ id: r.id }}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border bg-card px-3 py-2.5 text-sm transition hover:border-volt"
                  >
                    <span className="min-w-0 flex-1 truncate font-semibold">{r.title}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {r.status === "open"
                        ? `${r.responses_count} réponse${r.responses_count > 1 ? "s" : ""} · encore ${r.jours_restants} j`
                        : r.status === "closed"
                          ? "Clôturée"
                          : "Masquée par l'administration"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <MobileFooter />
      <MobileNav />
    </div>
  );
}

function RequestCard({ request, loggedIn }: { request: BuyingRequest; loggedIn: boolean }) {
  return (
    <div className="flex flex-col rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        {request.image_url ? (
          <img
            src={thumb(request.image_url, IMG.request)}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-16 w-16 shrink-0 rounded-xl object-cover"
          />
        ) : (
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
            <Search className="h-5 w-5" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <span className="inline-block rounded-full bg-foreground px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-background">
            Recherche
          </span>
          <Link
            to="/demandes/$id"
            params={{ id: request.id }}
            className="mt-1 block text-sm font-bold leading-snug hover:text-primary"
          >
            {request.title}
          </Link>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" /> {request.city ?? "Afrique de l'Ouest"}
            </span>
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="h-3 w-3" /> encore {request.jours_restants} j
            </span>
          </p>
        </div>
      </div>

      {/* Ce qu'il faut savoir AVANT de répondre, en clair */}
      <ul className="mt-3 space-y-1 text-xs">
        <li className="flex items-start gap-1.5">
          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
          <span>
            <strong className="text-foreground">Quantité :</strong>{" "}
            {request.quantity ? `${request.quantity.toLocaleString("fr-FR")} ${request.unit}` : "non précisée"}
          </span>
        </li>
        <li className="flex items-start gap-1.5">
          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
          <span>
            <strong className="text-foreground">Budget :</strong>{" "}
            {request.budget_fcfa ? (
              <span className="font-semibold text-volt">{formatFCFA(request.budget_fcfa)}</span>
            ) : (
              "non annoncé (à négocier)"
            )}
          </span>
        </li>
        {request.category && (
          <li className="flex items-start gap-1.5">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
            <span>
              <strong className="text-foreground">Catégorie :</strong> {request.category}
            </span>
          </li>
        )}
      </ul>

      {request.description && (
        <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">{request.description}</p>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="truncate">Demandé par {request.buyer_name}</span>
          {request.buyer_verified && <VerifiedBadge compact />}
          {request.responses_count > 0 && (
            <span className="shrink-0 rounded-full bg-success/15 px-2 py-0.5 font-semibold text-success">
              {request.responses_count} fournisseur{request.responses_count > 1 ? "s" : ""}
            </span>
          )}
        </span>

        {request.mine ? (
          <Link to="/demandes/$id" params={{ id: request.id }}>
            <Button variant="outline" size="sm" className="h-9">
              Voir ma demande
            </Button>
          </Link>
        ) : request.already_responded ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-success">
            <Check className="h-3.5 w-3.5" /> Vous avez répondu
          </span>
        ) : loggedIn ? (
          <Link to="/demandes/$id" params={{ id: request.id }}>
            <Button variant="volt" size="sm" className="h-9">
              <Send className="mr-1.5 h-3.5 w-3.5" /> J'ai ce produit
            </Button>
          </Link>
        ) : (
          <Link to="/auth" search={{ redirect: `/demandes/${request.id}`, mode: "login" } as never}>
            <Button variant="volt" size="sm" className="h-9">
              <Send className="mr-1.5 h-3.5 w-3.5" /> J'ai ce produit
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}
