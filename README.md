# Driftmail — `email-client-v2`

A Gmail-like email client with smooth motion, running entirely on Cloudflare:
one Worker serves the SPA, the JSON API, inbound email ingestion (Email
Routing), and the undo-send cron.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Rajveer-Mahida/claoudflare-email-client-v2)

- **`apps/web`** — Vite + React 19 SPA (TanStack Router + Query, Tailwind v4,
  Framer Motion). Pure static assets, zero SSR.
- **`apps/api`** — Hono Cloudflare Worker: JSON API + Email Routing handler +
  scheduled sends. D1 for mail/labels/aliases, R2 for raw `.eml` + attachments.
- **`packages/shared`** — the TypeScript JSON contract shared by both.

## Architecture

```
<host>/api/*  → Hono worker (run_worker_first)
<host>/*      → built SPA assets (single-page-application fallback)
inbound mail  → Email Routing → the same worker's email() handler → D1 + R2
```

Single worker, single hostname; the session cookie stays same-origin.

## Deploy your own (one click)

Click the **Deploy to Cloudflare** button above. Cloudflare clones this repo
into your GitHub/GitLab account, provisions a fresh **D1 database** and **R2
bucket**, prompts for the variables/secrets below, builds the SPA, runs the D1
migrations, and deploys the worker to `https://driftmail.<your-subdomain>.workers.dev`.

During setup you'll be asked for:

| Value | Required | What it does |
|---|---|---|
| `AUTH_PASSWORD` (secret) | yes | password for the login screen |
| `AUTH_SECRET` (secret) | yes | signs the session cookie — `openssl rand -hex 32` |
| `ALIAS_DOMAINS` | for mail | comma-separated domain(s) you receive mail on |
| `ALIAS_SUFFIX` | no | aliases look like `<name>.<suffix>@<domain>` (default `mail`; empty = no suffix) |
| `REPLY_FROM` | for sending | from-address used for replies/compose |

Optional features are enabled by secrets you add **after** deploy (Worker →
Settings → Variables and Secrets, or `wrangler secret put …`):

| Secret | Enables |
|---|---|
| `ANTHROPIC_API_KEY` | AI features (summarize, smart reply) |
| `VAPID_PRIVATE_JWK` (+ `VAPID_PUBLIC_KEY` var) | web push — generate both with `node scripts/generate-vapid.mjs` |

### Connect your domain's email (manual, ~2 minutes)

Receiving mail can't be provisioned by the deploy button yet — wire it in the
Cloudflare dashboard for each domain in `ALIAS_DOMAINS`:

1. Zone → **Email → Email Routing** → enable it (Cloudflare adds the MX/SPF
   records for you).
2. **Routing rules** → **Catch-all** → action **Send to a Worker** → pick the
   `driftmail` worker. (Mail that doesn't match your alias pattern is rejected
   or forwarded to `FALLBACK_FORWARD_TO`, so catch-all is safe.)
3. For replies/compose: `REPLY_FROM` must be on a zone with Email Routing
   enabled, and any `FORWARD_TO`/`FALLBACK_FORWARD_TO` destination address must
   be verified under Email Routing → Destination addresses.

Then open the app, log in with `AUTH_PASSWORD`, and generate your first alias.

Notes:

- The deploy button only works while the repository is public.
- Migrations are idempotent — redeploys re-run `wrangler d1 migrations apply DB`
  safely.
- To use your own hostname later: Worker → Settings → Domains & Routes → add a
  custom domain.

## Local development

```sh
pnpm install

# 1. API worker (needs Cloudflare auth for --remote D1/R2 access)
wrangler login                       # once
cp .dev.vars.example apps/api/.dev.vars   # set AUTH_PASSWORD + AUTH_SECRET
pnpm dev:api                         # → http://localhost:8787

# 2. SPA (Vite proxies /api → :8787)
pnpm dev                             # → http://localhost:5173
```

Log in with `AUTH_PASSWORD`.

## Deploy (maintainer instance)

The root `wrangler.jsonc` is the one-click template; Rajveer's instance deploys
from `apps/api/wrangler.jsonc` (custom domain + existing D1/R2):

```sh
# secrets (once)
cd apps/api
wrangler secret put AUTH_SECRET
wrangler secret put AUTH_PASSWORD

pnpm build            # SPA → apps/web/dist (served as worker assets)
pnpm deploy:api
```

## Keyboard shortcuts

`/` search · `g i/s/e/t/n` switch view · in a message: `r` reply, `e` archive,
`s` star, `#` trash, `Esc` back. Swipe a row left to archive.
