/**
 * TEST DU WEBHOOK XAALISPAY — AVANT TOUTE MISE EN SERVICE.
 *
 *   node scripts/xaalispay-test.mjs <whsec_...> [url]
 *
 * À QUOI ÇA SERT : vérifier que l'adresse de webhook accepte bien les
 * notifications signées de XaalisPay — SANS attendre un vrai paiement et SANS
 * rien activer côté public. On envoie une notification factice signée
 * exactement comme XaalisPay le fait, et on regarde la réponse.
 *
 *   • Réponse 200 (+ message de rejet du paiement inconnu) = ✅ la signature est
 *     acceptée, le branchement est bon.
 *   • Réponse 401 = la signature a été refusée → le secret ne correspond pas à
 *     celui enregistré dans Cloudflare.
 *   • Réponse 400 « provider_not_configured » = le secret n'est pas encore
 *     renseigné dans Cloudflare.
 *
 * Le script teste aussi la PROTECTION CONTRE LE REJEU : une signature valide
 * mais vieille de 10 minutes doit être refusée.
 */
import { createHmac } from "node:crypto";

const secret = process.argv[2];
const url = process.argv[3] ?? "https://stockme.store/api/pay/webhook/xaalispay";

if (!secret || !secret.startsWith("whsec_")) {
  console.log("\nUsage : node scripts/xaalispay-test.mjs whsec_VOTRE_SECRET [url]");
  console.log("Le secret commence par « whsec_ » et s'obtient en enregistrant l'adresse");
  console.log("de webhook (POST /api/v1/connect/webhook-endpoints).\n");
  process.exit(1);
}

/** Construit la signature exactement comme la documentation XaalisPay. */
function signer(corps, horodatage) {
  return createHmac("sha256", secret).update(`${horodatage}.${corps}`).digest("hex");
}

async function envoyer(nom, corps, horodatage, options = {}) {
  const signature = signer(corps, horodatage);
  const entetes = {
    "Content-Type": "application/json",
    "X-XaalisPay-Signature": `t=${horodatage},v1=${signature}`,
    "X-XaalisPay-Event": options.evenement ?? "transaction.released",
  };
  if (options.signatureFausse) entetes["X-XaalisPay-Signature"] = `t=${horodatage},v1=deadbeef`;

  const debut = Date.now();
  const res = await fetch(url, { method: "POST", headers: entetes, body: corps });
  const texte = (await res.text()).slice(0, 200);
  console.log(`\n${nom}`);
  console.log(`   envoi   : HTTP ${res.status} en ${Date.now() - debut} ms`);
  console.log(`   réponse : ${texte}`);

  if (res.status === 401 || /invalid_signature/i.test(texte)) {
    console.log("   ➜ signature REFUSÉE");
    return false;
  }
  if (/provider_not_configured/i.test(texte)) {
    console.log("   ➜ refusé : XAALISPAY_WEBHOOK_SECRET n'est pas encore dans Cloudflare");
    return false;
  }
  return true;
}

const maintenant = Math.floor(Date.now() / 1000);
const corps = JSON.stringify({
  id: `test-${maintenant}`,
  type: "transaction.released",
  data: {
    transaction_id: "00000000-0000-0000-0000-000000000000",
    external_ref: "test-technique-stockme",
    status: "released",
    amount: 100,
    currency: "XOF",
    application_fee: 0,
    xaalispay_fee: 2,
  },
});

console.log(`\n=== TEST DU WEBHOOK XAALISPAY — ${url} ===`);
const ok1 = await envoyer("1. Notification valide (signature correcte)", corps, maintenant);
const ok2 = await envoyer("2. Signature volontairement fausse (doit être REFUSÉE)", corps, maintenant, {
  signatureFausse: true,
});
const ok3 = await envoyer("3. Notification vieille de 10 minutes (rejeu, doit être REFUSÉE)", corps, maintenant - 600);

console.log("\n=== VERDICT ===");
if (!ok1) {
  console.log("🔴 Le webhook n'accepte pas encore les notifications : vérifiez le secret dans Cloudflare.");
} else if (ok3) {
  console.log("🟠 Signature acceptée, MAIS la protection contre le rejeu ne fonctionne pas : à corriger avant la mise en service.");
} else {
  console.log("🟢 Webhook correctement branché : signature vérifiée, rejeu bloqué.");
  console.log("   Vous pouvez passer à l'étape suivante : un vrai petit paiement, puis");
  console.log("   ajouter XAALISPAY_ENABLED = \"true\" pour ouvrir Wave / Orange Money au public.");
}
console.log("");
process.exit(ok1 && !ok3 ? 0 : 1);
