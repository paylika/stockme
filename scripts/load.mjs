/**
 * TEST DE CHARGE — « EST-CE QUE ÇA TIENT ? »
 *
 *   node scripts/load.mjs                  → 10 utilisateurs pendant 20 secondes
 *   node scripts/load.mjs 30 60            → 30 utilisateurs pendant 60 secondes
 *   node scripts/load.mjs 30 60 --local    → sur http://localhost:3000
 *
 * À QUOI ÇA SERT : savoir COMBIEN d'utilisateurs simultanés le site encaisse,
 * et quelle page casse en premier. Sans mesure, on ne peut que espérer — et on
 * découvre la limite le jour où le trafic arrive.
 *
 * CE QU'IL MESURE : pour chaque page, le temps de réponse (médiane, p95, p99),
 * le taux d'erreur, et le débit. Les adresses sont appelées AVEC un paramètre
 * aléatoire pour contourner le cache de Cloudflare : on mesure donc le VRAI
 * travail (rendu + base de données), pas la copie servie par le CDN.
 *
 * ⚠️ À LANCER EN DEHORS DES HEURES DE POINTE, et en montant progressivement
 * (10 → 30 → 60 utilisateurs). Au-delà de 50, prévenez : c'est un vrai test de
 * charge qui sollicite la base de données.
 */
const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const LOCAL = process.argv.includes("--local");
const USERS = Math.min(Number(args[0] ?? 10), 50);
const SECONDS = Math.min(Number(args[1] ?? 20), 180);
const SITE = LOCAL ? "http://localhost:3000" : "https://stockme.store";

const SB_URL = "https://minnkepmfqnbmcreojor.supabase.co";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pbm5rZXBtZnFuYm1jcmVvam9yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY1NDcyMzUsImV4cCI6MjEwMjEyMzIzNX0.qZx9_0b3Q2Js9f-kjQqirI3WElxOlV2AAdTM9FS4Esk";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---- On a besoin de vraies pages pour tester le vrai travail ---- */
let produit = null;
let vendeur = null;
try {
  const rows = await (
    await fetch(`${SB_URL}/rest/v1/products?select=id,owner_id&published=eq.true&limit=3`, {
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
    })
  ).json();
  produit = rows?.[0]?.id ?? null;
  vendeur = rows?.[0]?.owner_id ?? null;
} catch {
  /* les pages produit seront simplement absentes du test */
}

/** Le mélange de pages : ce qu'un visiteur fait réellement. */
const scenarios = [
  { nom: "Accueil (cache CDN)", chemin: () => "/", poids: 1 },
  { nom: "Accueil (vrai rendu)", chemin: () => `/?l=${Math.random().toString(36).slice(2)}`, poids: 2 },
  { nom: "Catalogue /browse", chemin: () => `/browse?l=${Math.random().toString(36).slice(2)}`, poids: 2 },
  ...(produit ? [{ nom: "Fiche produit", chemin: () => `/product/${produit}?l=${Math.random().toString(36).slice(2)}`, poids: 3 }] : []),
  ...(vendeur ? [{ nom: "Boutique vendeur", chemin: () => `/vendeur/${vendeur}?l=${Math.random().toString(36).slice(2)}`, poids: 1 }] : []),
  { nom: "API santé", chemin: () => "/api/health", poids: 1 },
];

const liste = scenarios.flatMap((s) => Array(s.poids).fill(s));
const stats = new Map();
const global = { ok: 0, err: 0, temps: [] };
const codeErreurs = new Map();

/* ---- Contrôle préalable : on écarte les pages absentes (sinon le test
       signalerait de fausses erreurs pour une adresse pas encore déployée). ---- */
const retenues = [];
for (const s of scenarios) {
  try {
    const res = await fetch(`${SITE}${s.chemin()}`, { headers: { "user-agent": "StockMe-LoadTest" } });
    const texte = await res.text();
    if (res.ok && texte.length > 500) retenues.push(s);
    else console.log(`  (écartée : ${s.nom} — HTTP ${res.status})`);
  } catch {
    console.log(`  (écartée : ${s.nom} — injoignable)`);
  }
}
if (!retenues.length) {
  console.log("\n❌ Aucune page testable. Le site répond-il ?\n");
  process.exit(1);
}

