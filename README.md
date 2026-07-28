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

Either way, [connecting your domain's email](#connect-your-domains-email) is a
separate step at the end — but it is one command, not dashboard clicking.

### Option A — one click

Click **Deploy to Cloudflare** above. Cloudflare clones this repo into your
GitHub/GitLab account, provisions a fresh **D1 database** and **R2 bucket**,
prompts for the required values below, builds the SPA, runs the D1 migrations,
and deploys to `https://driftmail.<your-subdomain>.workers.dev`.

The form asks for exactly three things: `ALIAS_DOMAINS`, `AUTH_SECRET` and
`AUTH_PASSWORD`. Cloudflare marks **every** declared var as required — there is
no optional-var concept — so the optional vars are deliberately left out of
`wrangler.jsonc` and added later if you want them.

Notes:

- The button only works while the repository is public.
- Migrations are idempotent — redeploys re-run them safely.
- Not sure of your domain yet? `ALIAS_DOMAINS` accepts `*`.
- See [Domains and DNS](#domains-and-dns) for how a hostname and the mail
  records actually get attached.

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
| `ALIAS_DOMAINS` | var | comma-separated domain(s) you receive mail on; entries may be globs | your domain(s), e.g. `example.com`, or `*` for any |

These three are the only fields the one-click deploy form asks for. Cloudflare
marks **every** declared var as required, so the optional vars below are
deliberately left out of `wrangler.jsonc` — add the ones you want afterwards
under Worker → Settings → Variables and Secrets.

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

1. **`ALIAS_DOMAINS`** — the recipient's domain must match an entry, or the mail
   is rejected (or sent to `FALLBACK_FORWARD_TO`). Entries may be globs, so `*`
   accepts any domain and `*.example.com` accepts every subdomain. `*` is still
   safe: Cloudflare only routes mail for zones you actually own.
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

## Connect your domain's email

One command, per instance:

```sh
pnpm instance:mail <name>            # domains + worker read from instances.jsonc
pnpm instance:mail <name> --dry-run  # print the commands, run nothing
```

For a worker deployed with the one-click button (no `instances.jsonc` entry):

```sh
pnpm instance:mail --domain example.com --worker driftmail
```

It shows exactly what will change and asks **y/N** first, because this writes DNS
records and redirects real mail. `pnpm instance:new` offers the same step at the
end. Under the hood, per domain:

```sh
wrangler email routing enable <domain>          # adds and locks the MX + SPF records
wrangler email routing rules update <domain> catch-all \
    --action-type worker --action-value <worker> --enabled
wrangler email sending enable <domain>          # outbound (compose/reply)
```

Catch-all is safe: mail failing the checks above is rejected or forwarded to
`FALLBACK_FORWARD_TO`. But note that with `ALLOWED_EMAILS` empty, "fails the
checks" only means *wrong domain* — every address on your own domains will be
ingested, spam included.

Any `FORWARD_TO`/`FALLBACK_FORWARD_TO` destination must still be verified under
Email Routing → Destination addresses.

## Domains and DNS

The two things people expect to be linked are not:

> **The web hostname and the mail domain are independent.** Email Routing selects
> workers by *account*, not by hostname, so mail for `example.com` is delivered to
> a worker still sitting on `workers.dev`. **You do not need a custom domain for
> email to work.**

| What | How it gets set up |
|---|---|
| **Web hostname** | The button always deploys to `<worker>.<subdomain>.workers.dev` — its form has no custom-domain field. Attach one afterwards: Worker → Settings → Domains & Routes → **Add Custom Domain**. Cloudflare creates that DNS record itself. The zone must be in your account. For instances, `routes[].pattern` in `instances.jsonc` does it at deploy time. |
| **Mail records (MX, SPF, DKIM)** | Created by enabling Email Routing — `pnpm instance:mail` above, or the dashboard. Never hand-written. Inspect them with `wrangler email routing dns get <domain>`. |

Requirements: the domain must be a zone in your Cloudflare account using
Cloudflare DNS. Propagation is usually 5–15 minutes.

### Managing domains from inside the app (optional)

If you only ever clicked the deploy button, you can do all of the above from
Settings → **Domains** instead of a terminal. It is off unless you set a
`CF_TOKEN` secret on the worker; without it every `/api/domains` route returns
503 and the section is hidden.

| Var | What it is |
|---|---|
| `CF_TOKEN` | secret — a Cloudflare API token |
| `CF_ACCOUNT_ID` | optional, only needed when the token spans several accounts |
| `CF_WORKER_NAME` | must match the deployed Worker name (default `driftmail`) — it is the value sent to the routing-rule API, and a Worker cannot read its own script name |

Token scopes: `Zone:Read`, `Email Routing Rules:Edit`,
`Email Routing Addresses:Edit`, plus `DNS:Edit` and `DNS Settings:Edit` so it can
create the MX/SPF records.

> **Understand what this stores.** That token lets the app edit DNS on your
> zones, and it sits behind a single shared password. Anyone who gets into the
> app can repoint your MX or pass a DNS-01 challenge — that is domain takeover,
> not just mail access. Scope the token to the specific zones you use, keep
> `AUTH_PASSWORD` long and random, and leave `CF_TOKEN` unset if you are happy
> using `pnpm instance:mail` from a terminal.

None of these are declared in `wrangler.jsonc` or `.dev.vars.example` on purpose:
anything listed there becomes a **required** field in the deploy form. Add them
after deploying, under Worker → Settings → Variables and Secrets.

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
pnpm test         # inbound-gate, header-parsing and VAPID-derivation unit tests
pnpm typecheck    # config drift check + tsc across the workspace
```

## Command reference

| Command | What it does |
|---|---|
| `pnpm instance:new <name>` | provisions D1 + R2, writes `env.<name>`, sets the secrets, offers to wire up mail |
| `pnpm instance:deploy <name>` | builds with the right origin, migrates, deploys (`--dry-run`, `--skip-migrations`) |
| `pnpm instance:mail <name>` | enables Email Routing, points the catch-all at the worker, enables sending (`--dry-run`) |
| `pnpm dev` / `pnpm dev:api` | SPA on :5173, worker on :8787 against a **local** D1 |
| `pnpm dev:api:remote <name>` | worker against a real instance's remote D1/R2 |
| `pnpm db:local` | apply migrations to the local D1 |
| `pnpm check:config` | fail if `wrangler.jsonc` and `instances.jsonc` have drifted |
| `pnpm generate-vapid` | print a VAPID private JWK for web push |

## Keyboard shortcuts

`/` search · `g i/s/e/t/n` switch view · in a message: `r` reply, `e` archive,
`s` star, `#` trash, `Esc` back. Swipe a row left to archive.
