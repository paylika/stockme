/**
 * VÉRIFICATION DE LA CONNEXION DANS UN VRAI NAVIGATEUR.
 *
 *   npm run session            → teste la production (stockme.store)
 *   npm run session -- --local → teste http://localhost:3000
 *
 * À LANCER AVANT CHAQUE ENVOI ET APRÈS CHAQUE DÉPLOIEMENT.
 *
 * POURQUOI CE FICHIER EXISTE : les utilisateurs se plaignaient de « sauter » et
 * d'être déconnectés tout seuls, surtout sur téléphone. La cause était double :
 *   1. une page protégée chargée DIRECTEMENT (lien, rechargement, retour sur
 *      l'onglet) n'exécutait pas le contrôle d'accès, et s'affichait donc vide ;
 *   2. une session momentanément illisible était prise pour une déconnexion.
 * Ces deux pannes ne se voient PAS dans un test d'URL : il faut un navigateur,
 * un vrai chargement de page et une vraie session. C'est ce que fait ce script.
 *
 * Les 5 scénarios testés sont les situations réelles du quotidien mobile.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const LOCAL = process.argv.includes("--local");
const SITE = LOCAL ? "http://localhost:3000" : "https://stockme.store";
const PORT = 9333;

/** Navigateur : variable d'environnement, sinon les emplacements habituels. */
const BROWSERS = [
  process.env.STOCKME_BROWSER,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);
const BROWSER = BROWSERS.find((p) => existsSync(p));
if (!BROWSER) {
  console.log("\n🟠 Navigateur introuvable : test de connexion ignoré.");
  console.log("   Indiquez-le avec  $env:STOCKME_BROWSER = \"chemin\\vers\\msedge.exe\"\n");
  process.exit(0);
}

const client = readFileSync(new URL("../src/integrations/supabase/stockme-client.ts", import.meta.url), "utf8");
const SB_URL = /STOCKME_SUPABASE_URL = "([^"]+)"/.exec(client)?.[1];
const ANON = /STOCKME_SUPABASE_ANON_KEY =\s*\n?\s*"([^"]+)"/.exec(client)?.[1];
const KEY = `sb-${new URL(SB_URL).hostname.split(".")[0]}-auth-token`;

const results = [];
const ok = (n, d = "") => results.push({ ok: true, n, d });
const ko = (n, d = "") => results.push({ ok: false, n, d });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log(`\n=== CONNEXION — ${SITE} ===\n`);

/* ---------- Une vraie session, comme celle d'un utilisateur connecté ---------- */
const email = "verification-auto@stockme.test";
const password = "StockMe-Verification-2026!";
const payload = JSON.stringify({ email, password });
const headers = { apikey: ANON, "Content-Type": "application/json" };

let auth = null;
try {
  let r = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, { method: "POST", headers, body: payload });
  let j = await r.json();
  if (!j?.access_token) {
    r = await fetch(`${SB_URL}/auth/v1/signup`, { method: "POST", headers, body: payload });
    j = await r.json();
  }
  if (j?.access_token) {
    auth = {
      access_token: j.access_token,
      refresh_token: j.refresh_token,
      expires_at: j.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
      token_type: "bearer",
      user: j.user,
    };
  }
} catch {
  /* traité ci-dessous */
}
if (!auth) {
  console.log("❌ Impossible d'obtenir une session de vérification (réseau ou compte).\n");
  process.exit(1);
}
console.log(`Compte de vérification : ${auth.user?.email}\n`);

