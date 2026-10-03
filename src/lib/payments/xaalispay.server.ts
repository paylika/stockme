import { serverEnv } from "@/lib/server-env";
import {
  hmacSha256Hex,
  safeEqual,
  type CreatePaymentInput,
  type CreatePaymentResult,
  type PaymentProvider,
  type WebhookVerification,
} from "@/lib/payments/types";

/**
 * XAALISPAY CONNECT — paiement séquestre (escrow) et mobile money.
 *
 * Doc : https://www.xaalispay.com/connect/docs (vérifiée le 27/09/2026).
 *
 * POURQUOI CE FOURNISSEUR EXISTE : il encaisse par **Wave / Orange Money /
 * Maxit** — les moyens que la majorité de tes vendeurs utilisent réellement —
 * et il peut séquestrer l'argent jusqu'à la livraison (protection acheteur et
 * vendeur). C'est la brique qui manquait pour que tes vendeurs PUISSENT payer.
 *
 * VARIABLES À METTRE DANS CLOUDFLARE (Workers → stockme → Settings → Variables) :
 *   • XAALISPAY_API_KEY       = la clé `sk_live_…` fournie par XaalisPay ;
 *   • XAALISPAY_WEBHOOK_SECRET = le secret `whsec_…` renvoyé quand tu enregistres
 *     l'adresse de webhook (voir /api/pay/webhook/xaalispay).
 * Sans ces deux variables, le fournisseur est simplement considéré comme non
 * configuré : rien ne casse, et le site n'affiche pas ce moyen de paiement.
 */

async function requete<T>(chemin: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const cle = await serverEnv("XAALISPAY_API_KEY");
  if (!cle) throw new Error("XaalisPay non configuré (XAALISPAY_API_KEY manquante).");

  /**
   * ADRESSE DE L'API — À VÉRIFIER AUPRÈS DE XAALISPAY.
   *
   * Le 28/09, l'adresse indiquée dans LEUR documentation (`api.xaalispay.com`)
   * ne se résout pas en DNS : elle n'existe pas publiquement, seul leur site
   * répond. L'adresse est donc configurable sans redéploiement : dès qu'ils
   * donnent la bonne, il suffit d'ajouter `XAALISPAY_API_URL` dans Cloudflare.
   */
  /**
   * ADRESSE DE L'API — ÉCRITE EN DUR, VOLONTAIREMENT.
   *
   * L'adresse figure dans leur documentation sous `api.xaalispay.com`, mais ce
   * nom de domaine n'existe pas : leur API tourne réellement sur Railway. La
   * variable Cloudflare `XAALISPAY_API_URL` n'arrivait pas jusqu'au Worker, ce
   * qui provoquait une erreur 530 (code 1016 « domaine introuvable ») à chaque
   * paiement.
   *
   * On ne dépend donc plus d'aucune configuration : l'adresse qui FONCTIONNE
   * (vérifiée : 200 en 1 seconde, compte marchand créé, transaction de test
   * réussie avec un vrai lien Wave) est écrite ici. La variable reste possible
   * comme surcharge, si XaalisPay change un jour d'hébergement.
   */
  const base = ((await serverEnv("XAALISPAY_API_URL")) ?? "https://xaalispay.up.railway.app").replace(/\/+$/, "");

  /**
   * REQUÊTE ROBUSTE VERS XAALISPAY.
   *
   * Incident constaté : un « HTTP 530 » (erreur Cloudflare) s'affichait côté
   * utilisateur, alors que leur API répondait parfaitement (200 en 1 s) depuis
   * un navigateur. Leur application est hébergée sur Railway, elle-même
   * protégée par Cloudflare : les requêtes envoyées par notre serveur partaient
   * SANS en-tête « User-Agent », ce que ce genre de protection rejette.
   *
   * Trois corrections :
   *   1. on s'identifie clairement (User-Agent + Accept) ;
   *   2. un délai maximum de 20 s, sinon on échoue proprement au lieu de
   *      laisser l'utilisateur attendre indéfiniment ;
   *   3. une seconde tentative automatique après 800 ms — un réveil de serveur
   *      ou un hoquet réseau ne doit pas faire échouer un paiement.
   */
  const appel = async (): Promise<Response> => {
    const ctrl = new AbortController();
    const minuteur = setTimeout(() => ctrl.abort(), 20_000);
    try {
      return await fetch(`${base}/api/v1/connect${chemin}`, {
        method: init.method ?? "POST",
        headers: {
          Authorization: `Bearer ${cle}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": "StockMe/1.0 (+https://stockme.store)",
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(minuteur);
    }
  };

  let res: Response;
  try {
    res = await appel();
    if (res.status >= 500) {
      // Hoquet côté XaalisPay (ou réveil de leur serveur) : on retente une fois.
      const corps = await res.text();
      await new Promise((r) => setTimeout(r, 800));
      res = await appel();
      if (res.status >= 500) {
        throw new Error(
          `XaalisPay a répondu ${res.status} sur l'adresse ${base} (${corps.slice(0, 60)}). ` +
            `Si le code est 1016, l'adresse est introuvable : vérifiez la variable XAALISPAY_API_URL.`,
        );
      }
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("XaalisPay a répondu")) throw err;
    throw new Error(
      `XaalisPay injoignable (${base}). Réessayez dans un instant ; si cela persiste, signalez-le à XaalisPay.`,
    );
  }

  const texte = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(texte) as unknown;
  } catch {
    /* réponse non JSON : on la garde en texte */
  }

  if (!res.ok) {
    // Trois formes d'erreur possibles selon la couche (doc § Erreurs).
    const corps = (json ?? {}) as Record<string, unknown>;
    const premier = Object.values(corps)[0];
    const message =
      (typeof corps.error === "string" && corps.error) ||
      (typeof corps.detail === "string" && corps.detail) ||
      (Array.isArray(premier) && typeof premier[0] === "string" && premier[0]) ||
      `XaalisPay : erreur HTTP ${res.status}`;
    throw new Error(message);
  }

  return json as T;
}

