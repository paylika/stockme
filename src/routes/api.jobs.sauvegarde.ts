import { createFileRoute } from "@tanstack/react-router";
import { serverEnv } from "@/lib/server-env";
import { serviceClient } from "@/lib/payments/supabase-server";

/**
 * SAUVEGARDE TÉLÉCHARGEABLE — le filet qui manque le plus.
 *
 * LE CONSTAT : l'offre gratuite de la base de données ne fournit AUCUNE
 * sauvegarde. Si un script se trompe, si une table est vidée par erreur, ou si
 * un compte est supprimé à tort, il n'existe aujourd'hui AUCUN moyen de
 * revenir en arrière. C'est le risque le plus grave qui pèse sur ton activité —
 * bien plus qu'un site lent.
 *
 * CE QUE FAIT CETTE TÂCHE : elle rassemble tes données essentielles dans un
 * seul fichier que tu télécharges et ranges où tu veux (téléphone, Drive, clé
 * USB). Un clic par semaine suffit à dormir tranquille.
 *
 * DÉCLENCHEMENT : depuis le bouton de la page /admin (session administrateur),
 * ou avec ?secret=VOTRE_JOB_SECRET pour un envoi automatique.
 *
 * CE QUI N'EST PAS INCLUS : les photos (elles vivent dans le stockage ; si tu
 * veux les sauvegarder aussi, dis-le et j'ajoute une archive). Aucun mot de
 * passe, aucun jeton de connexion n'est exporté : ce fichier ne peut pas servir
 * à pirater un compte.
 */
const TABLES: { table: string; limite?: number; filtreJours?: number }[] = [
  { table: "profiles" },
  { table: "products" },
  { table: "buying_requests" },
  { table: "favorites" },
  { table: "payment_intents" },
  { table: "wallet_transactions" },
  { table: "ads" },
  { table: "boost_campaigns" },
  { table: "user_roles" },
  { table: "product_events", filtreJours: 90 },
];

export const Route = createFileRoute("/api/jobs/sauvegarde")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const secret = await serverEnv("JOB_SECRET");
        const donne = url.searchParams.get("secret") ?? "";
        const cle = await serverEnv("SUPABASE_SERVICE_ROLE_KEY");
        if (!cle) return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY absente." }, { status: 500 });
        const service = serviceClient(cle);

        /* Même double accès que les autres tâches : secret planifié, ou session
           d'administrateur (bouton de la page admin, sans secret à retenir). */
        let autorise = !!secret && donne === secret;
        if (!autorise) {
          const jeton = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
          if (jeton) {
            const { data: userData } = await service.auth.getUser(jeton);
            const uid = userData?.user?.id;
            if (uid) {
              const { data: role } = await service
                .from("user_roles")
                .select("role")
                .eq("user_id", uid)
                .eq("role", "admin")
                .maybeSingle();
              if (role) autorise = true;
            }
          }
        }
        if (!autorise) {
          return Response.json({ error: "Accès refusé." }, { status: 401 });
        }

        const donnees: Record<string, unknown> = {};
        const resume: Record<string, number> = {};
        const erreurs: string[] = [];

        for (const { table, filtreJours } of TABLES) {
          try {
            const lignes: unknown[] = [];
            const taille = 1000;
            for (let page = 0; page < 60; page++) {
              let requete = service.from(table as never).select("*");
              if (filtreJours) {
                const depuis = new Date(Date.now() - filtreJours * 24 * 3600 * 1000).toISOString();
                requete = requete.gte("created_at", depuis);
              }
              const { data, error } = await requete.range(page * taille, page * taille + taille - 1);
              if (error) {
                erreurs.push(`${table} : ${error.message}`);
                break;
              }
              if (!data?.length) break;
              lignes.push(...data);
              if (data.length < taille) break;
            }
            donnees[table] = lignes;
            resume[table] = lignes.length;
          } catch (err) {
            erreurs.push(`${table} : ${err instanceof Error ? err.message : "erreur"}`);
          }
        }

        const maintenant = new Date();
        const fichier = {
          _lisez_moi:
            "Sauvegarde StockMe. Conservez ce fichier en lieu sûr. Pour restaurer, la base doit d'abord être remise en état, puis ces données sont réinjectées table par table.",
          _sauvegarde: {
            date: maintenant.toISOString(),
            version: 1,
            evenements_limites_a_jours: 90,
            lignes_par_table: resume,
            erreurs: erreurs.length ? erreurs : null,
          },
          donnees,
        };

        const nom = `stockme-sauvegarde-${maintenant.toISOString().slice(0, 10)}.json`;
        return new Response(JSON.stringify(fichier), {
          status: 200,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Content-Disposition": `attachment; filename="${nom}"`,
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
