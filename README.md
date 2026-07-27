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

Each deployment is fully independent — its own worker, D1, R2 and hostname.
Nothing is shared between them, so running one instance per domain is the
normal case, not a special mode.

## Deployment

Two ways to deploy — both end up with the identical worker:

| | Best for | Where it deploys from |
|---|---|---|
| **One-click button** | trying it out, non-technical setup | a clone of this repo in *your* GitHub, auto-CI |
| **Named instance** | custom domain, multiple deployments, hacking on the code | this repo, from your machine |

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

Deployments live in `instances.jsonc` as [wrangler environments][envs], one
`env.<name>` block per domain. That file is **gitignored** — it holds your
hostnames, database ids and forwarding addresses, and this repo has to stay
public for the deploy button. The tracked template is `instances.example.jsonc`.

[envs]: https://developers.cloudflare.com/workers/wrangler/environments/

Prerequisite: the domain's zone already exists in your Cloudflare account, and
you've run `wrangler login`. Then:

```sh
pnpm instance:new <name>      # prompts, provisions D1 + R2, sets the secrets
pnpm instance:deploy <name>   # builds the SPA and deploys
```

`instance:new` asks for the hostname, your mail domain(s) and which addresses to
accept, creates `<name>-db` and `<name>-email-cache`, writes the `env.<name>`
block, generates a random `AUTH_SECRET`, and prompts for a login password.

`instance:deploy` derives the SPA's public origin from the instance's route, so
`VITE_PUBLIC_ORIGIN` never has to be set by hand. Useful flags:

```sh
pnpm instance:deploy <name> --dry-run          # resolve everything, upload nothing
pnpm instance:deploy <name> --skip-migrations  # DB predates D1 migration bookkeeping
```

`wrangler.jsonc` and `instances.jsonc` each carry the same structural block
(wrangler has no `extends`). `pnpm check:config` fails if the two drift, and it
runs as part of `pnpm typecheck`.

## Configuration reference

### Required

| Name | Type | What it does | How to get it |
|---|---|---|---|
| `AUTH_PASSWORD` | secret | password for the login screen | **you choose** — long and random |
| `AUTH_SECRET` | secret | signs the session cookie | **generate:** `openssl rand -hex 32` |
| `ALIAS_DOMAINS` | var | comma-separated domain(s) you receive mail on | your domain(s), e.g. `example.com` |

Login **fails closed** if either secret is missing — there is no default signing
key. Use a different `AUTH_SECRET` per instance: sessions carry no identity, so
a shared secret makes cookies interchangeable between deployments.

### Optional

| Name | Type | What it does | Default |
|---|---|---|---|
| `ALLOWED_EMAILS` | var | which addresses on your domains to accept; `*` is a wildcard | empty = **accept every address** |
| `ALIAS_SUFFIX` | var | shape of addresses the alias generator suggests, `<name>.<suffix>@<domain>` | empty = `<name>@<domain>` |
| `REPLY_FROM` | var | from-address for compose when no alias applies | `reply@<first ALIAS_DOMAINS entry>` |
| `FORWARD_TO` | var | also forward accepted mail to this address | off; must be verified under Email Routing → Destination addresses |
| `FALLBACK_FORWARD_TO` | var | where rejected mail goes | off = reject |
| `VAPID_SUBJECT` | var | web push contact, a `mailto:` URI | empty = push disabled |
| `VAPID_PRIVATE_JWK` | secret | web push signing key | **generate:** `pnpm generate-vapid` |
| `ANTHROPIC_API_KEY` | secret | AI features (summarize, smart reply) | [console.anthropic.com](https://console.anthropic.com) |
| `AI_MODEL` | secret/var | model for AI features | `claude-haiku-4-5` |

### Which mail gets accepted

Two vars decide, in order:

1. **`ALIAS_DOMAINS`** — the recipient's domain must be listed, or the mail is
   rejected (or sent to `FALLBACK_FORWARD_TO`). This is the hard boundary.
2. **`ALLOWED_EMAILS`** — empty accepts *every* address on those domains, which
   makes the inbox a true catch-all. Otherwise the recipient must match an
   entry, where `*` matches any run of characters.

So `ALLOWED_EMAILS="*.mail@example.com"` accepts only `<anything>.mail@example.com`,
and leaving it empty accepts everything on `example.com`.

`ALIAS_SUFFIX` does **not** affect this — it only shapes the addresses the alias
generator suggests in the UI.

### Derived — you never set these

| Name | Where it comes from |
|---|---|
| the VAPID public key | derived from `VAPID_PRIVATE_JWK`, so the pair can't drift |
| `VITE_PUBLIC_ORIGIN` | derived from the instance's route by `pnpm instance:deploy` |
| `DB`, `EMAIL_CACHE`, `EMAIL`, `ASSETS` bindings | declared in the wrangler config; `instance:new` (or the one-click flow) provisions the resources |
| D1 `database_id` | written by `instance:new`; the one-click flow writes it for you |

Secrets go in via `wrangler secret put <NAME> -c instances.jsonc -e <name>`
(one-click: Worker → Settings → Variables and Secrets); vars live in the
wrangler/instance config.

## Connect your domain's email (manual, ~2 minutes)

Receiving mail can't be provisioned by deploy tooling yet — wire it in the
Cloudflare dashboard for each domain in `ALIAS_DOMAINS`:

1. Zone → **Email → Email Routing** → enable it (Cloudflare adds the MX/SPF
   records for you).
2. **Routing rules** → **Catch-all** → action **Send to a Worker** → pick your
   worker. Catch-all is safe: mail that fails the checks above is rejected or
   forwarded to `FALLBACK_FORWARD_TO`. But note that with `ALLOWED_EMAILS`
   empty, "fails the checks" only means *wrong domain* — every address on your
   own domains will be ingested, spam included.
3. Outbound sending, once per sending domain:
   `pnpm exec wrangler email sending enable <domain>` — and any
   `FORWARD_TO`/`FALLBACK_FORWARD_TO` destination must be verified under
   Email Routing → Destination addresses.

Then open the app, log in with `AUTH_PASSWORD`, and generate your first alias.

## Local development

```sh
pnpm install

# 1. API worker — local D1, never touches production
wrangler login                  # once, for deploys
cp .dev.vars.example .dev.vars  # set AUTH_PASSWORD + AUTH_SECRET
pnpm db:local                   # apply migrations to the local D1
pnpm dev:api                    # → http://localhost:8787

# 2. SPA (Vite proxies /api → :8787)
pnpm dev                        # → http://localhost:5173
```

Log in with `AUTH_PASSWORD`.

To work against a real instance's remote D1/R2 instead — real data, real
writes — name it explicitly: `pnpm dev:api:remote <name>`.

```sh
pnpm test         # inbound-gate and VAPID-derivation unit tests
pnpm typecheck    # config drift check + tsc across the workspace
```

## Keyboard shortcuts

`/` search · `g i/s/e/t/n` switch view · in a message: `r` reply, `e` archive,
`s` star, `#` trash, `Esc` back. Swipe a row left to archive.