/** Solde du compte marchand StockMe chez XaalisPay. */
export type SoldeXaalisPay = {
  /** Argent en séquestre (en attente de livraison). */
  enSequestre: number;
  /** Argent disponible, retirable. */
  disponible: number;
  /** Argent bloqué (litige). */
  bloque: number;
  /** Déjà versé sur ton compte mobile money. */
  dejaVerse: number;
};

/**
 * Retrouve le compte marchand StockMe par sa référence, plutôt que par son
 * identifiant technique : si l'identifiant change un jour, rien ne casse.
 */
async function compteStockme(): Promise<string> {
  const comptes = await requete<{ id: string; external_ref: string | null }[]>("/accounts", { method: "GET" });
  const trouve = (Array.isArray(comptes) ? comptes : []).find((c) => c.external_ref === "stockme-platform");
  if (!trouve) throw new Error("Compte marchand StockMe introuvable chez XaalisPay.");
  return trouve.id;
}

/** Lit le solde (ce que tu as gagné et ce que tu peux retirer). */
export async function soldeXaalisPay(): Promise<SoldeXaalisPay> {
  const id = await compteStockme();
  const b = await requete<{
    escrow_balance?: number;
    available_balance?: number;
    blocked_balance?: number;
    paid_out_balance?: number;
  }>(`/accounts/${id}/balance`, { method: "GET" });
  return {
    enSequestre: b.escrow_balance ?? 0,
    disponible: b.available_balance ?? 0,
    bloque: b.blocked_balance ?? 0,
    dejaVerse: b.paid_out_balance ?? 0,
  };
}

/**
 * RETIRE L'ARGENT VERS TON COMPTE MOBILE MONEY.
 *
 * Sans montant : tout le disponible. XaalisPay prélève 3,5 % au retrait, et
 * seulement si le retrait réussit (un échec est intégralement recrédité).
 */
