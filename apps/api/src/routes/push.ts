import { Hono } from "hono";
import type { HonoEnv } from "../env";

export const push = new Hono<HonoEnv>();

// Public VAPID key for the browser's PushManager.subscribe.
push.get("/key", (c) => c.json({ key: c.env.VAPID_PUBLIC_KEY ?? "" }));

push.post("/subscribe", async (c) => {
  const b = await c.req
    .json<{ endpoint?: string; keys?: { p256dh?: string; auth?: string } }>()
    .catch(() => ({}) as Record<string, never>);
  if (!b.endpoint) return c.json({ error: "endpoint required" }, 400);
  await c.env.DB.prepare(
    `INSERT INTO push_subscriptions (endpoint, p256dh, auth, created_at) VALUES (?,?,?,?)
     ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth`,
  )
    .bind(b.endpoint, b.keys?.p256dh ?? null, b.keys?.auth ?? null, Date.now())
    .run();
  return c.json({ ok: true });
});

push.post("/unsubscribe", async (c) => {
  const b = await c.req.json<{ endpoint?: string }>().catch(() => ({}) as { endpoint?: string });
  if (!b.endpoint) return c.json({ error: "endpoint required" }, 400);
  await c.env.DB.prepare(`DELETE FROM push_subscriptions WHERE endpoint = ?`).bind(b.endpoint).run();
  return c.json({ ok: true });
});
