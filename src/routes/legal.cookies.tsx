import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/legal/cookies")({
  head: () => ({
    meta: [
      { title: "Politique des cookies — StockMe" },
      { name: "description", content: "Utilisation des cookies sur StockMe." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <article className="prose prose-neutral max-w-none">
      <h1 className="text-3xl font-display font-bold tracking-tight">Politique des cookies</h1>
      <p className="text-sm text-muted-foreground">Dernière mise à jour : {new Date().toLocaleDateString("fr-FR")}</p>

      <p className="mt-6">StockMe utilise uniquement les cookies strictement nécessaires au fonctionnement du site : session d'authentification, préférences d'affichage et sécurité.</p>

      <h2 className="mt-6 text-xl font-semibold">Cookies tiers</h2>
      <p>Nous n'utilisons pas de cookies publicitaires. Aucun traceur commercial n'est déposé sans votre consentement.</p>

      <h2 className="mt-6 text-xl font-semibold">Gestion</h2>
      <p>Vous pouvez à tout moment supprimer les cookies via les paramètres de votre navigateur.</p>

      <h2 className="mt-6 text-xl font-semibold">Contact</h2>
      <p>+221 78 663 53 31 — met.app.orderly@gmail.com</p>
    </article>
  );
}
