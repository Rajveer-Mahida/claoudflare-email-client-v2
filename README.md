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

## Deployment

Two ways to deploy — both end up with the identical worker:

| | Best for | Where it deploys from |
|---|---|---|
| **One-click button** | trying it out, non-technical setup | a clone of this repo in *your* GitHub, auto-CI |
| **Named instance** (`instances/`) | custom domain, multiple deployments, hacking on the code | this repo, from your machine |

Either way, [connecting your domain's email](#connect-your-domains-email-manual-2-minutes)
is a short manual step at the end — Cloudflare doesn't let deploy tooling
enable Email Routing for you yet.

### Option A — one click

Click **Deploy to Cloudflare** above. Cloudflare clones this repo into your
GitHub/GitLab account, provisions a fresh **D1 database** and **R2 bucket**,
prompts for the required values below, builds the SPA, runs the D1 migrations,
and deploys to `https://driftmail.<your-subdomain>.workers.dev`.

Notes:

- The button only works while the repository is public.
- Migrations are idempotent — redeploys re-run them safely.
- Custom hostname later: Worker → Settings → Domains & Routes → add a custom
  domain (the zone must be in your account).

### Option B — named instance on your own domain

Each deployment is one config file in `instances/`. Prerequisite: the domain's
zone already exists in your Cloudflare account, and you've run `wrangler login`.

```sh
cp instances/_template.jsonc instances/<name>.jsonc   # fill in name/route/vars

# provision (once per instance)
pnpm exec wrangler d1 create <name>-db                # paste database_id into the file
pnpm exec wrangler r2 bucket create <name>-email-cache
pnpm exec wrangler d1 migrations apply DB --remote -c instances/<name>.jsonc

# secrets (once — see the reference table below)
pnpm exec wrangler secret put AUTH_SECRET -c instances/<name>.jsonc
pnpm exec wrangler secret put AUTH_PASSWORD -c instances/<name>.jsonc

# build + deploy (attaches the custom domain)
VITE_PUBLIC_ORIGIN=https://<host> pnpm build
pnpm exec wrangler deploy -c instances/<name>.jsonc
```

Instances are fully independent — separate worker, D1, R2, and hostname. The
maintainer's own instance is just `instances/smi-mail.jsonc`, deployed via
`pnpm deploy:smi`.

## Configuration reference

### Required

| Name | Type | What it does | How to get it |
|---|---|---|---|
| `AUTH_PASSWORD` | secret | password for the login screen | **you choose** — long and random |
| `AUTH_SECRET` | secret | signs the session cookie | **generate:** `openssl rand -hex 32` |
| `ALIAS_DOMAINS` | var | comma-separated domain(s) you receive mail on | your domain(s), e.g. `example.com` |
| `REPLY_FROM` | var | from-address for replies/compose | e.g. `reply@example.com` — must be on a zone with Email Routing enabled |

### Optional

| Name | Type | What it does | Default / how to get it |
|---|---|---|---|
| `ALIAS_SUFFIX` | var | aliases look like `<name>.<suffix>@<domain>` | `mail`; empty = no suffix segment |
| `FORWARD_TO` | var | also forward accepted mail to this address | off; must be verified under Email Routing → Destination addresses |
| `FALLBACK_FORWARD_TO` | var | where mail matching no alias goes | off = reject |
| `ANTHROPIC_API_KEY` | secret | AI features (summarize, smart reply) | [console.anthropic.com](https://console.anthropic.com) |
| `AI_MODEL` | var | model for AI features | `claude-haiku-4-5` |
| `VAPID_PUBLIC_KEY` | var | web push notifications | **generate:** `pnpm generate-vapid` (prints both keys) |
| `VAPID_PRIVATE_JWK` | secret | web push signing key | same `pnpm generate-vapid` run |
| `VAPID_SUBJECT` | var | push contact, `mailto:` URI | e.g. `mailto:you@example.com` |
| `ACCESS_TEAM_DOMAIN` | var | Cloudflare Access mode (replaces password login) | your team domain, e.g. `you.cloudflareaccess.com` |
| `ACCESS_AUD` | var | Access application audience tag | shown when you create the Access app for the hostname |
| `ALLOWED_EMAILS` | var | comma-separated Access allowlist | empty = any Access-verified email |

### Auto-generated / derived — you never set these by hand

| Name | Where it comes from |
|---|---|
| `AUTH_SECRET` value | one command: `openssl rand -hex 32` |
| `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_JWK` | one command: `pnpm generate-vapid` |
| `ALIAS_PATTERN` | derived at runtime from `ALIAS_DOMAINS` + `ALIAS_SUFFIX`; only set it to override the alias shape |
| `DB`, `EMAIL_CACHE`, `EMAIL`, `ASSETS` bindings | declared in the wrangler config; the one-click flow (or `wrangler d1 create` / `r2 bucket create`) provisions the resources |
| D1 `database_id` | printed by `wrangler d1 create`; the one-click flow writes it for you |

Secrets go in via `wrangler secret put <NAME>` (one-click: Worker → Settings →
Variables and Secrets); vars live in the wrangler/instance config.

## Connect your domain's email (manual, ~2 minutes)

Receiving mail can't be provisioned by deploy tooling yet — wire it in the
Cloudflare dashboard for each domain in `ALIAS_DOMAINS`:

1. Zone → **Email → Email Routing** → enable it (Cloudflare adds the MX/SPF
   records for you).
2. **Routing rules** → **Catch-all** → action **Send to a Worker** → pick your
   worker (`driftmail` or your instance name). (Mail that doesn't match your
   alias pattern is rejected or forwarded to `FALLBACK_FORWARD_TO`, so
   catch-all is safe.)
3. Outbound sending, once per sending domain:
   `pnpm exec wrangler email sending enable <domain>` — and any
   `FORWARD_TO`/`FALLBACK_FORWARD_TO` destination must be verified under
   Email Routing → Destination addresses.

Then open the app, log in with `AUTH_PASSWORD`, and generate your first alias.

## Local development

```sh
pnpm install

# 1. API worker (needs Cloudflare auth for --remote D1/R2 access)
wrangler login                            # once
cp .dev.vars.example instances/.dev.vars  # set AUTH_PASSWORD + AUTH_SECRET
pnpm dev:api                              # → http://localhost:8787

# 2. SPA (Vite proxies /api → :8787)
pnpm dev                                  # → http://localhost:5173
```

Log in with `AUTH_PASSWORD`.

## Keyboard shortcuts

`/` search · `g i/s/e/t/n` switch view · in a message: `r` reply, `e` archive,
`s` star, `#` trash, `Esc` back. Swipe a row left to archive.
