import type { Session, User } from "@supabase/supabase-js";
import { STOCKME_SUPABASE_URL, supabase } from "@/integrations/supabase/stockme-client";

/**
 * STABILITÉ DE LA CONNEXION — POURQUOI CE FICHIER EXISTE.
 *
 * Symptôme signalé : « le profil saute, ça se déconnecte tout seul », surtout
 * sur téléphone. Ce n'était pas un hasard : dans supabase-js, `getSession()`
 * peut renvoyer `null` alors que l'utilisateur est TOUJOURS connecté, dans
 * trois situations très fréquentes sur mobile :
 *
 *   1. l'application revient au premier plan après plusieurs heures : le jeton
 *      d'accès est expiré et doit être rafraîchi ;
 *   2. le téléphone change de réseau (Wi-Fi → 4G) ou perd le réseau quelques
 *      secondes pendant ce rafraîchissement ;
 *   3. deux onglets/écrans rafraîchissent en même temps : le premier gagne, le
 *      second reçoit « refresh token inconnu » et supabase-js EFFACE la session.
 *
 * Comme une quinzaine d'endroits du site faisaient `getSession()` puis
 * concluaient « pas connecté », le moindre de ces hoquets vidait la page,
 * fermait le contact vendeur et renvoyait l'utilisateur vers la page de
 * connexion. C'est ce comportement qu'on supprime ici.
 *
 * LA RÈGLE APPLIQUÉE : un échec réseau n'est JAMAIS une déconnexion. Seule une
 * déconnexion demandée par l'utilisateur (ou un jeton définitivement refusé par
 * le serveur) en est une. Pour cela on garde une copie de secours du jeton :
 * si supabase-js efface la sienne par accident, on la restaure.
 */

/* ------------------------------------------------------------------ *
 * Lecture directe du navigateur (aucun appel réseau)
 * ------------------------------------------------------------------ */

/** Clé utilisée par supabase-js : sb-<projet>-auth-token. */
const SESSION_KEY = `sb-${new URL(STOCKME_SUPABASE_URL).hostname.split(".")[0]}-auth-token`;
/** Copie de secours StockMe, pour survivre à un effacement accidentel. */
const BACKUP_KEY = "stockme.auth.backup";

type StoredSession = { access_token?: string; refresh_token?: string; expires_at?: number; user?: User };
/** Déconnexion demandée par l'utilisateur : on ne doit PAS reconnecter après. */
let signedOutOnPurpose = false;

function readStorage(key: string): unknown {
  if (typeof window === "undefined") return null;
  try {
    let raw = window.localStorage.getItem(key);
    if (raw === null) {
      // supabase-js découpe parfois le jeton en morceaux (key.0, key.1…)
      const parts: string[] = [];
      for (let i = 0; i < 8; i++) {
        const chunk = window.localStorage.getItem(`${key}.${i}`);
        if (chunk === null) break;
        parts.push(chunk);
      }
      if (!parts.length) return null;
      raw = parts.join("");
      // les morceaux sont encodés en JSON (chaîne entre guillemets)
      if (raw.startsWith('"')) {
        try {
          raw = JSON.parse(raw) as string;
        } catch {
          /* on garde la valeur brute */
        }
      }
    }
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  } catch {
    // Navigation privée ou stockage bloqué : on ne bloque jamais le site.
    return null;
  }
}

/** Session présente dans le navigateur, sans aucun appel réseau. */
export function storedSession(): StoredSession | null {
  const fromSupabase = readStorage(SESSION_KEY) as StoredSession | null;
  if (fromSupabase?.refresh_token) return fromSupabase;
  const backup = readStorage(BACKUP_KEY) as StoredSession | null;
  if (backup?.refresh_token) return backup;
  return null;
}

/** Enregistre la copie de secours à chaque session vue. */
function backupSession(session: Session | null): void {
  if (typeof window === "undefined") return;
  try {
    if (session?.refresh_token) {
      window.localStorage.setItem(
        BACKUP_KEY,
        JSON.stringify({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_at: session.expires_at,
          // L'utilisateur est conservé pour pouvoir rester connecté même sans
          // réseau (ses informations sont déjà dans le stockage du navigateur
          // par supabase-js : aucune donnée supplémentaire n'est exposée).
          user: session.user,
        }),
      );
    }
  } catch {
    /* stockage plein ou bloqué : sans gravité */
  }
}

function clearBackup(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(BACKUP_KEY);
  } catch {
    /* sans gravité */
  }
}

/* ------------------------------------------------------------------ *
 * Lecture de la session : locale, puis récupération si nécessaire
 * ------------------------------------------------------------------ */

async function readSession(): Promise<Session | null> {
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      backupSession(data.session);
      return data.session;
    }
  } catch {
    /* on tente la récupération ci-dessous */
  }
  return null;
}

