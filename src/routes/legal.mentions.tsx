import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/legal/mentions")({
  head: () => ({
    meta: [
      { title: "Mentions légales — StockMe" },
      { name: "description", content: "Mentions légales de la plateforme StockMe." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <article className="prose prose-neutral max-w-none">
      <h1 className="text-3xl font-display font-bold tracking-tight">Mentions légales</h1>
      <p className="text-sm text-muted-foreground">Dernière mise à jour : {new Date().toLocaleDateString("fr-FR")}</p>

      <h2 className="mt-8 text-xl font-semibold">Éditeur du site</h2>
      <p>Le site StockMe est édité et maintenu par l'équipe StockMe.</p>

      <h2 className="mt-6 text-xl font-semibold">Contact</h2>
      <p>Téléphone / WhatsApp : +221 76 678 32 15<br />Email : contact@stockme.app</p>

      <h2 className="mt-6 text-xl font-semibold">Hébergement</h2>
      <p>La plateforme est hébergée sur une infrastructure cloud sécurisée en Europe.</p>

      <h2 className="mt-6 text-xl font-semibold">Propriété intellectuelle</h2>
      <p>L'ensemble des éléments (marque, logo, textes, visuels) présents sur StockMe sont protégés. Toute reproduction sans autorisation est interdite.</p>
    </article>
  );
}
