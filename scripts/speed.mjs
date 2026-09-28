/**
 * MESURE D'UN VRAI CHARGEMENT SUR CONNEXION MOBILE.
 *
 *   npm run vitesse              → équivalent 4G (100 ms de latence, 4 Mb/s)
 *   npm run vitesse -- --3g      → 3G lente (300 ms de latence, 1,6 Mb/s)
 *   npm run vitesse -- --local   → sur http://localhost:3000
 *
 * POURQUOI : optimiser sans mesurer, c'est travailler au hasard. Ce script
 * ouvre les pages principales dans un vrai navigateur, en le bridant comme un
 * téléphone africain, puis répond à une seule question : OÙ PASSENT LES
 * SECONDES ? Le code ? Les photos ? La base de données ? Les publicités ?
 *
 * Il ne modifie rien : c'est un instrument de mesure.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const LOCAL = process.argv.includes("--local");
const TROIS_G = process.argv.includes("--3g");
const SITE = LOCAL ? "http://localhost:3000" : "https://stockme.store";
const PORT = 9337;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const BROWSERS = [
  process.env.STOCKME_BROWSER,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
].filter(Boolean);
const BROWSER = BROWSERS.find((p) => {
  try {
    return readFileSync(p) && true;
  } catch {
    return false;
  }
});
if (!BROWSER) {
  console.log("🟠 Navigateur introuvable. Indique-le avec $env:STOCKME_BROWSER.");
  process.exit(0);
}

/* Réglages réseau : latence et débit d'un téléphone en Afrique de l'Ouest. */
const RESEAU = TROIS_G
  ? { nom: "3G lente", latence: 300, debit: (1.6 * 1024 * 1024) / 8 }
  : { nom: "4G", latence: 100, debit: (4 * 1024 * 1024) / 8 };

/* Un vrai produit et un vrai vendeur pour tester les pages réelles. */
const client = readFileSync(new URL("../src/integrations/supabase/stockme-client.ts", import.meta.url), "utf8");
const SB = /STOCKME_SUPABASE_URL = "([^"]+)"/.exec(client)?.[1];
const ANON = /STOCKME_SUPABASE_ANON_KEY =\s*\n?\s*"([^"]+)"/.exec(client)?.[1];
let produitId = null;
let vendeurId = null;
try {
  const rows = await (
    await fetch(`${SB}/rest/v1/products?select=id,owner_id&published=eq.true&order=created_at.desc&limit=1`, {
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
    })
  ).json();
  produitId = rows?.[0]?.id ?? null;
  vendeurId = rows?.[0]?.owner_id ?? null;
} catch {
  /* les pages concernées seront ignorées */
}

const PAGES = [
  { nom: "Accueil", chemin: "/" },
  { nom: "Catalogue", chemin: "/browse" },
  ...(produitId ? [{ nom: "Fiche produit", chemin: `/product/${produitId}` }] : []),
  ...(vendeurId ? [{ nom: "Boutique vendeur", chemin: `/vendeur/${vendeurId}` }] : []),
];

const dir = mkdtempSync(join(tmpdir(), "stockme-vitesse-"));
const browser = spawn(BROWSER, ["--headless=new", "--disable-gpu", "--no-first-run", `--remote-debugging-port=${PORT}`, `--user-data-dir=${dir}`, "about:blank"], { stdio: "ignore" });

let list = [];
for (let i = 0; i < 40 && !list.length; i++) {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
    if (r.ok) list = await r.json();
  } catch {}
  if (!list.length) await sleep(500);
}
if (!list.length) {
  console.log("❌ Le navigateur n'a pas démarré.");
  process.exit(1);
}

const ws = new WebSocket((list.find((t) => t.type === "page") ?? list[0]).webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.onopen = res;
  ws.onerror = rej;
});
let id = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
};
const send = (method, params = {}) =>
  new Promise((res) => {
    const myId = ++id;
    pending.set(myId, res);
    ws.send(JSON.stringify({ id: myId, method, params }));
  });
const evaluate = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  return r.result?.result?.value;
};

await send("Page.enable");
await send("Runtime.enable");
await send("Network.enable");
/* Bridage réseau : c'est tout l'intérêt de la mesure. */
await send("Network.emulateNetworkConditions", {
  offline: false,
  latency: RESEAU.latence,
  downloadThroughput: RESEAU.debit,
  uploadThroughput: RESEAU.debit / 2,
});
await send("Network.setCacheDisabled", { cacheDisabled: true });

const ko = (o) => o / 1024;

console.log(`\n=== VITESSE RÉELLE — ${SITE} ===`);
console.log(`Réseau simulé : ${RESEAU.nom} (latence ${RESEAU.latence} ms, ${(RESEAU.debit * 8 / 1024 / 1024).toFixed(1)} Mb/s)\n`);