const noter = (nom, ms, ok, code) => {
  if (!stats.has(nom)) stats.set(nom, { ok: 0, err: 0, temps: [] });
  const s = stats.get(nom);
  s.temps.push(ms);
  if (ok) {
    s.ok++;
    global.ok++;
  } else {
    s.err++;
    global.err++;
    codeErreurs.set(code, (codeErreurs.get(code) ?? 0) + 1);
  }
  global.temps.push(ms);
};

const percentile = (valeurs, p) => {
  if (!valeurs.length) return 0;
  const tri = [...valeurs].sort((a, b) => a - b);
  return tri[Math.min(tri.length - 1, Math.floor((p / 100) * tri.length))];
};

console.log(`\n=== TEST DE CHARGE — ${SITE} ===`);
console.log(`${USERS} utilisateur(s) simultané(s) pendant ${SECONDS} secondes`);
console.log(`Pages testées : ${retenues.map((s) => s.nom).join(", ")}\n`);
console.log("(mesure du vrai travail : le cache du CDN est contourné par un paramètre aléatoire)\n");

const melange = retenues.flatMap((s) => Array(s.poids).fill(s));
const fin = Date.now() + SECONDS * 1000;

const utilisateur = async () => {
  while (Date.now() < fin) {
    const s = melange[Math.floor(Math.random() * melange.length)];
    const url = `${SITE}${s.chemin()}`;
    const t0 = Date.now();
    try {
      const controle = new AbortController();
      const minuterie = setTimeout(() => controle.abort(), 30000);
      const res = await fetch(url, { signal: controle.signal, headers: { "user-agent": "StockMe-LoadTest" } });
      clearTimeout(minuterie);
      const texte = await res.text();
      const ms = Date.now() - t0;
      // Une page qui répond 200 mais vide est une panne : on compte le contenu.
      const valide = res.ok && texte.length > 500;
      noter(s.nom, ms, valide, valide ? 200 : res.status);
    } catch (e) {
      noter(s.nom, Date.now() - t0, false, e?.name === "AbortError" ? "délai dépassé" : "réseau");
    }
    await sleep(Math.random() * 150); // petit temps de réflexion entre deux pages
  }
};

const debut = Date.now();
await Promise.all(Array.from({ length: USERS }, utilisateur));
const duree = (Date.now() - debut) / 1000;

/* ---------- Résultats ---------- */
console.log("Page".padEnd(24) + "requêtes".padStart(10) + "erreurs".padStart(9) + "médiane".padStart(10) + "p95".padStart(9) + "p99".padStart(9));
for (const [nom, s] of stats) {
  console.log(
    nom.padEnd(24) +
      String(s.ok + s.err).padStart(10) +
      String(s.err).padStart(9) +
      `${percentile(s.temps, 50)} ms`.padStart(10) +
      `${percentile(s.temps, 95)} ms`.padStart(9) +
      `${percentile(s.temps, 99)} ms`.padStart(9),
  );
}

const total = global.ok + global.err;
const tauxErreur = total ? (global.err / total) * 100 : 0;
const p95 = percentile(global.temps, 95);
const debit = (total / duree).toFixed(1);

console.log(`\nTotal          : ${total} requêtes en ${duree.toFixed(1)} s  →  ${debit} pages/seconde`);
console.log(`Taux d'erreur  : ${tauxErreur.toFixed(2)} %`);
console.log(`Temps global   : médiane ${percentile(global.temps, 50)} ms | p95 ${p95} ms | p99 ${percentile(global.temps, 99)} ms`);
if (codeErreurs.size) {
  console.log(`Codes rencontrés : ${[...codeErreurs.entries()].map(([c, n]) => `${c} × ${n}`).join(", ")}`);
}

let verdict;
if (tauxErreur > 5) verdict = "🔴 LE SITE CASSE à ce niveau de charge — corriger avant d'augmenter";
else if (p95 > 3000) verdict = "🟠 TRÈS LENT sous cette charge : les visiteurs partiront avant la fin du chargement";
else if (p95 > 1500) verdict = "🟠 Acceptable mais lent : à surveiller et optimiser";
else verdict = "🟢 Solide à ce niveau de charge — on peut monter d'un cran";

console.log(`\n${verdict}`);
console.log(
  "\nRappel : ce test mesure le site à un instant donné. Pour connaître la limite réelle,\n" +
    "refaire le test en montant (10 → 30 → 60) et noter à partir de quel niveau le p95\ndépasse 3 secondes ou le taux d'erreur dépasse 1 %.\n",
);
process.exit(tauxErreur > 5 ? 1 : 0);
