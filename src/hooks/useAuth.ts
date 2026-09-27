import { useSyncExternalStore } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { authSnapshot, serverAuthSnapshot, subscribeAuth } from "@/lib/auth-session";

/**
 * Utilisateur connecté, pour TOUT le site.
 *
 * Avant, chaque composant (une quinzaine : en-tête, barre latérale, fiche
 * produit, favoris, demandes…) ouvrait sa propre écoute et interrogeait la
 * session de son côté. Ils pouvaient donc se contredire : l'un affichait
 * « connecté » et l'autre « déconnecté », et le moindre hoquet réseau vidait
 * la page. Désormais il n'existe qu'UN état partagé, alimenté par
 * `lib/auth-session` qui sait récupérer une session perdue.
 */
export function useAuth(): { session: Session | null; user: User | null; loading: boolean } {
  const snap = useSyncExternalStore(subscribeAuth, authSnapshot, serverAuthSnapshot);
  return { session: snap.session, user: snap.user, loading: !snap.ready };
}