export async function retirerXaalisPay(montant?: number): Promise<{
  montant: number;
  net: number;
  frais: number;
  statut: string;
}> {
  const id = await compteStockme();
  const solde = await soldeXaalisPay();
  const aRetirer = montant && montant > 0 ? Math.min(Math.floor(montant), solde.disponible) : solde.disponible;
  if (aRetirer < 100) throw new Error("Le montant à retirer est trop faible (minimum 100 F).");

  const res = await requete<{
    amount?: number;
    net_amount?: number;
    xaalispay_fee?: number;
    status?: string;
  }>(`/accounts/${id}/payouts`, { body: { amount: aRetirer } });

  return {
    montant: res.amount ?? aRetirer,
    net: res.net_amount ?? aRetirer,
    frais: res.xaalispay_fee ?? 0,
    statut: res.status ?? "processing",
  };
}

type TransactionXaalis = {
  id?: string;
  status?: string;
  checkout_url?: string;
  amount?: number;
  currency?: string;
};

export const xaalispayProvider: PaymentProvider = {
  name: "xaalispay",
  label: "Wave / Orange Money / Maxit (paiement sécurisé)",
  // Opérateurs mobile money (interrogeables via GET /operators?country=SN).
  methods: ["wave", "orange_money"],

  async isConfigured() {
    const [cle, secret] = await Promise.all([
      serverEnv("XAALISPAY_API_KEY"),
      serverEnv("XAALISPAY_WEBHOOK_SECRET"),
    ]);
    /**
     * « CONFIGURÉ » = techniquement prêt, et rien d'autre.
     *
     * Il ne faut QUE ces deux valeurs : la clé API (pour créer les transactions)
     * et le secret de webhook (pour vérifier que l'argent est bien arrivé).
     *
     * ⚠️ CORRECTION D'UNE ERREUR DE CONCEPTION : `isConfigured()` exigeait aussi
     * l'interrupteur `XAALISPAY_ENABLED`. Résultat, avec l'interrupteur fermé
     * (le temps des tests), le fournisseur était considéré comme INEXISTANT —
     * donc invisible pour tout le monde, y compris pour l'administrateur qui
     * voulait justement tester. Deux sécurités qui se contredisaient.
     *
     * Désormais :
     *   • ce qui est « configuré » = les deux clés présentes ;
     *   • QUI peut s'en servir = décidé dans la route de paiement :
     *       – administrateur : toujours (c'est le mode test) ;
     *       – tout le monde : seulement quand XAALISPAY_ENABLED = "true".
     */
    return !!cle && !!secret;
  },

  /**
   * Création d'une transaction séquestre avec paiement immédiat.
   * On demande un lien de paiement (`checkout_url`) vers lequel rediriger
   * l'acheteur, exactement comme avec Stripe.
   */
  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const methode = input.method === "orange_money" ? "orange" : "wave";
    const reference = `stockme-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const transaction = await requete<TransactionXaalis>("/transactions", {
      body: {
        amount: Math.round(input.amount),
        // `beneficiary` reste obligatoire ; ici la plateforme s'auto-encaisse
        // (le compte connecté de StockMe est créé côté XaalisPay).
        /**
         * BÉNÉFICIAIRE — ÉCRIT EN DUR, POUR LA MÊME RAISON QUE L'ADRESSE.
         *
         * XaalisPay exige soit `beneficiary`, soit `splits` : sans l'un des deux,
         * il refuse la transaction (« Fournir beneficiary ou splits »). La
         * variable Cloudflare `XAALISPAY_BENEFICIARY_REF` n'arrivait pas jusqu'au
         * Worker (les secrets passent, les variables simples non), donc le champ
         * partait vide et le paiement échouait.
         *
         * `stockme-platform` est l'identifiant du compte marchand StockMe, créé
         * chez XaalisPay et vérifié : l'argent lui est destiné. Ce n'est pas un
         * secret, il peut donc figurer ici sans inconvénient.
         */
        beneficiary: (await serverEnv("XAALISPAY_BENEFICIARY_REF")) ?? "stockme-platform",
        // `on_funding` : les fonds passent directement en disponible — utile
        // pour un rechargement de portefeuille (pas de séquestre à gérer).
        release_policy: "on_funding",
        external_ref: reference,
        payment_method: methode,
        initiate_charge: true,
        /**
         * RETOUR SUR STOCKME APRÈS PAIEMENT.
         *
         * Sans ces deux adresses, l'acheteur qui vient de payer resterait sur la
         * page de XaalisPay sans jamais revenir voir le résultat sur StockMe —
         * il croirait que rien ne s'est passé. On le ramène donc sur notre page
         * de retour, qui confirme le paiement et met à jour le solde affiché.
         */
        ...(input.successUrl ? { success_url: input.successUrl } : {}),
        ...(input.cancelUrl ? { error_url: input.cancelUrl } : {}),
        ...(input.customerNumber ? { payer: { phone: input.customerNumber.replace(/[^\d+]/g, "") } } : {}),
      },
    });

    const url = transaction.checkout_url ?? "";
    const ref = String(transaction.id ?? reference);
    if (!url) throw new Error("XaalisPay n'a pas renvoyé de lien de paiement.");

    return { providerRef: ref, checkoutUrl: url, qrCode: null, raw: transaction };
  },

  /**
   * Vérification de la notification — HMAC-SHA256, exactement comme le décrit
   * la documentation :
   *   en-tête  X-XaalisPay-Signature: t=<horodatage>,v1=<signature>
   *   message  « <horodatage>.<corps BRUT> »   (jamais du JSON re-sérialisé)
   * On refuse aussi toute notification vieille de plus de 5 minutes (rejeu).
   */
  async verifyWebhook(rawBody: string, headers: Headers): Promise<WebhookVerification> {
    const secret = await serverEnv("XAALISPAY_WEBHOOK_SECRET");
    if (!secret) return { ok: false, reason: "provider_not_configured" };

    const entete = headers.get("x-xaalispay-signature") ?? "";
    const morceaux: Record<string, string> = {};
    for (const partie of entete.split(",")) {
      const [cle, valeur] = partie.split("=");
      if (cle && valeur) morceaux[cle.trim()] = valeur.trim();
    }
    const horodatage = morceaux.t ?? "";
    const signature = morceaux.v1 ?? "";
    if (!horodatage || !signature) return { ok: false, reason: "invalid_signature" };

    const age = Math.abs(Date.now() / 1000 - Number(horodatage));
    if (!Number.isFinite(age) || age > 300) return { ok: false, reason: "invalid_signature" };

    const attendu = await hmacSha256Hex(secret, `${horodatage}.${rawBody}`);
    if (!safeEqual(attendu, signature)) return { ok: false, reason: "invalid_signature" };

    let enveloppe: { id?: string; type?: string; data?: Record<string, unknown> };
    try {
      enveloppe = JSON.parse(rawBody) as typeof enveloppe;
    } catch {
      return { ok: false, reason: "invalid_json" };
    }

    const type = String(enveloppe.type ?? "");
    const donnees = (enveloppe.data ?? {}) as Record<string, unknown>;
    const reference = String(donnees.transaction_id ?? donnees.payout_id ?? "");
    const montant = typeof donnees.amount === "number" ? donnees.amount : null;

    /**
     * Correspondance entre les événements XaalisPay et notre vocabulaire.
     * Seuls les événements qui signifient « l'argent est bien arrivé » sont
     * traités comme un paiement réussi — un `transaction.funded` seul ne
     * crédite rien (il peut encore être remboursé).
     */
    const statut: WebhookVerification["status"] =
      type === "transaction.released" || type === "payout.succeeded"
        ? "paid"
        : type === "transaction.refunded" || type === "payout.failed"
          ? "failed"
          : type === "transaction.disputed"
            ? "expired"
            : "ignored";

    return { ok: true, providerRef: reference, status: statut, amount: montant, payload: enveloppe as never };
  },

  async fetchStatus(providerRef: string) {
    try {
      const t = await requete<TransactionXaalis>(`/transactions/${providerRef}`, { method: "GET" });
      const s = String(t.status ?? "").toLowerCase();
      if (s === "released" || s === "funded") return "paid";
      if (s === "refunded" || s === "failed") return "failed";
      if (s === "disputed") return "expired";
      return "pending";
    } catch {
      return "unknown";
    }
  },
};
