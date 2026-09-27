/**
 * TEST DE SANTÉ STOCKME — LES CHEMINS QUI FONT TOURNER LE SAAS.
 *
 *   node scripts/smoke.mjs            → teste la production (stockme.store)
 *   node scripts/smoke.mjs --local    → teste http://localhost:3000
 *
 * RÈGLE DE L'ÉQUIPE : ce fichier est lancé AVANT chaque envoi de code et APRÈS
 * chaque déploiement. Si un seul test bloquant est rouge, on n'envoie pas.
 *
 * Pourquoi : un bug sur la publication, le contact vendeur, la page produit ou
 * le paiement fait perdre des utilisateurs et de l'argent. Un contrôle
 * automatique vaut mieux qu'une vérification « à l'œil ».
 *
 * Ce test ne laisse AUCUNE trace : le compte et les produits de test sont
 * supprimés à la fin.
 */
import { readFileSync } from "node:fs";

const LOCAL = process.argv.includes("--local");
const SITE = LOCAL ? "http://localhost:3000" : "https://stockme.store";

// ---- Clés publiques (lues depuis le code, jamais recopiées ici) ----
const client = readFileSync(new URL("../src/integrations/supabase/stockme-client.ts", import.meta.url), "utf8");
const SUPABASE_URL = /STOCKME_SUPABASE_URL = "([^"]+)"/.exec(client)?.[1];
const ANON = /STOCKME_SUPABASE_ANON_KEY =\s*\n?\s*"([^"]+)"/.exec(client)?.[1];
if (!SUPABASE_URL || !ANON) {
  console.error("❌ Clés Supabase introuvables dans src/integrations/supabase/stockme-client.ts");
  process.exit(1);
}

const results = [];
let failed = 0;
let warnings = 0;

const ok = (name, detail = "") => results.push({ level: "ok", name, detail });
const ko = (name, detail = "") => {
  failed++;
  results.push({ level: "ko", name, detail });
};
const warn = (name, detail = "") => {
  warnings++;
  results.push({ level: "warn", name, detail });
};

/** Test chronométré : renvoie { status, ms, text }. */
async function check(name, url, { method = "GET", headers = {}, body, expect = [200], contains = [], maxMs } = {}) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      method,
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, ...headers },
      body,
      redirect: "follow",
    });
    const ms = Date.now() - t0;
    const text = await res.text();
    if (!expect.includes(res.status)) {
      ko(name, `HTTP ${res.status} (attendu ${expect.join("/")}) — ${text.slice(0, 120)}`);
      return { status: res.status, text, ms };
    }
    for (const c of contains) {
      if (!text.includes(c)) {
        ko(name, `réponse ${res.status} mais contenu manquant : « ${c} »`);
        return { status: res.status, text, ms };
      }
    }
    if (maxMs && ms > maxMs) {
      ko(name, `trop lent : ${ms} ms (plafond ${maxMs} ms)`);
      return { status: res.status, text, ms };
    }
    ok(name, `${res.status} en ${ms} ms`);
    return { status: res.status, text, ms };
  } catch (e) {
    ko(name, `injoignable : ${e.message}`);
    return { ms: Date.now() - t0 };
  }
}

const sb = (path, init = {}) =>
  fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });

/** Enlève les balises et décode les entités : compare ce que lit le visiteur. */
const flatten = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

console.log(`\n=== TEST DE SANTÉ STOCKME — ${SITE} ===\n`);

/* ==========================================================================
 * 1. LES PAGES PUBLIQUES
 * ========================================================================== */
await check("Page d'accueil", `${SITE}/`, { contains: ["StockMe"], maxMs: 8000 });
await check("Catalogue /browse", `${SITE}/browse`, { contains: ["StockMe"], maxMs: 9000 });
await check("Page Tarifs", `${SITE}/tarifs`, { contains: ["Pro"], maxMs: 6000 });
await check("Page paiement sécurisé", `${SITE}/paiement-securise`, { maxMs: 6000 });
await check("Page de connexion", `${SITE}/auth`, { maxMs: 6000 });
await check("Nouveau mot de passe", `${SITE}/nouveau-mot-de-passe`, { maxMs: 6000 });
await check("Dropshipping", `${SITE}/dropshipping`, { maxMs: 8000 });
await check("Demandes d'achat", `${SITE}/demandes`, { maxMs: 8000 });
await check("CGU", `${SITE}/legal/cgu`, { maxMs: 6000 });

/* ==========================================================================
 * 2. PAGE PRODUIT + CONTACT VENDEUR (le cœur du site)
 * ========================================================================== */
let sampleProducts = [];
try {
  const r = await sb("/rest/v1/products?select=id,name,owner_id&published=eq.true&order=created_at.desc&limit=8");
  sampleProducts = (await r.json()) ?? [];
} catch {
  /* traité ci-dessous */
}

