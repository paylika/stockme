import { createFileRoute } from "@tanstack/react-router";
import { availableProviders, resolveProvider } from "@/lib/payments/registry.server";
import { serviceClient, userClient } from "@/lib/payments/supabase-server";
import { serverEnv } from "@/lib/server-env";
import type { PaymentMethod } from "@/lib/payments/types";
import { planById } from "@/lib/pricing";

/**
 * Point d'entrée unique du paiement (portefeuille, boost, abonnement).
 *
 * Le fournisseur (carte bancaire, Wave / Orange Money…) est choisi ici, pas
 * dans l'interface : ajouter un prestataire ne touche donc jamais le code du
 * vendeur.
 *
 * POST /api/pay/checkout
 *   { purpose: 'wallet_topup'|'boost'|'subscription', amount, method,
 *     provider?, customerNumber?, metadata? }
 *   Authorization: <jeton de session>
 */

/**
 * QUI PEUT PAYER PAR MOBILE MONEY ?
 *
 *   • l'ADMINISTRATEUR, toujours — c'est le mode test : il peut faire un vrai
 *     paiement pendant que le public ne voit rien ;
 *   • TOUT LE MONDE, seulement quand `XAALISPAY_ENABLED = "true"` (ouverture).
 *
 * La réponse vient de la base (table des rôles) et des variables du serveur,
 * jamais du navigateur : elle ne peut pas être falsifiée. En cas de doute
 * (réseau, jeton illisible), on répond NON — le pire qui puisse arriver est
 * qu'un administrateur doive réessayer, jamais qu'un inconnu encaisse par un
 * moyen qui n'a pas été testé.
 */
async function mobileMoneyAutorise(token: string): Promise<boolean> {
  try {
    if ((await serverEnv("XAALISPAY_ENABLED")) === "true") return true;
  } catch {
    /* on continue vers la vérification du rôle */
  }
  return estAdministrateur(token);
}

