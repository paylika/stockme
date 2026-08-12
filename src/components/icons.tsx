// StockMe — jeu d'icônes SVG maison, style « duotone ».
// Chaque icône = un remplissage doux (currentColor à faible opacité) + un tracé net.
// Cohérent, reconnaissable, loin des icônes stroke génériques.
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { active?: boolean };

function Base({ children, className, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

const soft = { fill: "currentColor", stroke: "none", opacity: 0.16 } as const;

/** Maison — accueil */
export function IconHome(p: IconProps) {
  return (
    <Base {...p}>
      <path {...soft} d="M12 3.2 4 9.2V20a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9.2L12 3.2Z" />
      <path d="M4 10 12 4l8 6" />
      <path d="M6 10.5V20h12v-9.5" />
      <path d="M10 20v-4.5a2 2 0 0 1 4 0V20" />
    </Base>
  );
}

/** Cœur — favoris (forme classique, lisible) */
export function IconHeart(p: IconProps) {
  const d =
    "M12 20.3 10.55 19C5.4 14.36 2 11.28 2 7.5 2 4.42 4.42 2 7.5 2c1.74 0 3.41.81 4.5 2.09C13.09 2.81 14.76 2 16.5 2 19.58 2 22 4.42 22 7.5c0 3.78-3.4 6.86-8.55 11.54L12 20.3Z";
  return (
    <Base {...p}>
      <path {...(p.active ? { fill: "currentColor", stroke: "none" } : soft)} d={d} />
      <path d={d} />
    </Base>
  );
}

/** Étiquette + éclair — vendre / publier */
export function IconSell(p: IconProps) {
  return (
    <Base {...p}>
      <path {...soft} d="M4 4h7.2a2 2 0 0 1 1.4.6l6.8 6.8a2 2 0 0 1 0 2.8l-5.2 5.2a2 2 0 0 1-2.8 0L4.6 12.6a2 2 0 0 1-.6-1.4V4Z" />
      <path d="M4 4h7.2a2 2 0 0 1 1.4.6l6.8 6.8a2 2 0 0 1 0 2.8l-5.2 5.2a2 2 0 0 1-2.8 0L4.6 12.6a2 2 0 0 1-.6-1.4V4Z" />
      <circle cx="8.5" cy="8.5" r="1.4" fill="currentColor" stroke="none" />
    </Base>
  );
}

/** Cartons empilés — mon stock */
export function IconStock(p: IconProps) {
  return (
    <Base {...p}>
      <path {...soft} d="M3.5 8 12 4l8.5 4-8.5 4-8.5-4Z" />
      <path d="M3.5 8 12 4l8.5 4-8.5 4L3.5 8Z" />
      <path d="M3.5 8v8l8.5 4 8.5-4V8" />
      <path d="M12 12v8" />
    </Base>
  );
}

/** Utilisateur — profil */
export function IconUser(p: IconProps) {
  return (
    <Base {...p}>
      <circle {...soft} cx="12" cy="8" r="4" />
      <circle cx="12" cy="8" r="3.4" />
      <path {...soft} d="M4.5 20a7.5 7.5 0 0 1 15 0Z" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </Base>
  );
}

/** Loupe — recherche */
export function IconSearch(p: IconProps) {
  return (
    <Base {...p}>
      <circle {...soft} cx="11" cy="11" r="7" />
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.2-3.2" />
    </Base>
  );
}

/** Épingle — localisation */
export function IconPin(p: IconProps) {
  return (
    <Base {...p}>
      <path {...soft} d="M12 21c4-4.2 6-7.4 6-10.2A6 6 0 0 0 6 10.8C6 13.6 8 16.8 12 21Z" />
      <path d="M12 21c4-4.2 6-7.4 6-10.2A6 6 0 0 0 6 10.8C6 13.6 8 16.8 12 21Z" />
      <circle cx="12" cy="10.6" r="2.2" fill="currentColor" stroke="none" />
    </Base>
  );
}

/** Flèche droite */
export function IconArrow(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M5 12h13" />
      <path d="m13 6 6 6-6 6" />
    </Base>
  );
}

/** WhatsApp / message */
export function IconWhatsApp(p: IconProps) {
  return (
    <Base {...p}>
      <path {...soft} d="M4 20l1.3-3.9A8 8 0 1 1 8 19.2L4 20Z" />
      <path d="M4 20l1.3-3.9A8 8 0 1 1 8 19.2L4 20Z" />
      <path d="M9 9.2c0 3 2 5 5 5 .5 0 .9-.5.7-1l-.5-1.2a.6.6 0 0 0-.8-.3l-.8.4a3.4 3.4 0 0 1-1.6-1.6l.4-.8a.6.6 0 0 0-.3-.8l-1.2-.5c-.5-.2-1 .2-1 .7Z" fill="currentColor" stroke="none" />
    </Base>
  );
}

/** Bouclier vérifié */
export function IconShield(p: IconProps) {
  return (
    <Base {...p}>
      <path {...soft} d="M12 3 5 5.5V11c0 4.2 2.9 7.6 7 9 4.1-1.4 7-4.8 7-9V5.5L12 3Z" />
      <path d="M12 3 5 5.5V11c0 4.2 2.9 7.6 7 9 4.1-1.4 7-4.8 7-9V5.5L12 3Z" />
      <path d="m9 11.8 2 2 4-4.2" />
    </Base>
  );
}

/** Badge / pastille validée */
export function IconBadge(p: IconProps) {
  return (
    <Base {...p}>
      <path {...soft} d="m12 3 2 1.6 2.5-.3.9 2.4 2.4.9-.3 2.5L21 15l-1.6 2 .3 2.5-2.4.9-.9 2.4-2.5-.3L12 24l-2-1.6-2.5.3-.9-2.4-2.4-.9.3-2.5L3 15l1.6-2L4.3 10.5l2.4-.9.9-2.4L10 7.6 12 3Z" />
      <path d="m9 12 2 2 4-4" />
    </Base>
  );
}

/** Flamme — promotions */
export function IconFlame(p: IconProps) {
  return (
    <Base {...p}>
      <path {...soft} d="M12 3s5 3.5 5 9a5 5 0 0 1-10 0c0-1.6.6-2.8 1.3-3.6.2 1.2 1 1.9 1.7 1.9-.2-2.6 1-5.5 2-7.3Z" />
      <path d="M12 3s5 3.5 5 9a5 5 0 0 1-10 0c0-1.6.6-2.8 1.3-3.6.2 1.2 1 1.9 1.7 1.9-.2-2.6 1-5.5 2-7.3Z" />
    </Base>
  );
}

/** Boutique — vendeurs */
export function IconStore(p: IconProps) {
  return (
    <Base {...p}>
      <path {...soft} d="M4 10h16v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9Z" />
      <path d="M4 10 5.2 4h13.6L20 10" />
      <path d="M4 10h16v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9Z" />
      <path d="M4 10a2.4 2.4 0 0 0 4 0 2.4 2.4 0 0 0 4 0 2.4 2.4 0 0 0 4 0 2.4 2.4 0 0 0 4 0" />
    </Base>
  );
}

/** Admin — bouclier alerte */
export function IconAdmin(p: IconProps) {
  return (
    <Base {...p}>
      <path {...soft} d="M12 3 5 5.5V11c0 4.2 2.9 7.6 7 9 4.1-1.4 7-4.8 7-9V5.5L12 3Z" />
      <path d="M12 3 5 5.5V11c0 4.2 2.9 7.6 7 9 4.1-1.4 7-4.8 7-9V5.5L12 3Z" />
      <path d="M12 8v4" />
      <circle cx="12" cy="15.4" r="0.6" fill="currentColor" stroke="none" />
    </Base>
  );
}

/** Boîte vide — état vide */
export function IconBox(p: IconProps) {
  return (
    <Base {...p}>
      <path {...soft} d="M3.5 7 12 3l8.5 4v10L12 21 3.5 17V7Z" />
      <path d="M3.5 7 12 11l8.5-4M12 11v10M3.5 7 12 3l8.5 4v10L12 21 3.5 17V7Z" />
    </Base>
  );
}

export function IconChevronDown(p: IconProps) {
  return (
    <Base {...p}>
      <path d="m6 9 6 6 6-6" />
    </Base>
  );
}

export function IconClose(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Base>
  );
}

export function IconCheck(p: IconProps) {
  return (
    <Base {...p}>
      <path d="m5 12 4.5 4.5L19 7" />
    </Base>
  );
}
