// Ported from legacy lib/settings.ts. DB + env passed explicitly.

import type { Env } from "./env";

type DB = D1Database;

export async function getSetting(db: DB, key: string): Promise<string | null> {
  const row = await db
    .prepare(`SELECT value FROM settings WHERE key = ?`)
    .bind(key)
    .first<{ value: string }>();
  return row?.value ?? null;
}

export async function setSetting(db: DB, key: string, value: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .bind(key, value)
    .run();
}

export async function getReplyEnabled(db: DB): Promise<boolean> {
  const v = await getSetting(db, "reply_enabled");
  return v === "1" || v === "true";
}

export async function setReplyEnabled(db: DB, enabled: boolean): Promise<void> {
  await setSetting(db, "reply_enabled", enabled ? "1" : "0");
}

/** Compose/new-mail gate — defaults to enabled when unset. */
export async function getComposeEnabled(db: DB): Promise<boolean> {
  const v = await getSetting(db, "compose_enabled");
  return v === null ? true : v === "1" || v === "true";
}

export async function setComposeEnabled(db: DB, enabled: boolean): Promise<void> {
  await setSetting(db, "compose_enabled", enabled ? "1" : "0");
}

function splitList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);
}

export function aliasDomains(env: Env): string[] {
  return splitList(env.ALIAS_DOMAINS);
}

/** Comma-separated allowlist of accepted recipients; `*` matches any run of
 *  characters. Empty list = accept every address on the alias domains. */
export function allowedEmails(env: Env): string[] {
  return splitList(env.ALLOWED_EMAILS).map((e) => e.toLowerCase());
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Turn a `*`-glob into an anchored regex (`*` → `.*`, everything else literal). */
function globToRe(glob: string): RegExp {
  const body = glob.split("*").map(escapeRe).join(".*");
  return new RegExp(`^${body}$`, "i");
}

/**
 * Does this instance accept mail for `address`?
 *
 *   1. its domain must be listed in ALIAS_DOMAINS, else no;
 *   2. an empty ALLOWED_EMAILS accepts everything on those domains;
 *   3. otherwise it must match one ALLOWED_EMAILS entry (`*` wildcards allowed,
 *      so `*.mail@example.com` reproduces a suffix-style scheme).
 *
 * With no ALIAS_DOMAINS configured nothing is accepted — an unconfigured
 * instance must not become an open relay into the database.
 */
export function isAllowedRecipient(env: Env, address: string): boolean {
  const addr = address.trim().toLowerCase();
  const at = addr.lastIndexOf("@");
  if (at < 1 || at === addr.length - 1) return false;

  const domain = addr.slice(at + 1);
  const domains = aliasDomains(env);
  // Entries may be globs, so "*" accepts any domain and "*.example.com"
  // accepts every subdomain. Cloudflare only routes mail for zones you own,
  // so "*" still can't be reached by mail for someone else's domain.
  if (!domains.some((d) => globToRe(d).test(domain))) return false;

  const allowed = allowedEmails(env);
  if (!allowed.length) return true;
  return allowed.some((entry) => globToRe(entry).test(addr));
}

/** Fallback from-address for compose/reply when no alias applies.
 *  Defaults to reply@<first alias domain> so it needn't be configured. */
export function replyFrom(env: Env): string {
  const explicit = env.REPLY_FROM?.trim();
  if (explicit) return explicit;
  const domain = aliasDomains(env)[0];
  return domain ? `reply@${domain}` : "";
}

export async function getPrimaryAliasDomain(db: DB, env: Env): Promise<string> {
  const domains = aliasDomains(env);
  const stored = await getSetting(db, "primary_alias_domain");
  return stored && domains.includes(stored) ? stored : (domains[0] ?? "");
}

export async function setPrimaryAliasDomain(db: DB, env: Env, domain: string): Promise<void> {
  if (!aliasDomains(env).includes(domain)) {
    throw new Error("Unknown alias domain");
  }
  await setSetting(db, "primary_alias_domain", domain);
}
