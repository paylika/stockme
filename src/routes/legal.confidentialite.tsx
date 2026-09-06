import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/legal/confidentialite")({
  head: () => ({
    meta: [
      { title: "Politique de confidentialité — StockMe" },
      { name: "description", content: "Comment StockMe protège et traite vos données personnelles." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <article className="prose prose-neutral max-w-none">
      <h1 className="text-3xl font-display font-bold tracking-tight">Politique de confidentialité</h1>
      <p className="text-sm text-muted-foreground">Dernière mise à jour : {new Date().toLocaleDateString("fr-FR")}</p>

      <h2 className="mt-8 text-xl font-semibold">Données collectées</h2>
      <p>Nous collectons uniquement les données nécessaires au fonctionnement du service : email, nom, ville, numéro WhatsApp et informations liées à vos annonces.</p>

      <h2 className="mt-6 text-xl font-semibold">Utilisation</h2>
      <p>Vos données servent à : créer votre compte, publier vos annonces, permettre la mise en relation avec les acheteurs et améliorer la plateforme.</p>

      <h2 className="mt-6 text-xl font-semibold">Partage</h2>
      <p>Votre numéro WhatsApp n'est visible que par les utilisateurs connectés qui consultent votre annonce. Nous ne vendons jamais vos données à des tiers.</p>

      <h2 className="mt-6 text-xl font-semibold">Vos droits</h2>
      <p>Vous pouvez à tout moment consulter, modifier ou supprimer vos données en nous contactant à app.orderly@gmail.com.</p>

      <h2 className="mt-6 text-xl font-semibold">Contact</h2>
      <p>+221 78 663 53 31 — app.orderly@gmail.com</p>
    </article>
  );
}
