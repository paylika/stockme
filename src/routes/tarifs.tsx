import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/stockme-client";
import { Header } from "@/components/Header";
import { MobileNav } from "@/components/MobileNav";
import { MobileFooter } from "@/components/MobileFooter";
import { Button } from "@/components/ui/button";
import { UpgradeDialog } from "@/components/UpgradeDialog";
import { useAuth } from "@/hooks/useAuth";
import { usePaymentsStatus } from "@/lib/features";
import { buildSeoHead, SITE_URL } from "@/lib/seo";
import { ALL_PLANS, PACK_TOTAL, SATISFACTION_GUARANTEE, VERIFICATION_BONUS_FCFA, planById } from "@/lib/pricing";
import { formatFCFA } from "@/lib/format";
import { BadgeCheck, Check, Minus, Rocket, ShieldCheck, Sparkles, TrendingUp, X } from "lucide-react";

export const Route = createFileRoute("/tarifs")({
  head: () => {
    const { meta, links } = buildSeoHead({
      title: "Tarifs StockMe — Badge fournisseur vérifié 5 000 F/an et StockMe PRO",
      description:
        "Publiez gratuitement sur StockMe. Le badge Fournisseur vérifié coûte 5 000 FCFA/an, StockMe PRO 2 500 FCFA/mois (25 000 FCFA l'année). Mise en avant dès 400 FCFA/jour.",
      path: "/tarifs",
      keywords:
        "tarif marketplace Afrique, prix badge vendeur, fournisseur vérifié, publicité stock en gros, boost annonce, StockMe PRO, vendre en gros Sénégal",
    });
    return { meta, links };
  },
  component: PricingPage,
});

