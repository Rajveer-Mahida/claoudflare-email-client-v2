import { Hono } from "hono";
import type { HonoEnv } from "../env";
import {
  getReplyEnabled,
  setReplyEnabled,
  getPrimaryAliasDomain,
  setPrimaryAliasDomain,
  aliasDomains,
} from "../settings";

export const settings = new Hono<HonoEnv>();

settings.get("/", async (c) => {
  return c.json({
    reply_enabled: await getReplyEnabled(c.env.DB),
    primary_alias_domain: await getPrimaryAliasDomain(c.env.DB, c.env),
    alias_domains: aliasDomains(c.env),
  });
});

settings.post("/", async (c) => {
  const body = await c.req
    .json<{ reply_enabled?: boolean; primary_alias_domain?: string }>()
    .catch(() => ({}) as Record<string, never>);

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
