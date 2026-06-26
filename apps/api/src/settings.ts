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

export function aliasDomains(env: Env): string[] {
  const list = env.ALIAS_DOMAINS ?? env.ALIAS_DOMAIN ?? "rajveer.space";
  return list
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);
}

export async function getPrimaryAliasDomain(db: DB, env: Env): Promise<string> {
  const domains = aliasDomains(env);
  const stored = await getSetting(db, "primary_alias_domain");
  return stored && domains.includes(stored) ? stored : domains[0];
}

export async function setPrimaryAliasDomain(db: DB, env: Env, domain: string): Promise<void> {
  if (!aliasDomains(env).includes(domain)) {
    throw new Error("Unknown alias domain");
  }
  await setSetting(db, "primary_alias_domain", domain);
}
