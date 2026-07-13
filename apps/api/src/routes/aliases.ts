import { Hono } from "hono";
import type { HonoEnv } from "../env";
import { listAliases, createAlias, updateAlias, deleteAlias } from "../db";
import { aliasDomains, getPrimaryAliasDomain } from "../settings";
import { effectiveOwner, writeOwner } from "../scope";

export const aliases = new Hono<HonoEnv>();

const DEFAULT_PATTERN = "^[a-z0-9._%+-]+\\.smi@(rajveer\\.space|100xdev\\.qzz\\.io)$";

aliases.get("/", async (c) => c.json(await listAliases(c.env.DB, effectiveOwner(c).owner)));

aliases.post("/", async (c) => {
  const b = await c.req
    .json<{ address?: string; local?: string; domain?: string; name?: string; note?: string }>()
    .catch(() => ({}) as Record<string, never>);

  const owner = writeOwner(c);
  const suffix = c.env.ALIAS_SUFFIX ?? "smi";
  const domains = aliasDomains(c.env);

  let address = b.address?.trim().toLowerCase();
  if (!address) {
    const domain = b.domain?.trim() || (await getPrimaryAliasDomain(c.env.DB, c.env, owner));
    if (!domains.includes(domain)) return c.json({ error: "Unknown domain" }, 400);
    const local =
      (b.local?.trim().toLowerCase().replace(/[^a-z0-9._%+-]/g, "") || "") ||
      `alias-${Math.floor(1000 + Math.random() * 9000)}`;
    address = `${local}.${suffix}@${domain}`;
  }

  const pattern = new RegExp(c.env.ALIAS_PATTERN ?? DEFAULT_PATTERN, "i");
  if (!pattern.test(address)) {
    return c.json({ error: "Invalid alias format" }, 400);
  }

  const row = await createAlias(c.env.DB, owner, address, b.name?.trim() || null, b.note?.trim() || null);
  if (!row) return c.json({ error: "Address already taken" }, 409);
  return c.json(row, 201);
});

aliases.post("/update", async (c) => {
  const b = await c.req
    .json<{ address?: string; name?: string | null; note?: string | null; disabled?: 0 | 1 }>()
    .catch(() => ({}) as Record<string, never>);
  if (!b.address) return c.json({ error: "address required" }, 400);
  await updateAlias(c.env.DB, effectiveOwner(c).owner, b.address, {
    name: b.name,
    note: b.note,
    disabled: b.disabled,
  });
  return c.json({ ok: true });
});

aliases.post("/delete", async (c) => {
  const b = await c.req.json<{ address?: string }>().catch(() => ({}) as { address?: string });
  if (!b.address) return c.json({ error: "address required" }, 400);
  await deleteAlias(c.env.DB, effectiveOwner(c).owner, b.address);
  return c.json({ ok: true });
});
