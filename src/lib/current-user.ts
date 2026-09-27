import { ensureSession, recoverSession } from "@/lib/auth-session";

/**
 * Identifiant de l'utilisateur connecté, sans dépendre du réseau.
 * On lit d'abord la session locale (instantanée, fonctionne hors ligne) et
 * on tente de la RÉCUPÉRER si le navigateur a perdu son jeton : sur une
 * connexion mobile instable, rien de tout cela ne doit bloquer une publication.
 */
export async function requireUserId(message = "Reconnectez-vous puis réessayez."): Promise<string> {
  const session = await ensureSession();
  const id = session?.user?.id;
  if (id) return id;

  // Deuxième chance explicite : le jeton conservé dans le navigateur.
  const recovered = await recoverSession();
  if (recovered?.user?.id) return recovered.user.id;

  throw new Error(message);
}