async function estAdministrateur(token: string): Promise<boolean> {
  if (!token) return false;

  /**
   * DEUX CHEMINS INDÉPENDANTS POUR VÉRIFIER LE RÔLE.
   *
   * Un seul chemin ne suffisait pas : la vérification passait uniquement par la
   * clé de service, et si celle-ci manquait ou échouait, l'administrateur était
   * traité comme un visiteur — il ne voyait donc plus Wave / Orange Money.
   *
   *   1. la session de l'utilisateur elle-même interroge la base (fonction
   *      `has_role`, prévue pour ça) — aucun secret supplémentaire requis ;
   *   2. en repli, la clé de service.
   *
   * Si l'un des deux confirme le rôle, c'est suffisant.
   */
  try {
    const scoped = userClient(token);
    const { data: userData } = await scoped.auth.getUser();
    const uid = userData?.user?.id;
    if (uid) {
      const { data: role } = await scoped.rpc("has_role", { _user_id: uid, _role: "admin" });
      if (role === true) return true;
    }
  } catch {
    /* on tente le second chemin */
  }

  try {
    const cle = await serverEnv("SUPABASE_SERVICE_ROLE_KEY");
    if (!cle) return false;
    const service = serviceClient(cle);
    const { data: userData } = await service.auth.getUser(token);
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

export const Route = createFileRoute("/api/pay/checkout")({
  server: {
    handlers: {
      /**
       * QUELS MOYENS DE PAIEMENT SONT DISPONIBLES ?
       *
       * MISE EN SERVICE PROGRESSIVE — le mobile money (Wave / Orange) est
       * d'abord réservé à l'ADMINISTRATION : c'est ainsi qu'on teste un vrai
       * paiement avant de l'ouvrir aux vendeurs. La vérification est faite ICI,
       * côté serveur : un visiteur ne peut pas la contourner en modifiant la
       * page, et il ne voit même pas l'option.
       *
       * Le jour de l'ouverture au public : mettre XAALISPAY_ENABLED = "true"
       * dans Cloudflare suffit (l'interrupteur du fournisseur).
       */
      GET: async ({ request }) => {
        const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
        const admin = await mobileMoneyAutorise(token);

        const providers = await availableProviders();
        const methods: PaymentMethod[] = [];
        for (const p of providers) {
          if (!p.configured) continue;
          for (const m of p.methods) {
            // Les moyens autres que la carte restent privés pendant les tests.
            if (m !== "card" && !admin) continue;
            if (!methods.includes(m)) methods.push(m);
          }
        }

        return Response.json({
          providers: providers.map((p) => ({
            name: p.name,
            label: p.label,
            methods: admin ? p.methods : p.methods.filter((m) => m === "card"),
            configured: p.configured,
          })),
          methods,
        });
      },

      POST: async ({ request }) => {
        try {
          const auth = request.headers.get("authorization") ?? "";
          const token = auth.replace(/^Bearer\s+/i, "").trim();
          if (!token) return Response.json({ error: "Session requise." }, { status: 401 });

          const body = (await request.json()) as {
            purpose?: string;
            amount?: number;
            method?: PaymentMethod;
            provider?: string;
            customerNumber?: string | null;
            metadata?: Record<string, unknown>;
          };

          const purpose = body.purpose ?? "";
          const amount = Number(body.amount ?? 0);
          // StockMe encaisse par carte : c'est le moyen par défaut.
          const method = (body.method ?? "card") as PaymentMethod;

          if (!["wallet_topup", "boost", "subscription"].includes(purpose)) {
            return Response.json({ error: "Objet de paiement invalide." }, { status: 400 });
          }
          if (!Number.isFinite(amount) || amount < 100) {
            return Response.json({ error: "Montant minimum : 100 FCFA." }, { status: 400 });
          }

          const provider = await resolveProvider(body.provider, method);

          /**
           * MÊME GARDE-FOU À L'ENCAISSEMENT : le mobile money est réservé à
           * l'administration pendant les tests. Sans ce contrôle, quelqu'un
           * pourrait appeler l'adresse directement en contournant la page.
           */
          if (method !== "card" && !(await mobileMoneyAutorise(token))) {
            return Response.json(
              {
                error:
                  "Le paiement Wave / Orange Money est en cours de test et réservé à l'administration. Choisissez la carte bancaire.",
              },
              { status: 403 },
            );
          }

          const supabase = userClient(token);
          const { data: userData, error: userError } = await supabase.auth.getUser();
          if (userError || !userData.user) {
            return Response.json({ error: "Session expirée, reconnectez-vous." }, { status: 401 });
          }

          // 1) Intention de paiement (tracée en base, avec sa propre référence)
          const { data: intent, error: intentError } = await supabase.rpc("payment_create_intent", {
            p_purpose: purpose,
            p_amount: Math.round(amount),
            p_provider: provider.name,
            p_method: method,
            p_metadata: body.metadata ?? {},
          });
          if (intentError) return Response.json({ error: intentError.message }, { status: 400 });

          const intentId = (intent as { intent_id?: string } | null)?.intent_id;
          if (!intentId) return Response.json({ error: "Intention de paiement non créée." }, { status: 500 });

          // 2) Session de paiement chez le fournisseur
          const origin = new URL(request.url).origin;
          // Carte : prélèvement mensuel automatique UNIQUEMENT pour l'offre PRO
          // mensuelle. Le badge (2 000 F/an) et le PRO à l'année (25 000 F/an)
          // sont des paiements uniques : on ne doit jamais les prélever chaque
          // mois. La décision vient de pricing.ts, jamais d'un test de montant.
          const metaPlan = typeof body.metadata?.plan === "string" ? planById(body.metadata.plan) : null;
          const recurring =
            purpose === "subscription" && method === "card" && metaPlan?.recurring === "month" ? "month" : null;
          const created = await provider.createPayment({
            amount: Math.round(amount),
            method,
            customerNumber: body.customerNumber ?? null,
            description: `StockMe — ${purpose === "wallet_topup" ? "rechargement du solde" : purpose === "boost" ? "mise en avant" : "abonnement vérifié"}`,
            intentId,
            successUrl: `${origin}/paiement/retour?intent=${intentId}&status=ok`,
            cancelUrl: `${origin}/paiement/retour?intent=${intentId}&status=cancel`,
            customerEmail: userData.user.email ?? null,
            recurring,
          });

          // 3) On garde la référence du fournisseur pour que le webhook retrouve la commande
          await supabase.rpc("payment_attach_checkout", {
            p_intent_id: intentId,
            p_provider_ref: created.providerRef,
            p_checkout_url: created.checkoutUrl,
          });

          return Response.json({
            intent_id: intentId,
            provider: provider.name,
            provider_label: provider.label,
            checkout_url: created.checkoutUrl,
            qr_code: created.qrCode ?? null,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Paiement impossible.";
          return Response.json({ error: message }, { status: 400 });
        }
      },
    },
  },
});
