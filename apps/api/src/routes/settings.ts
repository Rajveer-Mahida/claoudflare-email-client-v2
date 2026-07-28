import { Hono } from "hono";
import type { HonoEnv } from "../env";
import {
  getReplyEnabled,
  setReplyEnabled,
  getComposeEnabled,
  setComposeEnabled,
  getPrimaryAliasDomain,
  setPrimaryAliasDomain,
  aliasDomains,
  getSetting,
  setSetting,
} from "../settings";
import { domainManagementEnabled } from "../cloudflare";

export const settings = new Hono<HonoEnv>();

function parseAllowlist(raw: string | null): string[] {
  try {
    const a = raw ? JSON.parse(raw) : [];
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}

settings.get("/", async (c) => {
  const blockRaw = await getSetting(c.env.DB, "block_remote_images");
  return c.json({
    reply_enabled: await getReplyEnabled(c.env.DB),
    compose_enabled: await getComposeEnabled(c.env.DB),
    primary_alias_domain: await getPrimaryAliasDomain(c.env.DB, c.env),
    alias_domains: aliasDomains(c.env),
    alias_suffix: c.env.ALIAS_SUFFIX?.trim() ?? "",
    signature: (await getSetting(c.env.DB, "signature")) ?? "",
    block_remote_images: blockRaw === null ? true : blockRaw === "1",
    image_allowlist: parseAllowlist(await getSetting(c.env.DB, "image_allowlist")),
    domain_management: domainManagementEnabled(c.env),
  });
});

settings.post("/", async (c) => {
  const body = await c.req
    .json<{
      reply_enabled?: boolean;
      compose_enabled?: boolean;
      primary_alias_domain?: string;
      signature?: string;
      block_remote_images?: boolean;
      allow_image_sender?: string;
    }>()
    .catch(() => ({}) as Record<string, never>);

  if (typeof body.compose_enabled === "boolean") {
    await setComposeEnabled(c.env.DB, body.compose_enabled);
    return c.json({ ok: true, compose_enabled: body.compose_enabled });
  }

  if (typeof body.block_remote_images === "boolean") {
    await setSetting(c.env.DB, "block_remote_images", body.block_remote_images ? "1" : "0");
    return c.json({ ok: true });
  }

  if (typeof body.allow_image_sender === "string" && body.allow_image_sender.trim()) {
    const list = parseAllowlist(await getSetting(c.env.DB, "image_allowlist"));
    const addr = body.allow_image_sender.trim().toLowerCase();
    if (!list.includes(addr)) list.push(addr);
    await setSetting(c.env.DB, "image_allowlist", JSON.stringify(list));
    return c.json({ ok: true });
  }

  if (typeof body.signature === "string") {
    await setSetting(c.env.DB, "signature", body.signature);
    return c.json({ ok: true });
  }

  if (typeof body.primary_alias_domain === "string") {
    try {
      await setPrimaryAliasDomain(c.env.DB, c.env, body.primary_alias_domain);
    } catch (err) {
      return c.json({ error: (err as Error)?.message ?? "Invalid domain" }, 400);
    }
    return c.json({ ok: true, primary_alias_domain: body.primary_alias_domain });
  }

  if (typeof body.reply_enabled === "boolean") {
    await setReplyEnabled(c.env.DB, body.reply_enabled);
    return c.json({ ok: true, reply_enabled: body.reply_enabled });
  }

  return c.json(
    { error: "reply_enabled boolean or primary_alias_domain string required" },
    400,
  );
});
