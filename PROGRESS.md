# Driftmail — Progress Tracker

Live: **https://mail.rajveer.space** (also `smi-mail.spidydev.workers.dev`)
Single Cloudflare Worker `smi-mail`: SPA (Vite/React 19) + Hono JSON API + inbound email ingest + undo-send/scheduled cron, on the existing D1 `cf-email-alies` + R2 `smi-email-cache`.

## ✅ Completed

### Foundation
- [x] Monorepo: `apps/web` (Vite SPA), `apps/api` (Hono worker), `packages/shared` (types)
- [x] Clean worker/frontend split, single worker serves both on one host
- [x] Cutover: legacy Next.js + email workers deleted; `smi-mail` owns everything
- [x] Inbox views (inbox/starred/snoozed/archived/sent/trash), labels, threads
- [x] Read/unread, star, archive, snooze, trash, bulk actions, optimistic UI
- [x] Reply + undo-send, reply-from-alias
- [x] Attachments (download, inline cid, per-thread)
- [x] App dark mode + per-email dark reading mode (invert filter)
- [x] Mobile drawer, swipe-to-archive, Framer Motion animations
- [x] HMAC cookie auth, login gate

### Phase 1 — Compose & sending
- [x] New compose (docked panel), forward, reply-all, CC/BCC
- [x] Outgoing attachments (R2 upload → send)
- [x] Drafts (autosave, Drafts view, resume/delete)
- [x] Signature (Settings editor, auto-appended)
- [x] Send-later (schedule) + 8s undo flush

### Phase 2 — Managed aliases
- [x] Alias registry (`/aliases`): create named/custom/generated, notes, copy
- [x] Mail counts per alias, auto-track on first inbound
- [x] Disable/burn (bounces inbound), delete (keeps mail)
- [x] "View inbox" filter by alias

### Phase 3 — Privacy + scheduled send
- [x] Block remote tracker images by default (cid/inline kept)
- [x] Per-email "Show in this email" (persists) + per-sender "Always allow" + global toggle
- [x] Scheduled-send badge + Cancel in reading pane; reply send-later

### Phase 4 — Filters / rules
- [x] Rules engine: if from/to/subject contains/is/starts/ends → label/archive/read/trash
- [x] Applied on ingest + "Run on existing" (last 1000)
- [x] Rules builder in Settings

### Phase 5 — Search + performance
- [x] Search operators: `from:` `to:` `subject:` `has:attachment` `is:unread|read|starred` + free-text FTS
- [x] Infinite scroll (past the 50 cap, IntersectionObserver)
- [x] Route code-splitting (lazy) + vendor chunks (main bundle 677KB → ~266KB)

### Phase 6 — Command palette + shortcuts
- [x] ⌘K / Ctrl-K command palette (cmdk): go-to, actions, labels, search
- [x] Keyboard help dialog (`?`)
- [x] Shortcuts: `c` compose, `/` search, `g i/s/n/e/t` views, `j/k` row nav + Enter, in-message `r/e/s/#/Esc`

### Phase 7 — Web push + PWA
- [x] Installable PWA (manifest + service worker + icons)
- [x] Web Push (VAPID, no-payload) → new-mail notification on the SW
- [x] Subscribe/unsubscribe API + `push_subscriptions` table
- [x] Settings "New-mail notifications" enable/disable

## ⏳ Remaining

### Phase 8 — AI (summarize + smart reply)  ← next
- [ ] `POST /api/ai/summarize` (thread → summary) via Claude API
- [ ] `POST /api/ai/smart-reply` (thread → reply drafts → prefill composer)
- [ ] Summarize button + smart-reply chips in `MailDetail`
- [ ] (optional) phishing/spam flag on ingest
- **Needs**: `ANTHROPIC_API_KEY` secret

## ⚠️ Operator action required
- **Email Sending onboarding** — sending (compose/reply/forward) fails with "destination not verified" until the domains are onboarded:
  - `npx wrangler email sending enable rajveer.space`
  - `npx wrangler email sending enable 100xdev.qzz.io`
  - Receiving, aliases, rules, search, push all work without this.

## Migrations applied (D1 `cf-email-alies`)
`0004_compose` (cc/bcc + drafts) · `0005_aliases` · `0006_rules` · `0007_push`
(`0001`–`0003` from the original project: messages/attachments/labels/settings/FTS)

## Deploy
`pnpm --filter @email/web build && (cd apps/api && npx wrangler deploy)` — the worker bundles the built SPA. Secrets: `AUTH_SECRET`, `AUTH_PASSWORD`, `VAPID_PRIVATE_JWK`.
