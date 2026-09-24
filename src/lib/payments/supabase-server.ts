import { createClient } from "@supabase/supabase-js";
import { STOCKME_SUPABASE_URL, STOCKME_SUPABASE_ANON_KEY } from "@/integrations/supabase/stockme-client";

/**
 * Client Supabase lié à la session de l'utilisateur (ses droits s'appliquent).
 * Le jeton est transmis par le navigateur à la route serveur.
 */
export function userClient(accessToken: string) {
  return createClient(STOCKME_SUPABASE_URL, STOCKME_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Client avec la clé de service : il contourne les règles de sécurité.
 * Utilisé UNIQUEMENT dans les webhooks et les tâches planifiées, jamais
 * avec une donnée venant du navigateur.
 */
export function serviceClient(serviceKey: string) {
  return createClient(STOCKME_SUPABASE_URL, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export { STOCKME_SUPABASE_URL };
