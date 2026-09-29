import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/stockme-client";
import { ensureSession } from "@/lib/auth-session";
import { Loader2, Sparkles } from "lucide-react";

/**
 * BOUTON D'ENRICHISSEMENT IA DES ANNONCES.
 *
 * POURQUOI CE BOUTON EXISTE : la recherche par pertinence (phase 1) s'appuie
 * sur les mots-clés et attributs produits par l'IA. Or seulement 189 annonces
 * publiées sur 605 sont enrichies : sur les autres, la recherche ne dispose que
 * du titre et de la description. Enrichir les fiches restantes est donc le
 * levier le plus direct pour améliorer la recherche — et donc les contacts.
 *
 * L'IA remplit pour chaque annonce les mots-clés que les acheteurs emploient
 * réellement (« vidange », « 10w40 », « lubrifiant »… pour une huile moteur) et
 * des attributs (genre, objet, usage, couleurs, matières, synonymes).
 *
 * FONCTIONNEMENT : le bouton prend les annonces qui n'ont pas encore été
 * analysées, les envoie par paquets de 12 (la limite de la tâche), et affiche
 * l'avancement. On peut fermer la page : ce qui est fait le reste, et un
 * nouveau clic reprend la suite.
 *
 * LIMITE : 300 fiches par jour (garde-fou sur la facture de l'IA). Le bouton
 * s'arrête de lui-même et vous le dit.
 */
const PAQUET = 12;
const PAQUETS_MAX = 30;

export function AdminEnrichissement() {
  const [encours, setEncours] = useState(false);
  const [faites, setFaites] = useState(0);
  const [restantes, setRestantes] = useState<number | null>(null);
  const [message, setMessage] = useState("");

  const compter = async () => {
    const { count } = await supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("published", true)
      .is("ai_enriched_at", null);
    return count ?? 0;
  };

  const lancer = async () => {
    setEncours(true);
    setMessage("Analyse des annonces restantes…");
    let total = faites;

    try {
      const session = await ensureSession();
      if (!session?.access_token) {
        setMessage("Session expirée : reconnectez-vous.");
        return;
      }

      const restantesDepart = await compter();
      setRestantes(restantesDepart);
      if (restantesDepart === 0) {
        setMessage("Toutes vos annonces publiées sont déjà enrichies 🎉");
        return;
      }

      for (let paquet = 0; paquet < PAQUETS_MAX; paquet++) {
        // On redemande à chaque tour : une annonce enrichie sort de la liste.
        const { data: aFaire } = await supabase
          .from("products")
          .select("id")
          .eq("published", true)
          .is("ai_enriched_at", null)
          .limit(PAQUET);
        const ids = ((aFaire ?? []) as { id: string }[]).map((p) => p.id);
        if (!ids.length) break;

        const reponse = await fetch("/api/ai/enrich", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ product_ids: ids }),
        });

        if (reponse.status === 429) {
          setMessage(
            `${total} annonce(s) enrichie(s). Plafond quotidien atteint (300 fiches par jour, garde-fou sur la facture de l'IA) — recliquez demain pour finir.`,
          );
          setRestantes(await compter());
          return;
        }
        if (!reponse.ok) {
          const corps = (await reponse.json().catch(() => ({}))) as { error?: string };
          setMessage(`Arrêt : ${corps.error ?? `erreur ${reponse.status}`}`);
          setRestantes(await compter());
          return;
        }

        const corps = (await reponse.json()) as { results?: unknown[]; requested?: number };

        /**
         * DIAGNOSTIC VISIBLE.
         *
         * La tâche d'IA répond « succès » même quand elle n'a rien pu produire :
         * elle renvoie simplement une liste vide. Le bouton tournait donc sans
         * fin sans expliquer la cause — presque toujours la clé d'IA absente ou
         * le solde épuisé chez le fournisseur. On s'arrête au premier signe et
         * on dit clairement quoi vérifier.
         */
        const enrichiesPaquet = corps.results?.length ?? 0;
        if (ids.length > 0 && enrichiesPaquet === 0) {
          setMessage(
            `L'IA n'a rien pu produire pour ${ids.length} annonce(s). Deux causes possibles : la clé DEEPSEEK_API_KEY absente dans les variables Cloudflare, ou le solde du compte DeepSeek épuisé. Rien n'a été enregistré : relancez dès que c'est réglé.`,
          );
          setRestantes(await compter());
          return;
        }

        total += enrichiesPaquet;
        setFaites(total);
        const reste = await compter();
        setRestantes(reste);
        setMessage(`${total} annonce(s) enrichie(s) — ${reste} restante(s)…`);
        if (reste === 0) {
          setMessage(`${total} annonce(s) enrichie(s) — terminé 🎉 Votre recherche est maintenant plus précise.`);
          return;
        }
      }

      const reste = await compter();
      setRestantes(reste);
      setMessage(
        `${total} annonce(s) enrichie(s) — ${reste} restante(s). Cliquez à nouveau pour continuer (le travail déjà fait est conservé).`,
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Erreur pendant l'enrichissement.");
    } finally {
      setEncours(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-volt/15 text-volt">
          <Sparkles className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-base font-semibold">Enrichissement IA des annonces</h2>
          <p className="text-sm text-muted-foreground">
            L'IA lit chaque annonce et en tire les <strong className="font-semibold text-foreground">mots-clés que vos acheteurs emploient vraiment</strong>{" "}
            (ainsi que l'usage, la matière, les synonymes). C'est ce qui permet à la recherche de trouver un produit même si
            l'acheteur écrit « vidange » au lieu de « huile moteur ». Les annonces non analysées n'ont que leur titre.
          </p>
        </div>
        <Button variant="volt" onClick={lancer} disabled={encours}>
          {encours ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {encours ? "Analyse en cours…" : "Enrichir les annonces restantes"}
        </Button>
      </div>

      {(message || restantes !== null) && (
        <div className="mt-4 space-y-2">
          <p className="text-sm font-medium">{message}</p>
          {restantes !== null && restantes > 0 && faites > 0 && (
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-volt transition-all duration-500"
                style={{ width: `${Math.min(100, Math.round((faites / Math.max(1, faites + restantes)) * 100))}%` }}
              />
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            300 fiches maximum par jour (garde-fou sur la facture de l'IA). Vous pouvez fermer la page : le travail déjà
            fait est conservé.
          </p>
        </div>
      )}
    </div>
  );
}
