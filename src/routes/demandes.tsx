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
import { useAuth } from "@/hooks/useAuth";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { toast } from "sonner";
import {
  CalendarClock,
  Check,
  MapPin,
  MessageCircle,
  Package,
  Plus,
  Search,
  Send,
  Sparkles,
  Wallet,
} from "lucide-react";

export const Route = createFileRoute("/demandes")({
  head: () => ({
    meta: [
      { title: "Demandes des acheteurs — trouvez des clients prêts à acheter | StockMe" },
      {
        name: "description",
        content:
          "Ce que les acheteurs recherchent en gros en Afrique de l'Ouest : quantité, budget et ville. Vous avez la marchandise ? Répondez et l'acheteur vous contacte. Publiez aussi votre propre recherche, gratuitement.",
      },
      {
        name: "keywords",
        content:
          "demande d'achat, je recherche, grossiste, fournisseur, stock en gros, Afrique de l'Ouest, StockMe",
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
      // La fonction SQL n'est pas encore collée : on n'affiche pas d'erreur rouge,
      // on explique simplement que la page arrive.
      setItems([]);
      const message = err instanceof Error ? err.message : "";
      if (/function|does not exist|schema cache/i.test(message)) {
        toast.error("La page « Demandes » sera active dès que le script SQL sera collé dans Supabase.");
      } else {
        toast.error("Chargement impossible. Réessayez dans un instant.");
      }
    }
  }, [q, category, user]);

  useEffect(() => {
    void load();
  }, [load]);

  const myOpen = mine.filter((r) => r.status === "open");
  const waiting = mine.filter((r) => r.status === "open" && r.responses_count > 0);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight sm:text-4xl">Demandes des acheteurs</h1>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Ce que les acheteurs cherchent et que StockMe n'a pas encore.{" "}
              <strong className="text-foreground">Vous avez la marchandise ?</strong> Répondez : l'acheteur reçoit vos
              coordonnées et vous contacte. Vous cherchez quelque chose d'introuvable ? Publiez votre demande, c'est
              gratuit.
            </p>
          </div>
          <Link
            to={user ? "/demandes/nouvelle" : "/auth"}
            search={(user ? undefined : { redirect: "/demandes/nouvelle", mode: "signup" }) as never}
            className="shrink-0"
          >
            <Button variant="volt" className="h-12 px-5 text-sm font-bold">
              <Plus className="mr-1.5 h-4 w-4" /> Publier ma demande
            </Button>
          </Link>
        </div>

        {/* ---------- Mes demandes : les réponses reçues d'abord ---------- */}
        {user && waiting.length > 0 && (
          <div className="mt-6 rounded-2xl border border-volt/50 bg-volt/10 p-4">
            <p className="flex items-center gap-2 text-sm font-bold">
              <Sparkles className="h-4 w-4 text-volt" />
              {waiting.length === 1
                ? "Un fournisseur a répondu à votre demande"
                : `${waiting.length} de vos demandes ont reçu des réponses`}
            </p>
            <ul className="mt-2 space-y-2">
              {waiting.map((r) => (
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

        {/* ---------- Filtres ---------- */}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Rechercher dans les demandes…"
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

        {/* ---------- Liste ---------- */}
        {items === null ? (
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-36 rounded-2xl shimmer bg-muted" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="mt-8 grid place-items-center rounded-2xl border border-dashed border-border py-16 text-center">
            <Package className="h-10 w-10 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-semibold">
              {q || category ? "Aucune demande ne correspond" : "Aucune demande pour l'instant"}
            </h3>
            <p className="mt-1 max-w-sm px-4 text-sm text-muted-foreground">
              {q || category
                ? "Essayez un autre mot ou une autre catégorie."
                : "Soyez le premier : décrivez le produit que vous cherchez, les fournisseurs sont prévenus."}
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
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {items.map((r) => (
              <RequestCard key={r.id} request={r} loggedIn={!!user} />
            ))}
          </div>
        )}

        {/* ---------- Mes demandes (publiées) ---------- */}
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
                        ? `${r.responses_count} réponse${r.responses_count > 1 ? "s" : ""} · ${r.jours_restants} j restants`
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

        {/* ---------- Comment ça marche ---------- */}
        <ul className="mt-10 grid gap-2 sm:grid-cols-3">
          {[
            { t: "1. L'acheteur décrit", d: "Produit, quantité, budget et ville. Son numéro reste privé." },
            { t: "2. Les fournisseurs répondent", d: "« Je l'ai » + votre prix : l'acheteur reçoit vos coordonnées." },
            { t: "3. L'acheteur choisit", d: "Il compare et vous écrit sur WhatsApp. Pas d'intermédiaire." },
          ].map((s) => (
            <li key={s.t} className="rounded-2xl bg-muted/50 p-3.5">
              <p className="text-xs font-bold">{s.t}</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{s.d}</p>
            </li>
          ))}
        </ul>
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
          <img src={request.image_url} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
        ) : (
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
            <Search className="h-5 w-5" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <Link
            to="/demandes/$id"
            params={{ id: request.id }}
            className="block text-sm font-bold leading-snug hover:text-primary"
          >
            {request.title}
          </Link>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" /> {request.city ?? "Afrique de l'Ouest"}
            </span>
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="h-3 w-3" /> {request.jours_restants} j restants
            </span>
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-1.5">
            {request.quantity ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold">
                {request.quantity.toLocaleString("fr-FR")} {request.unit}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1 rounded-full bg-volt/15 px-2 py-0.5 text-[10px] font-bold text-foreground">
              <Wallet className="h-3 w-3" />
              {request.budget_fcfa ? formatFCFA(request.budget_fcfa) : "Budget à négocier"}
            </span>
            {request.category ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                {request.category}
              </span>
            ) : null}
          </p>
        </div>
      </div>

      {request.description && (
        <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{request.description}</p>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="truncate">{request.buyer_name}</span>
          {request.buyer_verified && <VerifiedBadge compact />}
          {request.responses_count > 0 && (
            <span className="shrink-0 rounded-full bg-success/15 px-2 py-0.5 font-semibold text-success">
              {request.responses_count} réponse{request.responses_count > 1 ? "s" : ""}
            </span>
          )}
        </span>

        {request.mine ? (
          <Link to="/demandes/$id" params={{ id: request.id }}>
            <Button variant="outline" size="sm" className="h-9">
              Ma demande
            </Button>
          </Link>
        ) : request.already_responded ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-success">
            <Check className="h-3.5 w-3.5" /> Vous avez répondu
          </span>
        ) : loggedIn ? (
          <Link to="/demandes/$id" params={{ id: request.id }}>
            <Button variant="volt" size="sm" className="h-9">
              <Send className="mr-1.5 h-3.5 w-3.5" /> Je l'ai
            </Button>
          </Link>
        ) : (
          <Link to="/auth" search={{ redirect: `/demandes/${request.id}`, mode: "login" } as never}>
            <Button variant="volt" size="sm" className="h-9">
              <Send className="mr-1.5 h-3.5 w-3.5" /> Je l'ai
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}