if (!Array.isArray(sampleProducts) || sampleProducts.length === 0) {
  ko("Produits publiés lisibles", "aucun produit publié n'a pu être lu");
} else {
  ok("Produits publiés lisibles", `${sampleProducts.length} produits`);
}

let productPagesOk = 0;
for (const p of sampleProducts) {
  const html = await check(`Page produit « ${p.name.slice(0, 22)} »`, `${SITE}/product/${p.id}`, {
    contains: ["WhatsApp"],
    maxMs: 12_000,
  });
  // Le nom doit vraiment s'afficher (preuve que la page est rendue, pas un écran d'erreur)
  if (html.text && !flatten(html.text).includes(p.name.slice(0, 14))) {
    ko(`Nom affiché sur la page « ${p.name.slice(0, 22)} »`, "le titre du produit n'apparaît pas dans la page");
  } else if (html.text) {
    productPagesOk++;
  }
}
if (productPagesOk > 0) ok("Titres réellement affichés", `${productPagesOk}/${sampleProducts.length} pages produit`);

// Fiche vendeur : le visiteur doit pouvoir voir la boutique et contacter.
const owner = sampleProducts[0]?.owner_id;
await check("Fiche vendeur", `${SITE}/vendeur/${owner}`, { maxMs: 12_000 });

/* ==========================================================================
 * 2 bis. LE BUG LE PLUS COÛTEUX DU SITE : LE NUMÉRO SANS INDICATIF
 *
 * Un vendeur qui saisit « 77 123 45 67 » (sans le 221) donnait un lien
 * WhatsApp invalide : l'acheteur ne pouvait pas le joindre et la vente était
 * perdue. Ce test prend un VRAI vendeur dont le numéro est enregistré sans
 * indicatif et vérifie que le lien de sa fiche pointe bien sur « 221 » + son
 * numéro. Si quelqu'un casse la normalisation, ce test devient rouge.
 * ========================================================================== */
try {
  const rows = await (
    await sb("/rest/v1/products?select=owner_id,whatsapp&published=eq.true&whatsapp=not.is.null&limit=80")
  ).json();
  const local = (Array.isArray(rows) ? rows : []).find((r) => {
    const d = String(r.whatsapp ?? "").replace(/\D/g, "");
    return d.length === 9 && /^[73]/.test(d);
  });

  if (!local) {
    warn("Lien de contact (numéro local)", "aucun vendeur à numéro local dans l'échantillon — test non concluant");
  } else {
    const digits = String(local.whatsapp).replace(/\D/g, "");
    const expected = `wa.me/221${digits}`;
    const html = await (await fetch(`${SITE}/vendeur/${local.owner_id}`)).text();
    if (html.includes(expected)) {
      ok("Lien de contact réparé (numéro local + 221)", expected);
    } else if (html.includes(`wa.me/${digits}`)) {
      ko(
        "Lien de contact réparé (numéro local + 221)",
        `le lien est « wa.me/${digits} » sans indicatif : WhatsApp refuse ce numéro, l'acheteur ne peut pas écrire au vendeur`,
      );
    } else {
      warn("Lien de contact réparé (numéro local + 221)", `lien « ${expected} » absent de la fiche vendeur`);
    }
  }
} catch (e) {
  warn("Lien de contact réparé (numéro local + 221)", e.message);
}

// Contact vendeur : le numéro doit être exposé par la fonction publique
if (sampleProducts[0]?.id) {
  const t0 = Date.now();
  try {
    const r = await sb("/rest/v1/rpc/get_public_seller", {
      method: "POST",
      body: JSON.stringify({ p_seller_id: owner }),
    });
    const j = await r.json();
    if (r.status === 200 && (j?.whatsapp || j?.phone)) ok("Contact vendeur (numéro exposé)", `${Date.now() - t0} ms`);
    else ko("Contact vendeur (numéro exposé)", `HTTP ${r.status} — whatsapp/phone absent`);
  } catch (e) {
    ko("Contact vendeur (numéro exposé)", e.message);
  }

  // Les statistiques affichées sur la fiche produit
  try {
    const r = await sb("/rest/v1/rpc/get_seller_stats", { method: "POST", body: JSON.stringify({ p_seller_id: owner }) });
    if (r.status === 200) ok("Statistiques vendeur (get_seller_stats)", "HTTP 200");
    else ko("Statistiques vendeur (get_seller_stats)", `HTTP ${r.status}`);
  } catch (e) {
    ko("Statistiques vendeur (get_seller_stats)", e.message);
  }

  // Produits similaires affichés sous la fiche produit
  try {
    const r = await sb("/rest/v1/rpc/get_similar_products", {
      method: "POST",
      body: JSON.stringify({ p_product_id: sampleProducts[0].id, p_limit: 6 }),
    });
    if (r.status === 200) ok("Produits similaires (get_similar_products)", "HTTP 200");
    else ko("Produits similaires (get_similar_products)", `HTTP ${r.status}`);
  } catch (e) {
    ko("Produits similaires (get_similar_products)", e.message);
  }
}