/**
 * Session reconstruite à partir du navigateur seul (aucun réseau).
 *
 * Elle sert de dernier recours quand le réseau est absent : mieux vaut un site
 * qui reste « connecté » et affiche un message de reconnexion qu'une
 * déconnexion brutale parce que le téléphone a changé d'antenne. Cette session
 * ne donne AUCUN droit supplémentaire : la base vérifie le jeton de son côté.
 */
function localSession(): Session | null {
  const stored = storedSession();
  if (!stored?.access_token || !stored.user) return null;
  return {
    access_token: stored.access_token,
    refresh_token: stored.refresh_token ?? "",
    expires_at: stored.expires_at ?? 0,
    token_type: "bearer",
    user: stored.user,
  } as Session;
}

/** Un seul essai de récupération à la fois (évite les boucles). */
let recovery: Promise<Session | null> | null = null;

/**
 * Récupère la session quand supabase-js ne la voit plus :
 * on restaure le jeton conservé dans le navigateur.
 */
export async function recoverSession(): Promise<Session | null> {
  if (typeof window === "undefined" || signedOutOnPurpose) return null;
  if (recovery) return recovery;

  recovery = (async () => {
    const stored = storedSession();
    if (!stored?.refresh_token) return null;

    let definitive = false;

    // 1) On remet la session telle quelle (fonctionne même hors ligne).
    if (stored.access_token) {
      try {
        const { data, error } = await supabase.auth.setSession({
          access_token: stored.access_token,
          refresh_token: stored.refresh_token,
        });
        if (data.session) {
          backupSession(data.session);
          return data.session;
        }
        if (error && isDefinitiveFailure(error)) definitive = true;
      } catch {
        /* on tente le rafraîchissement */
      }
    }

    // 2) Sinon on demande un nouveau jeton d'accès avec le jeton de
    //    rafraîchissement (cas de l'app qui revient après plusieurs heures).
    try {
      const { data, error } = await supabase.auth.refreshSession({ refresh_token: stored.refresh_token });
      if (data.session) {
        backupSession(data.session);
        return data.session;
      }
      if (error && isDefinitiveFailure(error)) definitive = true;
    } catch {
      /* échec réseau : on garde la copie de secours pour la prochaine fois */
    }

    if (definitive) {
      // Le serveur a vraiment refusé le jeton : la session est morte.
      clearBackup();
      if (snapshot.session) emit({ session: null, user: null, ready: true });
      return null;
    }

    // Échec réseau : on garde l'utilisateur connecté côté navigateur.
    return localSession();
  })().finally(() => {
    recovery = null;
  });

  return recovery;
}

/**
 * CONCLURE « DÉCONNECTÉ » — mais seulement après avoir essayé de récupérer.
 *
 * C'est le point le plus délicat de tout ce fichier. Au démarrage, supabase-js
 * annonce « aucune session » (INITIAL_SESSION) avant que nous ayons pu
 * restaurer celle conservée dans le navigateur. Si on l'écoutait sans réfléchir,
 * l'application se croirait déconnectée pendant une seconde et renverrait
 * l'utilisateur vers la page de connexion — alors que sa session était là.
 * On attend donc la fin de la tentative de récupération avant de trancher.
 */
function announceNoSession(): void {
  void recoverSession().then((recovered) => {
    if (recovered) emit({ session: recovered, user: recovered.user, ready: true });
    else emit({ session: null, user: null, ready: true });
  });
}

/**
 * Vrai uniquement si le serveur a DÉFINITIVEMENT refusé le jeton (mot de passe
 * changé, session révoquée). Une panne réseau n'est pas un refus définitif :
 * dans ce cas on garde la session pour réessayer plus tard.
 */
function isDefinitiveFailure(error: { message?: string; status?: number; code?: string } | null): boolean {
  if (!error) return false;
  const text = `${error.message ?? ""} ${error.code ?? ""}`.toLowerCase();
  if (text.includes("refresh_token_not_found")) return true;
  if (text.includes("session_not_found")) return true;
  if (text.includes("invalid_grant")) return true;
  if (text.includes("invalid refresh token")) return true;
  // Erreur réseau / serveur indisponible : PAS définitif.
  if (typeof error.status === "number" && error.status >= 500) return false;
  return error.status === 400 || error.status === 401 || error.status === 403;
}

/**
 * LA fonction à utiliser partout dans le site à la place de `getSession()` :
 * elle ne dit « pas connecté » que si c'est vrai.
 */
export async function ensureSession(): Promise<Session | null> {
  if (typeof window === "undefined") return null;
  const direct = await readSession();
  if (direct) return direct;
  return recoverSession();
}

/* ------------------------------------------------------------------ *
 * Un seul état d'authentification pour toute l'application
 * ------------------------------------------------------------------ */

export type AuthSnapshot = { session: Session | null; user: User | null; ready: boolean };

let snapshot: AuthSnapshot = { session: null, user: null, ready: false };
const listeners = new Set<() => void>();
let started = false;

