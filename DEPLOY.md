# Déploiement de StockMe

App : marketplace B2B Afrique de l'Ouest — React 19 + TanStack Start (SSR) + Supabase.
Cible : **Cloudflare Workers**. Base de données : **Supabase** (projet `minnkepmfqnbmcreojor`, déjà à toi).

> ℹ️ Aucun secret n'est nécessaire au runtime : l'app utilise la clé Supabase **anon publique**
> (protégée par RLS), codée en dur dans `src/integrations/supabase/stockme-client.ts`.

---

## Prérequis (une seule fois)

- Un compte **Cloudflare** (gratuit) : https://dash.cloudflare.com/sign-up
- Le repo GitHub : https://github.com/paylika/stockme

---

## Méthode A — Auto-deploy via GitHub (recommandé)

Chaque `git push` redéploie automatiquement.

1. Dashboard Cloudflare → **Workers & Pages** → **Create** → onglet **Workers** → **Import a repository** → connecter GitHub → choisir **paylika/stockme**.
2. Réglages de build :
   - **Build command** : `npm run build`
   - **Deploy command** : `npx wrangler deploy -c .output/server/wrangler.json`
   - **Root directory** : `/` (laisser par défaut)
3. **Save and Deploy**.

À chaque `git push origin main`, Cloudflare rebuild et redéploie tout seul.

---

## Méthode B — Deploy manuel depuis ton PC

```bash
# 1. Se connecter à Cloudflare (ouvre le navigateur, une seule fois)
npx wrangler login

# 2. Builder
npm run build

# 3. Déployer
npx wrangler deploy -c .output/server/wrangler.json
```

Le site sera en ligne sur `https://stockme.<ton-sous-domaine>.workers.dev`.
Répéter les étapes 2 et 3 à chaque mise à jour.

---

## Domaine personnalisé (optionnel)

Dashboard Cloudflare → le Worker `stockme` → **Settings** → **Domains & Routes** →
**Add custom domain** (ex : `stockme.sn` ou `app.stockme.com`).

---

## Workflow de développement

```bash
npm install        # une fois
npm run dev        # dev local (http://localhost:3000)
npm run build      # build de production
npm run preview    # prévisualiser le build de prod en local
```

---

## Base de données (Supabase)

Les migrations SQL sont dans `supabase/migrations/`. Pour appliquer des changements de
schéma sur le projet Supabase, utiliser le [Supabase CLI](https://supabase.com/docs/guides/cli)
avec ton access token (à garder secret, jamais dans le repo).
