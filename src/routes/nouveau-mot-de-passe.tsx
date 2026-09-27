import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/stockme-client";
import { Header } from "@/components/Header";
import { MobileNav } from "@/components/MobileNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import logoUrl from "@/assets/stockme-logo.jpg";

/**
 * NOUVEAU MOT DE PASSE — l'arrivée du lien « mot de passe oublié ».
 *
 * COMMENT ÇA MARCHE : le lien envoyé par email ramène ici avec une session de
 * récupération dans l'adresse (Supabase la détecte tout seul et déclenche
 * l'événement PASSWORD_RECOVERY). On n'accepte donc ce changement QUE si cette
 * session de récupération existe : sinon n'importe qui pourrait changer le mot
 * de passe d'un compte en ouvrant cette page.
 */
export const Route = createFileRoute("/nouveau-mot-de-passe")({
  component: NewPasswordPage,
});

function NewPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState<"wait" | "ok" | "expired">("wait");
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancel = false;

    // 1) Session de récupération déjà en place ?
    const check = async () => {
      const { data } = await supabase.auth.getSession();
      if (cancel) return;
      if (data.session) setReady("ok");
    };
    void check();

    // 2) Ou elle arrive juste après (le lien contient le jeton) :
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) setReady("ok");
    });

    // 3) Au bout de 4 s sans session : le lien est expiré ou déjà utilisé.
    const timer = window.setTimeout(() => {
      setReady((r) => (r === "wait" ? "expired" : r));
    }, 4000);

    return () => {
      cancel = true;
      clearTimeout(timer);
      sub.subscription.unsubscribe();
    };
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwd.length < 6) return toast.error("Le mot de passe doit contenir au moins 6 caractères.");
    if (pwd !== pwd2) return toast.error("Les deux mots de passe ne sont pas identiques.");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pwd });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Mot de passe modifié ! Vous êtes connecté.");
    navigate({ to: "/profile" });
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="mx-auto w-full max-w-md px-4 sm:px-6">
        <div className="py-10 md:py-16">
          <Link to="/" className="mb-8 flex items-center gap-2.5">
            <img src={logoUrl} alt="StockMe" className="h-10 w-10 rounded-xl object-contain" />
            <span className="text-lg font-display font-semibold tracking-tight">
              Stock<span className="font-bold">Me</span>
            </span>
          </Link>

          {ready === "wait" && (
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
              <Loader2 className="h-5 w-5 animate-spin text-volt" />
              <p className="text-sm text-muted-foreground">Vérification de votre lien…</p>
            </div>
          )}

          {ready === "expired" && (
            <div className="space-y-4">
              <h1 className="font-display text-2xl font-bold tracking-tight">Lien expiré</h1>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Ce lien de réinitialisation n'est plus valable (il dure 1 heure et ne sert qu'une fois). Demandez-en un
                nouveau : c'est immédiat.
              </p>
              <Link to="/auth" search={{ mode: "login" } as never} className="block">
                <Button variant="volt" className="h-12 w-full text-base font-semibold">
                  Demander un nouveau lien
                </Button>
              </Link>
            </div>
          )}

          {ready === "ok" && (
            <>
              <div className="mb-6">
                <h1 className="font-display text-2xl font-bold tracking-tight">Nouveau mot de passe</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Choisissez un mot de passe que vous retiendrez. Il remplace immédiatement l'ancien.
                </p>
              </div>

              <form onSubmit={save} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="np">Nouveau mot de passe</Label>
                  <div className="relative">
                    <Input
                      id="np"
                      type={show ? "text" : "password"}
                      className="h-11 pr-11"
                      required
                      autoFocus
                      value={pwd}
                      onChange={(e) => setPwd(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShow((v) => !v)}
                      aria-label={show ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                      className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="np2">Confirmez le mot de passe</Label>
                  <Input
                    id="np2"
                    type={show ? "text" : "password"}
                    className="h-11"
                    required
                    value={pwd2}
                    onChange={(e) => setPwd2(e.target.value)}
                  />
                </div>

                {/* Les 3 règles, cochées au fur et à mesure : plus simple qu'un message d'erreur. */}
                <ul className="space-y-1 text-xs text-muted-foreground">
                  <li className="flex items-center gap-1.5">
                    <Check className={`h-3.5 w-3.5 ${pwd.length >= 6 ? "text-success" : "opacity-30"}`} />
                    Au moins 6 caractères
                  </li>
                  <li className="flex items-center gap-1.5">
                    <Check className={`h-3.5 w-3.5 ${pwd && pwd === pwd2 ? "text-success" : "opacity-30"}`} />
                    Les deux mots de passe identiques
                  </li>
                </ul>

                <Button type="submit" variant="volt" className="h-12 w-full text-base font-semibold" disabled={busy}>
                  {busy ? "Enregistrement…" : "Enregistrer et me connecter"}
                </Button>

                <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
                  <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                  Votre ancien mot de passe ne fonctionnera plus. Si vous ne vous souvenez plus de votre email, écrivez à
                  StockMe sur WhatsApp.
                </p>
              </form>
            </>
          )}
        </div>
      </div>
      <MobileNav />
    </div>
  );
}