function emit(next: AuthSnapshot): void {
  snapshot = next;
  listeners.forEach((l) => l());
}

/**
 * Rafraîchit le jeton AVANT qu'il expire, au retour de l'application au premier
 * plan ou au retour du réseau : c'est le moment où les déconnexions
 * « toutes seules » se produisaient.
 */
async function keepAlive(): Promise<void> {
  const session = await ensureSession();
  if (!session) return;
  const expiresAt = (session.expires_at ?? 0) * 1000;
  if (expiresAt - Date.now() > 5 * 60 * 1000) return; // encore valable 5 min : rien à faire
  try {
    const { data } = await supabase.auth.refreshSession();
    if (data.session) emit({ session: data.session, user: data.session.user, ready: true });
  } catch {
    /* réseau absent : on réessaiera au prochain réveil */
  }
}

function start(): void {
  if (started || typeof window === "undefined") return;
  started = true;

  supabase.auth.onAuthStateChange((event, session) => {
    if (session) backupSession(session);

    switch (event) {
      case "SIGNED_OUT":
        // Attention : supabase-js émet SIGNED_OUT quand un rafraîchissement
        // échoue. On ne l'accepte que si le jeton a vraiment disparu.
        if (signedOutOnPurpose) {
          emit({ session: null, user: null, ready: true });
          return;
        }
        // On sort du rappel avant de retoucher à l'authentification : appeler
        // setSession/refreshSession pendant que supabase-js tient son verrou
        // interne peut bloquer l'application.
        setTimeout(announceNoSession, 0);
        return;

      case "INITIAL_SESSION":
        // Au premier chargement, supabase-js annonce souvent « rien » avant
        // qu'on ait restauré la session du navigateur : on ne tranche pas ici.
        if (!session && !snapshot.session) {
          setTimeout(announceNoSession, 0);
          return;
        }
        emit({ session: session ?? null, user: session?.user ?? null, ready: true });
        return;

      case "TOKEN_REFRESHED":
      case "SIGNED_IN":
      case "USER_UPDATED":
      case "PASSWORD_RECOVERY":
      case "MFA_CHALLENGE_VERIFIED":
        emit({ session: session ?? snapshot.session, user: (session ?? snapshot.session)?.user ?? null, ready: true });
        return;

      default:
        if (session) emit({ session, user: session.user, ready: true });
    }
  });

  // Premier état : session locale (instantanée), récupération si besoin.
  void ensureSession().then((session) => {
    // Un événement plus récent a pu passer entre-temps : on ne l'écrase pas.
    if (snapshot.ready && snapshot.session) return;
    emit({ session, user: session?.user ?? null, ready: true });
  });

  // FILET DE SÉCURITÉ « NE JAMAIS RESTER BLOQUÉ ».
  // Si une vérification réseau traîne (connexion mobile très lente), l'écran ne
  // doit pas rester indéfiniment en chargement : au bout de 4 secondes on
  // affiche ce que le navigateur sait déjà.
  setTimeout(() => {
    if (!snapshot.ready) {
      const local = localSession();
      emit({ session: local, user: local?.user ?? null, ready: true });
    }
  }, 4000);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void keepAlive();
  });
  window.addEventListener("online", () => void keepAlive());
  window.addEventListener("focus", () => void keepAlive());
}

export function subscribeAuth(listener: () => void): () => void {
  start();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Lecture synchrone de l'état courant (pour `useSyncExternalStore`). */
export function authSnapshot(): AuthSnapshot {
  start();
  return snapshot;
}

/**
 * État côté serveur : TOUJOURS le même objet (React compare les instantanés par
 * identité ; renvoyer un objet neuf à chaque appel provoquerait une boucle de
 * rendu). Le serveur ne connaît pas la session, elle vit dans le navigateur.
 */
const SERVER_SNAPSHOT: AuthSnapshot = { session: null, user: null, ready: false };

export function serverAuthSnapshot(): AuthSnapshot {
  return SERVER_SNAPSHOT;
}

/* ------------------------------------------------------------------ *
 * Déconnexion : une seule porte d'entrée
 * ------------------------------------------------------------------ */

/**
 * Déconnexion VOULUE par l'utilisateur. Elle efface aussi la copie de secours,
 * sinon le site le reconnecterait au chargement suivant.
 */
export async function signOutSafely(): Promise<void> {
  signedOutOnPurpose = true;
  clearBackup();
  try {
    await supabase.auth.signOut();
  } catch {
    /* même si le serveur ne répond pas, l'utilisateur est déconnecté ici */
  }
  // Filet de sécurité : si le serveur n'a pas répondu, la session peut être
  // restée dans le navigateur. On l'enlève pour ne pas reconnecter la personne
  // au chargement suivant (téléphone partagé).
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(SESSION_KEY);
    } catch {
      /* sans gravité */
    }
  }
  emit({ session: null, user: null, ready: true });
}
