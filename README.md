# Driftmail — `email-client-v2`

A brand-new Gmail-like email client with smooth motion, built as a clean
**frontend / worker split** that reuses the existing email data.

- **`apps/web`** — Vite + React 19 SPA (TanStack Router + Query, Tailwind v4,
  Framer Motion). Pure static assets, zero SSR.
- **`apps/api`** — Hono Cloudflare Worker exposing a JSON API. Binds the
  **existing** D1 `cf-email-alies` + R2 `smi-email-cache` — same inbox, no migrations.
- **`packages/shared`** — the TypeScript JSON contract shared by both.

The legacy `Email Alias Web` project (Next.js app + email-ingest worker) is left
untouched. The email-ingest worker keeps receiving mail into the same D1/R2 and
remains the **single owner** of the undo-send cron.

## Architecture

```
mail.<domain>/api/*  → smi-mail-api   (Hono worker, JSON only)
mail.<domain>/*      → smi-mail-web   (static SPA assets)
```

Single hostname + path routing keeps the `smi_session` HMAC cookie same-origin.

## Local development

```sh
pnpm install

# 1. API worker (needs Cloudflare auth for --remote D1/R2 access)
wrangler login                       # once
cp apps/api/.dev.vars.example apps/api/.dev.vars   # set AUTH_PASSWORD
pnpm dev:api                         # → http://localhost:8787

# 2. SPA (Vite proxies /api → :8787)
pnpm dev                             # → http://localhost:5173
```

Log in with `AUTH_PASSWORD`. The inbox loads the existing emails from D1.

## Deploy

```sh
# secrets (once)
cd apps/api
wrangler secret put AUTH_SECRET      # match legacy worker to keep sessions valid
wrangler secret put AUTH_PASSWORD

pnpm deploy:api                      # smi-mail-api
pnpm deploy:web                      # builds + uploads smi-mail-web assets
```

Then add two **Workers Routes** on the zone:
`mail.<domain>/api/*` → `smi-mail-api`, and `mail.<domain>/*` → `smi-mail-web`.

## Keyboard shortcuts

`/` search · `g i/s/e/t/n` switch view · in a message: `r` reply, `e` archive,
`s` star, `#` trash, `Esc` back. Swipe a row left to archive.

## Notes / cutover

- Undo-send cron stays on the legacy email worker only (avoids double-send).
- Both old and new apps run against the same D1 — coexist until you cut over.
- Bundle is a single chunk (~215 KB gz); code-split later if needed.
