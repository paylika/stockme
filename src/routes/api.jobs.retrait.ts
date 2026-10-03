import { createFileRoute } from "@tanstack/react-router";
import { serverEnv } from "@/lib/server-env";
import { serviceClient } from "@/lib/payments/supabase-server";
import { retirerXaalisPay, soldeXaalisPay } from "@/lib/payments/xaalispay.server";

/**
 * RETRAIT DE L'ARGENT STOCKME — LE BOUTON DE LA PAGE ADMIN.
 *
 *   GET  /api/jobs/retrait   → le solde (séquestre, disponible, bloqué, déjà versé)
 *   POST /api/jobs/retrait   → retire le disponible vers ton compte mobile money
 *
 * POURQUOI : l'argent encaissé (rechargements, badges, abonnements) s'accumule
 * chez XaalisPay. Sans ce bouton, il fallait passer par leur portail pour le
 * récupérer. Ici, tout se fait depuis ta page d'administration.
 *
 * ACCÈS : réservé à l'administrateur (session) ou au secret de tâche planifiée.
 * Le montant retiré ne peut JAMAIS dépasser le solde disponible, et XaalisPay
 * ne prélève les 3,5 % de frais que si le retrait réussit.
 */
export const Route = createFileRoute("/api/jobs/retrait")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const autorise = await estAutorise(request);
        if (!autorise) return Response.json({ error: "Accès refusé." }, { status: 401 });
        try {
          const solde = await soldeXaalisPay();
          return Response.json({ ok: true, solde });
        } catch (err) {
          return Response.json({ ok: false, error: err instanceof Error ? err.message : "Erreur" }, { status: 400 });
        }
      },

      POST: async ({ request }) => {
        const autorise = await estAutorise(request);
        if (!autorise) return Response.json({ error: "Accès refusé." }, { status: 401 });
        try {
          const corps = (await request.json().catch(() => ({}))) as { montant?: number };
          const retrait = await retirerXaalisPay(
            typeof corps?.montant === "number" && corps.montant > 0 ? corps.montant : undefined,
          );
          const solde = await soldeXaalisPay();
          return Response.json({ ok: true, retrait, solde });
        } catch (err) {
          return Response.json(
            { ok: false, error: err instanceof Error ? err.message : "Retrait impossible." },
            { status: 400 },
          );
        }
      },
    },
  },
});

/** Administrateur (session) ou secret de tâche planifiée. */
async function estAutorise(request: Request): Promise<boolean> {
  const cle = await serverEnv("SUPABASE_SERVICE_ROLE_KEY");
  const jeton = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const url = new URL(request.url);
  const secret = await serverEnv("JOB_SECRET");
  if (secret && url.searchParams.get("secret") === secret) return true;
  if (!cle || !jeton) return false;
  try {
    const service = serviceClient(cle);
    const { data: userData } = await service.auth.getUser(jeton);
    const uid = userData?.user?.id;
    if (!uid) return false;
    const { data: role } = await service
      .from("user_roles")
      .select("role")
      .eq("user_id", uid)
      .eq("role", "admin")
      .maybeSingle();
    return !!role;
  } catch {
    return false;
  }
}