function PricingPage() {
  const { user } = useAuth();
  const payments = usePaymentsStatus();
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [suggested, setSuggested] = useState<"verifie" | "pro">("pro");
  const [isVerified, setIsVerified] = useState(false);

  // On sait si le visiteur connecté est déjà vérifié : dans ce cas, on ne lui
  // proposera jamais d'acheter un badge qu'il possède déjà.
  useEffect(() => {
    let cancel = false;
    (async () => {
      const { data: s } = await supabase.auth.getSession();
      const uid = s.session?.user?.id;
      if (!uid) return;
      const { data } = await supabase
        .from("profiles")
        .select("verified,verified_until")
        .eq("id", uid)
        .maybeSingle();
      const p = data as { verified: boolean; verified_until: string | null } | null;
      if (!cancel) {
        setIsVerified(!!p?.verified && (!p.verified_until || new Date(p.verified_until) > new Date()));
      }
    })();
    return () => {
      cancel = true;
    };
  }, [user?.id]);

  const openUpgrade = (plan: "verifie" | "pro") => {
    if (!user) return;
    setSuggested(plan);
    setUpgradeOpen(true);
  };

  // ÉTAPE 1 = le badge (bloc à part). ÉTAPE 2 = les 3 formules dont PRO.
  const badge = planById("verifie")!;
  const formulas = ALL_PLANS.filter((p) => p.id !== "verifie");
  const paymentsReady = payments.methods.length > 0;

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* ---------- En-tête ---------- */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-4xl px-4 py-8 text-center sm:px-6 sm:py-12">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-volt/15 px-3 py-1 text-[11px] font-semibold text-volt">
            <Sparkles className="h-3 w-3" /> Tarif de lancement en cours
          </span>
          <h1 className="mt-4 font-display text-3xl font-bold tracking-tight sm:text-5xl">
            Publier est gratuit.
            <br className="hidden sm:block" /> Être vu, ça se paie.
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground sm:text-base">
            Deux choses seulement sont payantes : la <strong className="text-foreground">confiance</strong> (le badge) et
            la <strong className="text-foreground">visibilité</strong> (la mise en avant).
          </p>
        </div>
      </section>

      {/* ================= ÉTAPE 1 — LE BADGE (bloc à part) ================= */}
      <section className="mx-auto max-w-5xl px-4 pt-8 sm:px-6 sm:pt-12">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
          Étape 1 · La confiance
        </p>

        <div className="mt-3 overflow-hidden rounded-3xl border-2 border-volt bg-card shadow-lg shadow-volt/10">
          <div className="grid gap-5 p-5 sm:grid-cols-[1.15fr_1fr] sm:gap-8 sm:p-7">
            {/* Prix + argument */}
            <div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                <BadgeCheck className="h-6 w-6 shrink-0 text-primary" />
                <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Fournisseur vérifié</h2>
                <span className="shrink-0 whitespace-nowrap rounded-full bg-volt px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-volt-foreground">
                  Le badge
                </span>
              </div>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Le badge qui fait écrire les acheteurs. Il s'affiche sur toutes vos annonces.
              </p>

              <div className="mt-4 flex items-baseline gap-2">
                <span className="font-display text-4xl font-bold tracking-tight">{formatFCFA(badge.price)}</span>
                <span className="text-sm text-muted-foreground">/ an</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Paiement unique · valable 12 mois · soit {formatFCFA(badge.monthlyEquivalent ?? 417)} / mois
              </p>

              <div className="mt-4 rounded-xl bg-volt/10 px-3 py-2 text-xs">
                <span className="inline-flex items-center gap-1.5 font-semibold">
                  <Rocket className="h-3.5 w-3.5 text-volt" /> + {formatFCFA(VERIFICATION_BONUS_FCFA)} de mise en avant
                  offerts pour tester
                </span>
              </div>
            </div>

            {/* Inclus + action */}
            <div className="flex flex-col">
              <ul className="space-y-2">
                {badge.features.slice(0, 6).map((f) => (
                  <li key={f} className="flex items-start gap-2 text-xs leading-snug sm:text-sm">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-5 sm:mt-auto sm:pt-5">
                {user ? (
                  <Button
                    variant="volt"
                    className="h-12 w-full text-sm font-bold"
                    onClick={() => openUpgrade("verifie")}
                    disabled={isVerified || !paymentsReady}
                  >
                    {isVerified ? "Votre badge est déjà actif ✓" : "Obtenir le badge"}
                  </Button>
                ) : (
                  <Link to="/auth" className="block">
                    <Button variant="volt" className="h-12 w-full text-sm font-bold">
                      Créer mon compte puis obtenir le badge
                    </Button>
                  </Link>
                )}
                {!user && (
                  <p className="mt-2 text-center text-[11px] text-muted-foreground">
                    Le compte est gratuit et prend 30 secondes.
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="border-t border-volt/25 bg-volt/5 px-5 py-3 text-xs text-muted-foreground sm:px-7">
            <strong className="text-foreground">Envie d'aller plus loin tout de suite ?</strong> Le pack badge 1 an +
            PRO coûte {formatFCFA(PACK_TOTAL)} le premier mois, puis {formatFCFA(2500)}/mois. Votre badge reste acquis
            même si vous arrêtez PRO ensuite.
          </div>
        </div>
      </section>

      {/* ================= ÉTAPE 2 — LES 3 FORMULES ================= */}
      <section className="mx-auto max-w-6xl px-4 pt-10 sm:px-6 sm:pt-14">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
          Étape 2 · La visibilité
        </p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-xl font-bold tracking-tight sm:text-3xl">3 formules, une seule à choisir</h2>
          <p className="text-xs text-muted-foreground">PRO inclut déjà le badge.</p>
        </div>

        {/* Mobile : défilement horizontal avec aimantation. Desktop : 3 colonnes. */}
        <p className="mt-3 text-[11px] text-muted-foreground sm:hidden">Glissez pour comparer les 3 formules →</p>

        {/* pt-4 sur mobile : la zone de défilement rogne tout ce qui dépasse vers
            le haut. Sans cette marge, les badges « Tarif de lancement » et
            « 2 mois offerts » posés sur le bord des cartes étaient coupés. */}
        <div className="-mx-4 mt-1 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pt-4 pb-3 no-scrollbar sm:mx-0 sm:mt-3 sm:grid sm:grid-cols-3 sm:gap-4 sm:overflow-visible sm:px-0 sm:pt-0 sm:pb-0">
          {formulas.map((plan) => {
            const highlight = plan.id === "pro";
            const isFree = plan.id === "gratuit";
            return (
              <div
                key={plan.id}
                className={`relative flex w-[82%] shrink-0 snap-start flex-col rounded-3xl border p-5 sm:w-auto sm:shrink ${
                  highlight ? "border-volt bg-card shadow-lg shadow-volt/10" : "border-border bg-card"
                }`}
              >
                {plan.badge && (
                  <span
                    className={`absolute -top-3 left-5 whitespace-nowrap rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${
                      highlight ? "bg-volt text-volt-foreground" : "bg-foreground text-background"
                    }`}
                  >
                    {plan.badge}
                  </span>
                )}

                <h3 className="text-lg font-bold tracking-tight">{plan.name}</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">{plan.tagline}</p>

                <div className="mt-3 flex items-baseline gap-2">
                  <span className="font-display text-3xl font-bold tracking-tight">
                    {plan.price === 0 ? "0 F" : formatFCFA(plan.price)}
                  </span>
                  <span className="text-xs text-muted-foreground">{plan.period}</span>
                </div>
                {plan.regularPrice && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    au lieu de <span className="line-through">{formatFCFA(plan.regularPrice)}</span>
                  </p>
                )}
                {plan.monthlyEquivalent && plan.id !== "pro" && plan.price > 0 && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    soit {formatFCFA(plan.monthlyEquivalent)} / mois
                  </p>
                )}

                <div className="mt-3 rounded-xl bg-muted/50 px-3 py-2 text-xs">
                  <span className="inline-flex items-center gap-1.5 font-semibold">
                    <Rocket className="h-3.5 w-3.5 text-volt" /> Mise en avant : {formatFCFA(plan.boostPerDay)} / jour
                  </span>
                </div>

                <ul className="mt-4 flex-1 space-y-2">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs leading-snug sm:text-sm">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                      <span>{f}</span>
                    </li>
                  ))}
                  {plan.missing?.map((f) => (
                    <li
                      key={f}
                      className="flex items-start gap-2 text-xs leading-snug text-muted-foreground sm:text-sm"
                    >
                      <Minus className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-5">
                  {isFree ? (
                    <Link to={user ? "/dashboard/new" : "/auth"} className="block">
                      <Button variant="outline" className="h-12 w-full text-sm font-semibold">
                        {user ? "Publier un produit" : "Créer mon compte gratuit"}
                      </Button>
                    </Link>
                  ) : user ? (
                    <Button
                      variant={highlight ? "volt" : "default"}
                      className="h-12 w-full text-sm font-bold"
                      onClick={() => openUpgrade("pro")}
                      disabled={!paymentsReady}
                    >
                      {plan.id === "pro" ? "Activer PRO" : "PRO à l'année"}
                    </Button>
                  ) : (
                    <Link to="/auth" className="block">
                      <Button variant={highlight ? "volt" : "default"} className="h-12 w-full text-sm font-bold">
                        Créer mon compte
                      </Button>
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* ---------- Comment ça se combine (version courte) ---------- */}
        <div className="mt-5 rounded-2xl border border-border bg-muted/40 px-4 py-3.5 text-xs leading-relaxed text-muted-foreground">
          <strong className="text-foreground">En clair :</strong> le badge s'achète une fois ({formatFCFA(badge.price)}
          /an). Si vous prenez PRO, le badge est inclus tant que l'abonnement court — et le{" "}
          <strong className="text-foreground">pack {formatFCFA(PACK_TOTAL)}</strong> (badge + PRO le 1er mois) vous
          garantit de le garder toute l'année, même si vous arrêtez PRO.
        </div>

        {/* ---------- Garantie ---------- */}
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-success/30 bg-success/5 px-4 py-3.5">
          <ShieldCheck className="h-6 w-6 shrink-0 text-success" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">Zéro risque</p>
            <p className="text-xs text-muted-foreground">{SATISFACTION_GUARANTEE}</p>
          </div>
        </div>
      </section>

      {/* ---------- Comparatif rapide ---------- */}
      <section className="mx-auto max-w-4xl px-4 pb-10 pt-8 sm:px-6">
        <h2 className="text-lg font-bold tracking-tight sm:text-xl">Ce que ça change, concrètement</h2>
        <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Avantage</th>
                <th className="px-4 py-3 text-center">Gratuit</th>
                <th className="px-4 py-3 text-center">Vérifié / PRO</th>
              </tr>
            </thead>
            <tbody className="text-[13px]">
              {[
                ["Produits publiés", "10 max", "Illimité"],
                ["Photos par produit", "2", "10"],
                ["Badge « Fournisseur vérifié »", "—", "Sur toutes vos annonces"],
                ["Priorité dans la recherche", "—", "Oui"],
                ["Mise en avant (par jour)", "700 F", "500 F · 400 F en PRO"],
                ["Mise en avant offerte", "—", `${formatFCFA(VERIFICATION_BONUS_FCFA)} (72 h)`],
                ["Statistiques (vues, clics, contacts)", "De base", "Avancées"],
              ].map(([label, free, pro]) => (
                <tr key={label} className="border-t border-border">
                  <td className="px-4 py-3 font-medium">{label}</td>
                  <td className="px-4 py-3 text-center text-muted-foreground">
                    {free === "—" ? <X className="mx-auto h-4 w-4 text-muted-foreground/60" /> : free}
                  </td>
                  <td className="px-4 py-3 text-center font-semibold text-foreground">{pro}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------- Pourquoi payer : la logique économique ---------- */}
      <section className="mx-auto max-w-4xl px-4 pb-12 sm:px-6">
        <div className="rounded-3xl border border-border bg-card p-5 sm:p-7">
          <h2 className="inline-flex items-center gap-2 text-lg font-bold tracking-tight">
            <TrendingUp className="h-5 w-5 text-volt" /> Le calcul est simple
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3 sm:gap-4">
            <div className="rounded-2xl bg-muted/50 p-4">
              <p className="text-2xl font-bold">1</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Un seul contact en plus dans le mois et le badge est remboursé : vos lots se vendent par milliers de
                francs.
              </p>
            </div>
            <div className="rounded-2xl bg-muted/50 p-4">
              <p className="text-2xl font-bold">2</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Le badge s'affiche sur <strong className="text-foreground">toutes</strong> vos annonces, même les
                anciennes : votre crédibilité monte d'un coup.
              </p>
            </div>
            <div className="rounded-2xl bg-muted/50 p-4">
              <p className="text-2xl font-bold">3</p>
              <p className="mt-1 text-xs text-muted-foreground">
                La mise en avant coûte moins cher et vous voyez vos résultats (vues, clics, contacts) : vous savez ce
                que vous achetez.
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            {user ? (
              <>
                <Button variant="volt" className="h-12 px-6 text-sm font-bold" onClick={() => openUpgrade("pro")}>
                  <Sparkles className="mr-1.5 h-4 w-4" /> Activer StockMe PRO
                </Button>
                <Button
                  variant="outline"
                  className="h-12 px-6 text-sm font-semibold"
                  onClick={() => openUpgrade("verifie")}
                  disabled={isVerified}
                >
                  {isVerified ? "Badge déjà actif" : `Le badge à ${formatFCFA(badge.price)}/an`}
                </Button>
              </>
            ) : (
              <Link to="/auth">
                <Button variant="volt" className="h-12 px-6 text-sm font-bold">
                  Créer mon compte gratuit
                </Button>
              </Link>
            )}
            <a
              href={`https://wa.me/221786635331?text=${encodeURIComponent("Bonjour StockMe, j'ai une question sur les offres (badge vérifié / PRO).")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground underline underline-offset-2"
            >
              Une question ? Écrivez-nous
            </a>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          StockMe —{" "}
          <a href={SITE_URL} className="underline underline-offset-2">
            {SITE_URL.replace(/^https?:\/\//, "")}
          </a>
        </p>
      </section>

      <UpgradeDialog
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        methods={payments.methods}
        isVerified={isVerified}
        focus={suggested}
      />

      <MobileFooter />
      <MobileNav />
    </div>
  );
}
