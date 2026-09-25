import { useEffect, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";

/**
 * Mémoire de défilement du site.
 *
 * PROBLÈME RÉSOLU : quand on fait « retour » depuis une fiche produit, la page
 * revient tout en haut au lieu de là où on était. La restauration native du
 * routeur est trop pressée : sur nos pages, les listes (produits, annonces)
 * arrivent APRÈS le rendu (requête réseau de 200 à 600 ms). Au moment de
 * restaurer, la page est encore courte, la position demandée n'existe pas, et
 * on retombe donc en haut.
 *
 * CE QUE FAIT CE COMPOSANT (monté une seule fois, pour tout le site) :
 *   • il mémorise en continu la position de défilement de chaque page, indexée
 *     sur son adresse complète (chemin + filtres), dans la session du navigateur ;
 *   • au retour (bouton « précédent » ou geste retour du téléphone), il réessaie
 *     jusqu'à ce que la page soit assez haute pour atteindre la position mémorisée ;
 *   • sur un clic normal, la nouvelle page démarre bien en haut.
 */
const PREFIX = "stockme:scroll:";
const MAX_FRAMES = 200; // ~3 s d'attente maximum pour un chargement lent

function readScroll(key: string): number {
  try {
    return Number(sessionStorage.getItem(PREFIX + key) ?? "0") || 0;
  } catch {
    return 0;
  }
}

export function ScrollKeeper() {
  // Clé de la page : chemin + filtres, pour que chaque liste filtrée garde sa
  // propre position (ex. /browse?city=Dakar ≠ /browse?city=Thiès).
  const href = useRouterState({
    select: (s) => `${s.location.pathname}${s.location.searchStr ?? ""}`,
  });

  const keyRef = useRef(href);
  const backRef = useRef(false);
  const bootRef = useRef(true);
  const rafRef = useRef(0);
  // Pendant une restauration, on n'écrase pas la position mémorisée : sinon
  // les positions intermédiaires (page encore courte) remplaceraient la bonne.
  const restoringRef = useRef(false);

  /** Va à la position mémorisée, en réessayant tant que la page est trop courte. */
  const restore = (key: string) => {
    const target = readScroll(key);
    if (target <= 0) return;

    window.cancelAnimationFrame(rafRef.current);
    restoringRef.current = true;
    let frames = 0;
    const tick = () => {
      const max = Math.max(document.documentElement.scrollHeight - window.innerHeight, 0);
      window.scrollTo(0, Math.min(target, max));
      if (max >= target || frames >= MAX_FRAMES) {
        restoringRef.current = false;
        return;
      }
      frames += 1;
      rafRef.current = window.requestAnimationFrame(tick);
    };
    tick();
  };

  // 1) Distinguer un vrai retour/avant du navigateur d'un simple clic.
  useEffect(() => {
    const mark = () => {
      backRef.current = true;
    };
    window.addEventListener("popstate", mark);
    return () => window.removeEventListener("popstate", mark);
  }, []);

  // 2) Mémoriser la position pendant qu'on défile (attribuée à la page courante).
  useEffect(() => {
    let frame = 0;
    const save = () => {
      frame = 0;
      if (restoringRef.current) return;
      try {
        sessionStorage.setItem(PREFIX + keyRef.current, String(Math.round(window.scrollY)));
      } catch {
        /* navigation privée : on continue sans mémoriser */
      }
    };
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(save);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", save);
    return () => {
      save(); // dernière position connue juste avant de quitter la page
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", save);
      if (frame) window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // 3) Changement de page : retour = on restaure, clic normal = on repart du haut.
  useEffect(() => {
    const previous = keyRef.current;
    keyRef.current = href;
    if (previous === href) return;

    if (backRef.current) {
      backRef.current = false;
      restore(href);
      return;
    }
    window.scrollTo(0, 0);
  }, [href]);

  // 4) Rechargement de la page sur une entrée « retour » du navigateur
  //    (fréquent sur mobile quand on revient depuis une autre application).
  useEffect(() => {
    if (!bootRef.current) return;
    bootRef.current = false;
    const entry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (entry?.type === "back_forward") restore(keyRef.current);
  }, []);

  return null;
}
