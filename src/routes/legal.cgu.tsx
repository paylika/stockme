import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/legal/cgu")({
  head: () => ({
    meta: [
      { title: "Conditions générales d'utilisation — StockMe" },
      { name: "description", content: "Conditions générales d'utilisation de la plateforme StockMe." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <article className="prose prose-neutral max-w-none">
      <h1 className="text-3xl font-display font-bold tracking-tight">Conditions générales d'utilisation</h1>
      <p className="text-sm text-muted-foreground">Dernière mise à jour : {new Date().toLocaleDateString("fr-FR")}</p>

      <h2 className="mt-8 text-xl font-semibold">1. Objet</h2>
      <p>StockMe est une plateforme de mise en relation entre e-commerçants souhaitant acheter ou écouler du stock en Afrique de l'Ouest. StockMe n'est ni acheteur ni vendeur.</p>

      <h2 className="mt-6 text-xl font-semibold">2. Compte utilisateur</h2>
      <p>La création d'un compte est gratuite. L'utilisateur s'engage à fournir des informations exactes et à ne pas usurper l'identité d'un tiers.</p>

      <h2 className="mt-6 text-xl font-semibold">3. Annonces</h2>
      <p>Les vendeurs sont seuls responsables du contenu, de la disponibilité et de la conformité des produits publiés. Les annonces trompeuses, illégales ou contrefaites sont interdites et pourront être supprimées.</p>

      <h2 className="mt-6 text-xl font-semibold">4. Transactions</h2>
      <p>La mise en relation se fait via WhatsApp. StockMe n'intervient pas dans le paiement, la livraison ou le service après-vente. Les utilisateurs assument les échanges commerciaux directement.</p>

      <h2 className="mt-6 text-xl font-semibold">5. Responsabilité</h2>
      <p>StockMe ne peut être tenu responsable des litiges entre utilisateurs. Nous mettons tout en œuvre pour assurer la sécurité et la disponibilité du service sans garantie absolue.</p>

      <h2 className="mt-6 text-xl font-semibold">6. Contact</h2>
      <p>Pour toute question : +221 76 678 32 15 — contact@stockme.app</p>
    </article>
  );
}
