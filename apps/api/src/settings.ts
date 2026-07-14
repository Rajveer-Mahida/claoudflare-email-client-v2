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

export function aliasDomains(env: Env): string[] {
  const list = env.ALIAS_DOMAINS ?? env.ALIAS_DOMAIN ?? "";
  return list
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Matcher for addresses this instance accepts as aliases. An explicit
 *  ALIAS_PATTERN wins; otherwise derived from ALIAS_DOMAINS + ALIAS_SUFFIX
 *  (<local>.<suffix>@<domain>, or <local>@<domain> when no suffix). Null when
 *  neither a pattern nor any domain is configured — nothing is accepted. */
export function aliasPattern(env: Env): RegExp | null {
  if (env.ALIAS_PATTERN) return new RegExp(env.ALIAS_PATTERN, "i");
  const domains = aliasDomains(env);
  if (!domains.length) return null;
  const suffix = env.ALIAS_SUFFIX?.trim();
  const local = suffix ? `[a-z0-9._%+-]+\\.${escapeRe(suffix)}` : "[a-z0-9._%+-]+";
  return new RegExp(`^${local}@(${domains.map(escapeRe).join("|")})$`, "i");
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