const resultats = [];
for (const page of PAGES) {
  await send("Page.navigate", { url: "about:blank" });
  await sleep(500);
  const debut = Date.now();
  await send("Page.navigate", { url: `${SITE}${page.chemin}` });
  /* On laisse le temps aux images paresseuses (lazy) d'arriver. */
  await sleep(12000);

  const data = await evaluate(`
    (() => {
      const nav = performance.getEntriesByType("navigation")[0] || {};
      const res = performance.getEntriesByType("resource").map((r) => ({
        type: r.initiatorType || "autre",
        nom: r.name,
        taille: r.transferSize || r.encodedBodySize || 0,
        duree: Math.round(r.duration),
      }));
      const parType = {};
      for (const r of res) {
        const t = parType[r.type] || (parType[r.type] = { n: 0, taille: 0, duree: 0 });
        t.n++; t.taille += r.taille; t.duree = Math.max(t.duree, r.duree);
      }
      return {
        ttfb: Math.round(nav.responseStart || 0),
        contenu: Math.round(nav.domContentLoadedEventEnd || 0),
        charge: Math.round(nav.loadEventEnd || 0),
        parType,
        plusLourds: res.filter((r) => r.taille > 20000).sort((a, b) => b.taille - a.taille).slice(0, 6)
          .map((r) => ({ nom: r.nom.split("/").pop().slice(0, 42), taille: Math.round(r.taille / 1024), type: r.type })),
        base: res.filter((r) => r.nom.includes("supabase")).map((r) => ({
          nom: decodeURIComponent(r.nom.split("/rest/v1/")[1] || r.nom.split("/").slice(-2).join("/")).slice(0, 46),
          duree: r.duree,
        })).sort((a, b) => b.duree - a.duree),
      };
    })()
  `);

  if (!data) {
    console.log(`${page.nom.padEnd(18)} : mesure impossible`);
    continue;
  }

  const total = Object.values(data.parType).reduce((s, t) => s + t.taille, 0);
  const images = data.parType.img?.taille ?? 0;
  const scripts = data.parType.script?.taille ?? 0;
  const feuilles = data.parType.link?.taille ?? 0;
  const requetesBase = data.base?.length ?? 0;
  const plusLenteBase = data.base?.reduce((m, b) => Math.max(m, b.duree), 0) ?? 0;

  console.log(`--- ${page.nom} (${page.chemin}) ---`);
  console.log(`  Affichage        : ${data.ttfb} ms   |   Page prête : ${data.contenu} ms   |   Totale : ${data.charge} ms`);
  console.log(`  Données reçues   : ${ko(total).toFixed(0)} Ko  (dont photos ${ko(images).toFixed(0)} Ko, code ${ko(scripts).toFixed(0)} Ko, styles ${ko(feuilles).toFixed(0)} Ko)`);
  console.log(`  Requêtes base    : ${requetesBase} appel(s), le plus lent ${plusLenteBase} ms`);
  if (data.base?.length) {
    console.log("  Appels base les plus lents :");
    for (const b of data.base.slice(0, 4)) console.log(`     ${String(b.duree).padStart(5)} ms  ${b.nom}`);
  }
  if (data.plusLourds?.length) {
    console.log("  Plus gros fichiers :");
    for (const f of data.plusLourds) console.log(`     ${String(f.taille).padStart(5)} Ko  ${f.type.padEnd(6)} ${f.nom}`);
  }
  console.log("");

  resultats.push({ page: page.nom, total, images, scripts, ms: data.contenu });
}

if (resultats.length) {
  const poidsTotal = resultats.reduce((s, r) => s + r.total, 0);
  const poidsImages = resultats.reduce((s, r) => s + r.images, 0);
  const poidsCode = resultats.reduce((s, r) => s + r.scripts, 0);
  console.log("=== SYNTHÈSE ===");
  console.log(`Photos : ${ko(poidsImages).toFixed(0)} Ko   |   Code : ${ko(poidsCode).toFixed(0)} Ko   |   Total : ${ko(poidsTotal).toFixed(0)} Ko`);
  console.log(
    poidsImages > poidsCode
      ? `\n👉 Ce sont les PHOTOS qui pèsent le plus (${Math.round((poidsImages / poidsTotal) * 100)} % du poids).\n   C'est là qu'il faut agir en priorité : alléger les images profite directement à l'acheteur.\n`
      : `\n👉 C'est le CODE qui pèse le plus (${Math.round((poidsCode / poidsTotal) * 100)} % du poids).\n`,
  );
}

ws.close();
browser.kill();
