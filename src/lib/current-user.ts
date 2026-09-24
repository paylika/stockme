import { supabase } from "@/integrations/supabase/stockme-client";

/**
 * Identifiant de l'utilisateur connecté, sans dépendre du réseau.
 * On lit d'abord la session locale (instantanée, fonctionne hors ligne) et
 * on n'appelle le serveur qu'en dernier recours : sur une connexion mobile
 * instable, un `getUser()` qui échoue ne doit pas bloquer une publication.
 */
export async function requireUserId(message = "Reconnectez-vous puis réessayez."): Promise<string> {
  try {
    const { data } = await supabase.auth.getSession();
    const id = data.session?.user?.id;
    if (id) return id;
  } catch {
    /* on tente le serveur ci-dessous */
  }

  try {
    const { data } = await supabase.auth.getUser();
    if (data.user?.id) return data.user.id;
  } catch {
    /* session réellement absente */
  }

  throw new Error(message);
}
