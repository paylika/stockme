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
import { ALL_PLANS, SATISFACTION_GUARANTEE, VERIFICATION_BONUS_FCFA } from "@/lib/pricing";
import { formatFCFA } from "@/lib/format";
import { Check, Minus, Rocket, ShieldCheck, Sparkles, TrendingUp, X } from "lucide-react";

export const Route = createFileRoute("/tarifs")({
  head: () => {
    const { meta, links } = buildSeoHead({
      title: "Tarifs StockMe — Badge fournisseur vérifié 5 000 F/an et StockMe PRO",
      description:
        "Combien ça coûte de vendre en gros sur StockMe ? Publiez gratuitement, obtenez le badge Fournisseur vérifié (5 000 FCFA/an) ou passez à StockMe PRO pour dominer votre catégorie. Mise en avant dès 400 FCFA/jour.",
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

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* ---------- En-tête ---------- */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-4xl px-4 py-10 text-center sm:px-6 sm:py-14">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-volt/15 px-3 py-1 text-[11px] font-semibold text-volt">
            <Sparkles className="h-3 w-3" /> Tarif de lancement en cours
          </span>
          <h1 className="mt-4 font-display text-3xl font-bold tracking-tight sm:text-5xl">
            Publier est gratuit. Être vu se paie.
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">
            StockMe est gratuit pour publier vos produits. Vous ne payez que pour la <strong className="text-foreground">confiance</strong>{" "}
            (badge vérifié) et la <strong className="text-foreground">visibilité</strong> (mise en avant) — avec{" "}
            {formatFCFA(VERIFICATION_BONUS_FCFA)} de mise en avant offerts pour démarrer.
          </p>
        </div>
      </section>

      {/* ---------- Les 3 offres ---------- */}
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
          {ALL_PLANS.map((plan) => {
            const highlighted = plan.id === "pro" || plan.id === "verifie";
            return (
            <div
              key={plan.id}
              className={`relative flex flex-col rounded-3xl border p-5 sm:p-6 ${
                highlighted ? "border-volt bg-card shadow-lg shadow-volt/10" : "border-border bg-card"
              }`}
            >
              {plan.badge && (
                <span
                  className={`absolute -top-3 left-5 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${
                    plan.highlight ? "bg-volt text-volt-foreground" : "bg-foreground text-background"
                  }`}
                >
                  {plan.badge}
                </span>
              )}

              <h2 className="text-lg font-bold tracking-tight">{plan.name}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">{plan.tagline}</p>

              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-3xl font-bold tracking-tight">
                  {plan.price === 0 ? "0 F" : formatFCFA(plan.price)}
                </span>
                <span className="text-xs text-muted-foreground">{plan.period}</span>
              </div>
              {plan.regularPrice && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  au lieu de <span className="line-through">{formatFCFA(plan.regularPrice)}</span>
                </p>
              )}
              {plan.monthlyEquivalent && plan.id !== "pro" && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  soit {formatFCFA(plan.monthlyEquivalent)} / mois
                </p>
              )}

              <div className="mt-4 rounded-xl bg-muted/50 px-3 py-2 text-xs">
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
                  <li key={f} className="flex items-start gap-2 text-xs leading-snug text-muted-foreground sm:text-sm">
                    <Minus className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-5">
                {plan.id === "gratuit" ? (
                  <Link to={user ? "/dashboard/new" : "/auth"} className="block">
                    <Button variant="outline" className="h-12 w-full text-sm font-semibold">
                      {user ? "Publier un produit" : "Créer mon compte gratuit"}
                    </Button>
                  </Link>
                ) : (
                  <Button
                    variant={highlighted ? "volt" : "default"}
                    className="h-12 w-full text-sm font-bold"
                    onClick={() => openUpgrade(plan.id === "verifie" ? "verifie" : "pro")}
                    disabled={!user || payments.methods.length === 0}
                  >
                    {plan.id === "verifie" ? "Obtenir le badge" : "Activer PRO"}
                  </Button>
                )}
                {!user && (
                  <p className="mt-2 text-center text-[11px] text-muted-foreground">
                    <Link to="/auth" className="underline underline-offset-2">
                      Créez votre compte
                    </Link>{" "}
                    d'abord (gratuit, 30 secondes)
                  </p>
                )}
              </div>
            </div>
            );
          })}
        </div>

        {/* ---------- Logique de montée ---------- */}
        <div className="mt-5 rounded-2xl border border-border bg-muted/40 px-4 py-3.5 text-xs leading-relaxed text-muted-foreground">
          <strong className="text-foreground">Comment ça se combine :</strong> le badge est toujours acquis. Avec{" "}
          <strong className="text-foreground">Fournisseur vérifié</strong>, vous le sécurisez 12 mois. Avec{" "}
          <strong className="text-foreground">PRO</strong>, il est inclus tant que l'abonnement court — et le{" "}
          <strong className="text-foreground">pack badge 1 an + PRO</strong> (7 500 F le premier mois) vous garantit de
          garder votre badge toute l'année, même si vous arrêtez PRO ensuite.
        </div>

        {/* ---------- Garantie ---------- */}
        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-success/30 bg-success/5 px-4 py-3.5">
          <ShieldCheck className="h-6 w-6 shrink-0 text-success" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">Zéro risque</p>
            <p className="text-xs text-muted-foreground">{SATISFACTION_GUARANTEE}</p>
          </div>
        </div>
      </section>

      {/* ---------- Comparatif rapide ---------- */}
      <section className="mx-auto max-w-4xl px-4 pb-10 sm:px-6">
        <h2 className="text-lg font-bold tracking-tight sm:text-xl">Ce que change la vérification, concrètement</h2>
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
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl bg-muted/50 p-4">
              <p className="text-2xl font-bold">1</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Un seul contact supplémentaire par mois et le badge est déjà remboursé (vos lots sont à plusieurs
                milliers de francs).
              </p>
            </div>
            <div className="rounded-2xl bg-muted/50 p-4">
              <p className="text-2xl font-bold">2</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Le badge s'affiche sur <strong className="text-foreground">toutes</strong> vos annonces, y compris les
                anciennes : votre crédibilité augmente partout d'un coup.
              </p>
            </div>
            <div className="rounded-2xl bg-muted/50 p-4">
              <p className="text-2xl font-bold">3</p>
              <p className="mt-1 text-xs text-muted-foreground">
                La mise en avant coûte moins cher et vous suivez vos résultats (vues, clics, contacts) : vous savez
                exactement ce que vous achetez.
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            {user ? (
              <>
                <Button variant="volt" className="h-12 px-6 text-sm font-bold" onClick={() => openUpgrade("pro")}>
                  <Sparkles className="mr-1.5 h-4 w-4" /> Activer StockMe PRO
                </Button>
                <Button variant="outline" className="h-12 px-6 text-sm font-semibold" onClick={() => openUpgrade("verifie")}>
                  Le badge à 5 000 F/an
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
          StockMe — <a href={SITE_URL} className="underline underline-offset-2">{SITE_URL.replace(/^https?:\/\//, "")}</a>
        </p>
      </section>

      <UpgradeDialog
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        methods={payments.methods}
        isVerified={isVerified}
      />

      <MobileFooter />
      <MobileNav />
    </div>
  );
}
