import { supabase } from "@/integrations/supabase/stockme-client";

/**
 * DEMANDES D'ACHAT (« Je recherche ») — accès typé aux fonctions de la base.
 *
 * Principe : l'acheteur poste ce qu'il cherche (produit absent du site), les
 * fournisseurs qui l'ont postulent, et l'acheteur choisit qui il contacte.
 * Le numéro de l'acheteur n'est JAMAIS exposé : c'est ce qui le protège du
 * démarchage et ce qui donne de la valeur aux réponses.
 */

export type BuyingRequest = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  quantity: number | null;
  unit: string;
  budget_fcfa: number | null;
  city: string | null;
  country: string | null;
  image_url: string | null;
  ai_keywords: string[];
  status: "open" | "closed" | "hidden";
  responses_count: number;
  created_at: string;
  jours_restants: number;
  mine: boolean;
  buyer_name: string;
  buyer_verified: boolean;
  already_responded: boolean;
};

export type RequestResponse = {
  id: string;
  seller_id: string;
  message: string | null;
  price_fcfa: number | null;
  created_at: string;
  seller_name: string;
  seller_whatsapp: string | null;
  seller_phone: string | null;
  seller_city: string | null;
  seller_verified: boolean;
  seller_products: number;
  seller_top_products: { id: string; name: string; image: string | null }[];
};

export type RequestSuggestion = {
  id: string;
  name: string;
  price_fcfa: number;
  promo_price_fcfa: number | null;
  images: string[];
  city: string;
  moq: number;
  owner_id: string;
};

export type RequestDetail = {
  ok: boolean;
  reason?: string;
  request: (BuyingRequest & { expires_at?: string }) | null;
  responses: RequestResponse[];
  suggestions: RequestSuggestion[];
};

const asArray = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** Toutes les demandes ouvertes (ou seulement les miennes). */
export async function listBuyingRequests(opts: {
  category?: string;
  city?: string;
  q?: string;
  limit?: number;
  mineOnly?: boolean;
} = {}): Promise<BuyingRequest[]> {
  const { data, error } = await supabase.rpc("get_buying_requests", {
    p_category: opts.category ?? null,
    p_city: opts.city ?? null,
    p_q: opts.q ?? null,
    p_limit: opts.limit ?? 30,
    p_offset: 0,
    p_mine_only: opts.mineOnly ?? false,
  });
  if (error) throw new Error(error.message);
  return asArray<BuyingRequest>(data);
}

export async function getBuyingRequest(id: string): Promise<RequestDetail> {
  const { data, error } = await supabase.rpc("get_buying_request_detail", { p_id: id });
  if (error) throw new Error(error.message);
  const d = (data ?? {}) as Partial<RequestDetail>;
  return {
    ok: !!d.ok,
    reason: d.reason,
    request: d.request ?? null,
    responses: asArray<RequestResponse>(d.responses),
    suggestions: asArray<RequestSuggestion>(d.suggestions),
  };
}

export type CreateRequestInput = {
  title: string;
  description?: string;
  category?: string;
  quantity?: number | null;
  unit?: string;
  budget_fcfa?: number | null;
  city?: string;
  country?: string;
  image_url?: string | null;
  ai_keywords?: string[];
};

/** Messages d'erreur lisibles pour chaque refus de la base. */
export const CREATE_REQUEST_ERRORS: Record<string, string> = {
  title_too_short: "Décrivez votre recherche en quelques mots (8 caractères minimum).",
  too_many: "Vous avez déjà 3 demandes en cours. Fermez-en une pour en publier une nouvelle.",
  one_per_day: "Une demande par jour : revenez demain pour en publier une autre.",
};

export async function createBuyingRequest(input: CreateRequestInput): Promise<{ id: string; masked: boolean }> {
  const { data, error } = await supabase.rpc("create_buying_request", {
    p_title: input.title,
    p_description: input.description ?? null,
    p_category: input.category ?? null,
    p_quantity: input.quantity ?? null,
    p_unit: input.unit ?? "pièces",
    p_budget_fcfa: input.budget_fcfa ?? null,
    p_city: input.city ?? null,
    p_country: input.country ?? null,
    p_image_url: input.image_url ?? null,
    p_ai_keywords: input.ai_keywords ?? [],
  });
  if (error) throw new Error(error.message);

  const res = (data ?? {}) as { ok?: boolean; reason?: string; id?: string; masked?: boolean };
  if (res.ok === false) {
    throw new Error(CREATE_REQUEST_ERRORS[res.reason ?? ""] ?? "Publication impossible pour le moment.");
  }
  return { id: res.id ?? "", masked: !!res.masked };
}

export const RESPOND_ERRORS: Record<string, string> = {
  not_found: "Cette demande n'existe plus.",
  own_request: "C'est votre propre demande.",
  closed: "Cette demande est fermée ou expirée.",
  no_products: "Publiez au moins un produit : seuls les vendeurs peuvent répondre à une demande.",
  already: "Vous avez déjà répondu à cette demande.",
};

/** « Je l'ai » : le fournisseur postule (l'acheteur reçoit ses coordonnées). */
export async function respondToRequest(
  requestId: string,
  message: string,
  priceFcfa: number | null,
): Promise<{ count: number }> {
  const { data, error } = await supabase.rpc("respond_to_buying_request", {
    p_request_id: requestId,
    p_message: message || null,
    p_price_fcfa: priceFcfa && priceFcfa > 0 ? priceFcfa : null,
  });
  if (error) throw new Error(error.message);

  const res = (data ?? {}) as { ok?: boolean; reason?: string; count?: number };
  if (res.ok === false) throw new Error(RESPOND_ERRORS[res.reason ?? ""] ?? "Réponse impossible.");
  return { count: res.count ?? 1 };
}

export async function closeBuyingRequest(id: string): Promise<void> {
  const { error } = await supabase.rpc("close_buying_request", { p_id: id });
  if (error) throw new Error(error.message);
}

export async function reportBuyingRequest(id: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc("report_buying_request", { p_id: id, p_reason: reason });
  if (error) throw new Error(error.message);
}

/** Compteur du menu : demandes qui correspondent à mes catégories / ma ville. */
export async function countMatchingRequests(): Promise<number> {
  const { data, error } = await supabase.rpc("count_matching_requests");
  if (error) return 0;
  return typeof data === "number" ? data : 0;
}

export type AdminRequest = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  quantity: number | null;
  unit: string;
  budget_fcfa: number | null;
  city: string | null;
  status: string;
  responses_count: number;
  created_at: string;
  demandeur: string;
  demandeur_whatsapp: string | null;
  demandeur_phone: string | null;
  signalements: number;
};

export async function adminBuyingRequests(): Promise<AdminRequest[]> {
  const { data, error } = await supabase.rpc("admin_buying_requests");
  if (error) throw new Error(error.message);
  return asArray<AdminRequest>(data);
}

export async function adminSetRequestStatus(id: string, status: "open" | "closed" | "hidden"): Promise<void> {
  const { error } = await supabase.rpc("admin_set_buying_request_status", { p_id: id, p_status: status });
  if (error) throw new Error(error.message);
}

/** Message WhatsApp pré-rempli pour que l'acheteur contacte un fournisseur. */
export function sellerContactMessage(request: { id: string; title: string }, sellerName?: string) {
  const url = `https://stockme.store/demandes/${request.id}`;
  return (
    `Bonjour${sellerName ? ` ${sellerName}` : ""}, je vous contacte via StockMe : ` +
    `vous avez répondu à ma demande « ${request.title} ».\n${url}`
  );
}
