import { useSyncExternalStore } from "react";

/**
 * Action principale de la barre de navigation mobile.
 *
 * Sur une fiche produit, le bouton central de la barre devient l'action
 * d'achat (« Commander » sur WhatsApp) avec le prix affiché. On garde ainsi
 * TOUTE la navigation visible : on ne masque plus la barre, on l'enrichit.
 */

export type MobileAction = {
  /** Libellé lu sous le bouton (ex. « 25 000 F »). */
  label: string;
  /** Lien à ouvrir (WhatsApp, téléphone…). */
  href: string;
  /** Icône affichée dans le bouton. */
  icon: "whatsapp" | "login";
  /** Libellé accessible. */
  ariaLabel: string;
};

let current: MobileAction | null = null;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

export function setMobileAction(action: MobileAction | null) {
  current = action;
  emit();
}

export function clearMobileAction() {
  if (current === null) return;
  current = null;
  emit();
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

export function useMobileAction(): MobileAction | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
}
