// Per-user settings. Each row is keyed by (owner, key). Alias domains remain
// global worker config (env-driven); per-user just picks a primary among them.

import type { Env } from "./env";

type DB = D1Database;

export async function getSetting(db: DB, owner: string, key: string): Promise<string | null> {
  const row = await db
    .prepare(`SELECT value FROM settings WHERE owner = ? AND key = ?`)
    .bind(owner, key)
    .first<{ value: string }>();
  return row?.value ?? null;
}

export async function setSetting(
  db: DB,
  owner: string,
  key: string,
  value: string,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO settings (owner, key, value) VALUES (?, ?, ?)
         ON CONFLICT(owner, key) DO UPDATE SET value = excluded.value`,
    )
    .bind(owner, key, value)
    .run();
}

export async function getReplyEnabled(db: DB, owner: string): Promise<boolean> {
  const v = await getSetting(db, owner, "reply_enabled");
  return v === "1" || v === "true";
}

export async function setReplyEnabled(db: DB, owner: string, enabled: boolean): Promise<void> {
  await setSetting(db, owner, "reply_enabled", enabled ? "1" : "0");
}

/** Compose/new-mail gate — defaults to enabled when unset. */
export async function getComposeEnabled(db: DB, owner: string): Promise<boolean> {
  const v = await getSetting(db, owner, "compose_enabled");
  return v === null ? true : v === "1" || v === "true";
}

export async function setComposeEnabled(db: DB, owner: string, enabled: boolean): Promise<void> {
  await setSetting(db, owner, "compose_enabled", enabled ? "1" : "0");
}

export function aliasDomains(env: Env): string[] {
  const list = env.ALIAS_DOMAINS ?? env.ALIAS_DOMAIN ?? "rajveer.space";
  return list
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);
}

export async function getPrimaryAliasDomain(db: DB, env: Env, owner: string): Promise<string> {
  const domains = aliasDomains(env);
  const stored = await getSetting(db, owner, "primary_alias_domain");
  return stored && domains.includes(stored) ? stored : domains[0];
}

export async function setPrimaryAliasDomain(
  db: DB,
  env: Env,
  owner: string,
  domain: string,
): Promise<void> {
  if (!aliasDomains(env).includes(domain)) {
    throw new Error("Unknown alias domain");
  }
  await setSetting(db, owner, "primary_alias_domain", domain);
}