/* ---------- Navigateur piloté par le protocole de débogage ---------- */
const dir = mkdtempSync(join(tmpdir(), "stockme-session-"));
const browser = spawn(BROWSER, [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${dir}`,
  "about:blank",
], { stdio: "ignore" });

let list = [];
for (let i = 0; i < 40 && !list.length; i++) {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
    if (r.ok) list = await r.json();
  } catch {
    /* démarrage en cours */
  }
  if (!list.length) await sleep(500);
}
if (!list.length) {
  console.log("❌ Le navigateur n'a pas démarré.\n");
  browser.kill();
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
  const res = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  return res.result?.result?.value;
};

await send("Page.enable");
await send("Runtime.enable");

/** Attend que la page soit réellement stabilisée avant de juger. */
const settle = async (maxMs = 20000) => {
  const start = Date.now();
  let last = "";
  let stable = 0;
  while (Date.now() - start < maxMs) {
    const state = await evaluate(
      `({ url: location.pathname + location.search, ready: document.readyState, len: document.body ? document.body.innerText.length : 0 })`,
    );
    const sig = `${state?.url}|${state?.ready}|${state?.len}`;
    if (sig === last && state?.ready === "complete") {
      stable++;
      if (stable >= 2) break;
    } else stable = 0;
    last = sig;
    await sleep(700);
  }
};

/**
 * Chargement DIRECT d'une page : exactement ce que fait un utilisateur qui
 * ouvre un lien ou revient sur son onglet (et ce que fait un téléphone à chaque
 * changement d'application).
 */
const hardLoad = async (path, waitMs = 9000) => {
  await send("Page.navigate", { url: "about:blank" });
  await sleep(600);
  await send("Page.navigate", { url: `${SITE}${path}` });
  await sleep(3000);
  await settle();
  await sleep(3000);
  return evaluate(`({ path: location.pathname, text: document.body.innerText, keys: Object.keys(localStorage) })`);
};

/** La page affiche-t-elle vraiment les données de l'utilisateur ? */
const hasData = (t) => /Portefeuille|produit\(s\)|Déconnexion|Mon profil/i.test(t ?? "");

await send("Page.navigate", { url: `${SITE}/` });
await sleep(4000);

/* TEST 1 — session valide : la page doit s'afficher AVEC ses données */
await evaluate(`localStorage.setItem(${JSON.stringify(KEY)}, ${JSON.stringify(JSON.stringify(auth))})`);
let state = await hardLoad("/profile");
if (state?.path?.startsWith("/profile") && hasData(state.text)) {
  ok("Session valide : le profil s'affiche avec ses données");
} else {
  ko("Session valide : le profil s'affiche avec ses données", `chemin ${state?.path} — « ${(state?.text ?? "").slice(0, 70).replace(/\s+/g, " ")} »`);
}

/* TEST 2 — LE PLUS IMPORTANT : supabase-js perd la session (cas du mobile) */
await evaluate(`
  (() => {
    const s = localStorage.getItem(${JSON.stringify(KEY)});
    if (s) localStorage.setItem("stockme.auth.backup", s);
    localStorage.removeItem(${JSON.stringify(KEY)});
    return true;
  })()
`);
state = await hardLoad("/profile");
if (state?.path?.startsWith("/profile") && hasData(state.text)) {
  ok("Session perdue par le code : l'utilisateur RESTE connecté");
} else {
  ko("Session perdue par le code : l'utilisateur RESTE connecté", `déconnecté (chemin ${state?.path})`);
}

/* TEST 3 — aucune session : la protection doit renvoyer vers la connexion */
await evaluate(`localStorage.clear()`);
state = await hardLoad("/dashboard");
if (state?.path?.startsWith("/auth")) {
  ok("Sans session : page protégée renvoyée vers la connexion");
} else {
  ko("Sans session : page protégée renvoyée vers la connexion", `page affichée quand même (${state?.path})`);
}

/* TEST 4 — la console d'administration reste fermée */
state = await hardLoad("/admin");
if (!state?.path?.startsWith("/admin") && !/Console admin/i.test(state?.text ?? "")) {
  ok("Console admin fermée sans droits");
} else {
  ko("Console admin fermée sans droits", `affichée (${state?.path})`);
}

/* TEST 5 — le site public reste accessible */
state = await hardLoad("/");
if (/StockMe/.test(state?.text ?? "")) ok("Site public accessible sans session");
else ko("Site public accessible sans session", "page vide");

ws.close();
browser.kill();

console.log("");
let failed = 0;
for (const r of results) {
  console.log(`${r.ok ? "✅" : "❌"}  ${r.n}${r.d ? `  —  ${r.d}` : ""}`);
  if (!r.ok) failed++;
}
console.log(failed === 0 ? "\n🟢 CONNEXION STABLE\n" : `\n🔴 ${failed} PROBLÈME(S) DE CONNEXION\n`);
process.exit(failed ? 1 : 0);