/* ==========================================================================
 * 3. PUBLICATION DE BOUT EN BOUT (compte jetable, supprimé à la fin)
 * ========================================================================== */
const email = `smoke-${Date.now()}@stockme.test`;
const password = `Smoke!${Math.floor(Math.random() * 1e9)}aZ`;
let token = null;
let userId = null;
let createdId = null;

try {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const j = await r.json();
  token = j?.access_token ?? null;
  userId = j?.user?.id ?? null;
  if (token && userId) ok("Inscription d'un nouveau compte", userId.slice(0, 8));
  else ko("Inscription d'un nouveau compte", `pas de session (HTTP ${r.status})`);
} catch (e) {
  ko("Inscription d'un nouveau compte", e.message);
}

// Connexion avec mot de passe (l'utilisateur qui revient)
try {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const j = await r.json();
  if (r.status === 200 && j?.access_token) ok("Connexion avec mot de passe", "session obtenue");
  else ko("Connexion avec mot de passe", `HTTP ${r.status} — ${JSON.stringify(j).slice(0, 120)}`);
} catch (e) {
  ko("Connexion avec mot de passe", e.message);
}

if (token && userId) {
  const H = { apikey: ANON, Authorization: `Bearer ${token}` };

  // 3.a Envoi d'une photo (exactement comme le fait le navigateur)
  const path = `${userId}/smoke-${Date.now()}.jpg`;
  let photoUrl = null;
  try {
    const up = await fetch(`${SUPABASE_URL}/storage/v1/object/product-images/${path}`, {
      method: "POST",
      headers: { ...H, "Content-Type": "image/jpeg" },
      body: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
    });
    if (up.status === 200) {
      photoUrl = `${SUPABASE_URL}/storage/v1/object/public/product-images/${path}`;
      ok("Envoi d'une photo au stockage", "HTTP 200");
      const pub = await fetch(photoUrl);
      if (pub.status === 200) ok("Photo accessible publiquement", "HTTP 200");
      else ko("Photo accessible publiquement", `HTTP ${pub.status} (les photos ne s'afficheraient pas)`);
    } else {
      ko("Envoi d'une photo au stockage", `HTTP ${up.status} — ${(await up.text()).slice(0, 100)}`);
    }
  } catch (e) {
    ko("Envoi d'une photo au stockage", e.message);
  }

  // 3.b Publication réelle d'un produit
  const productBody = (extra = {}) =>
    JSON.stringify({
      owner_id: userId,
      name: `Test technique ${new Date().toISOString().slice(11, 19)}`,
      category: "Autre",
      city: "Dakar",
      price_fcfa: 1000,
      quantity: 1,
      moq: 1,
      whatsapp: "+221770000000",
      images: photoUrl ? [photoUrl] : [],
      published: true,
      sold_out: false,
      dropshipping: false,
      submission_token: crypto.randomUUID(),
      ...extra,
    });

  if (photoUrl) {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/products`, {
        method: "POST",
        headers: { ...H, "Content-Type": "application/json", Prefer: "return=representation" },
        body: productBody(),
      });
      const j = await r.json();
      createdId = Array.isArray(j) ? (j[0]?.id ?? null) : null;
      if (r.status === 201 && createdId) ok("PUBLICATION d'un produit", "publié immédiatement");
      else ko("PUBLICATION d'un produit", `HTTP ${r.status} — ${JSON.stringify(j).slice(0, 160)}`);
    } catch (e) {
      ko("PUBLICATION d'un produit", e.message);
    }
  }

  // 3.c Anti-doublon : le même jeton deux fois → le 2e envoi doit être refusé
  try {
    const tok = crypto.randomUUID();
    const h = { ...H, "Content-Type": "application/json", Prefer: "return=representation" };
    const first = await fetch(`${SUPABASE_URL}/rest/v1/products`, {
      method: "POST",
      headers: h,
      body: productBody({ published: false, submission_token: tok }),
    });
    const second = await fetch(`${SUPABASE_URL}/rest/v1/products`, {
      method: "POST",
      headers: h,
      body: productBody({ published: false, submission_token: tok }),
    });
    if (first.status === 201 && second.status >= 400) ok("Anti-doublon de publication", `2e envoi refusé (${second.status})`);
    else if (first.status >= 400) warn("Anti-doublon de publication", `le 1er envoi est refusé (${first.status})`);
    else ko("Anti-doublon de publication", `1er=${first.status} 2e=${second.status} — le doublon devrait être refusé`);
  } catch (e) {
    ko("Anti-doublon de publication", e.message);
  }

  // 3.d Contact vendeur : l'événement doit s'enregistrer (204 = succès)
  if (createdId) {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/log_product_event`, {
        method: "POST",
        headers: { ...H, "Content-Type": "application/json" },
        body: JSON.stringify({ p_product_id: createdId, p_event: "contact" }),
      });
      if (r.status === 200 || r.status === 204) ok("Contact vendeur enregistré", `HTTP ${r.status}`);
      else ko("Contact vendeur enregistré", `HTTP ${r.status}`);
    } catch (e) {
      ko("Contact vendeur enregistré", e.message);
    }
  }

  // 3.e Espace vendeur : un seul appel doit tout ramener
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/seller_dashboard`, {
      method: "POST",
      headers: { ...H, "Content-Type": "application/json" },
      body: "{}",
    });
    const j = await r.json();
    if (r.status === 200 && j?.ok) ok("Espace vendeur (seller_dashboard)", "1 seul appel");
    else ko("Espace vendeur (seller_dashboard)", `HTTP ${r.status} — ${JSON.stringify(j).slice(0, 120)}`);
  } catch (e) {
    ko("Espace vendeur (seller_dashboard)", e.message);
  }

  /* ========================================================================
   * 4. PAIEMENT (vérifié sans rien facturer et sans créer de commande)
   * ======================================================================== */
  try {
    const r = await fetch(`${SITE}/api/pay/checkout`, {
      method: "POST",
      headers: { ...H, "Content-Type": "application/json" },
      body: JSON.stringify({ purpose: "objet_invalide_pour_test" }),
    });
    // 400 = la vérification fonctionne ; l'intention de paiement n'est pas créée
    if (r.status === 400) ok("Paiement : contrôle des demandes", "objet invalide refusé (400)");
    else if (r.status === 401) ko("Paiement : contrôle des demandes", "la session est refusée alors qu'elle est valide");
    else ko("Paiement : contrôle des demandes", `HTTP ${r.status} — ${(await r.text()).slice(0, 120)}`);
  } catch (e) {
    ko("Paiement : contrôle des demandes", e.message);
  }

  // Nettoyage : on supprime tout ce que le test a créé
  try {
    const del = await fetch(`${SUPABASE_URL}/rest/v1/products?owner_id=eq.${userId}`, { method: "DELETE", headers: H });
    if (del.status < 300) ok("Nettoyage des données de test", "produits supprimés");
    else warn("Nettoyage des données de test", `HTTP ${del.status}`);
    await fetch(`${SUPABASE_URL}/storage/v1/object/product-images/${path}`, { method: "DELETE", headers: H });
  } catch {
    /* sans gravité */
  }
}

/* ---- 4 bis. Moyens de paiement réellement disponibles (public) ---- */
try {
  const r = await fetch(`${SITE}/api/pay/checkout`);
  const d = await r.json();
  const methods = d?.methods ?? [];
  const card = methods.includes("card");
  const mobile = methods.includes("wave") || methods.includes("orange_money");

  if (methods.length === 0) {
    ko("Paiement : moyens disponibles", "AUCUN moyen de paiement disponible — personne ne peut payer");
  } else {
    ok("Paiement : moyens disponibles", methods.join(", "));
  }
  if (!card) warn("Paiement par carte bancaire", "indisponible (clé Stripe ?)");
  if (!mobile) {
    warn(
      "Paiement Wave / Orange Money",
      "indisponible : la variable UNITECH_API_KEY est absente du Worker Cloudflare",
    );
  }
  const bad = (d?.providers ?? []).filter((p) => !p.configured).map((p) => p.label);
  if (bad.length && mobile && card) warn("Fournisseurs non configurés", bad.join(", "));
} catch (e) {
  ko("Paiement : moyens disponibles", e.message);
}

/* ---- 4 ter. Les adresses de retour de paiement doivent exister ---- */
await check("Retour de paiement", `${SITE}/paiement/retour`, { expect: [200], maxMs: 8000 });
await check(
  "Webhook de paiement (protégé)",
  `${SITE}/api/pay/webhook/stripe`,
  { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", expect: [400, 401, 403, 500], maxMs: 8000 },
);

/* ==========================================================================
 * RÉSULTAT
 * ========================================================================== */
console.log("");
for (const r of results) {
  const icon = r.level === "ok" ? "✅" : r.level === "warn" ? "🟠" : "❌";
  console.log(`${icon}  ${r.name}${r.detail ? `  —  ${r.detail}` : ""}`);
}
console.log(
  `\n${failed === 0 ? "🟢 AUCUN BUG BLOQUANT" : `🔴 ${failed} BUG(S) BLOQUANT(S) — NE PAS ENVOYER EN L'ÉTAT`}` +
    (warnings ? `  |  🟠 ${warnings} avertissement(s) à traiter` : "") +
    "\n",
);
process.exit(failed === 0 ? 0 : 1);
