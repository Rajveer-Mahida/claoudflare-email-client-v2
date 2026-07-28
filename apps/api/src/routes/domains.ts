import { Hono } from "hono";
import type { Context } from "hono";
import type { HonoEnv } from "../env";
import {
  CloudflareError,
  domainManagementEnabled,
  workerName,
  listZones,
  routingStatus,
  routingDns,
  enableRouting,
  disableRouting,
  setCatchAllToWorker,
  enableSending,
} from "../cloudflare";

export const domains = new Hono<HonoEnv>();

// Optional feature. Without CF_TOKEN every route here is inert, so a deployment
// that never opts in carries none of the risk of a DNS-capable token.
domains.use("*", async (c, next) => {
  if (!domainManagementEnabled(c.env)) {
    return c.json(
      { error: "Domain management is not configured — set the CF_TOKEN secret." },
      503,
    );
  }
  return next();
});

/** Surface Cloudflare's own message; a permission problem should say so. */
function fail(c: Context<HonoEnv>, err: unknown) {
  const message =
    err instanceof CloudflareError
      ? err.message
      : ((err as Error)?.message ?? "Cloudflare request failed");
  const status = err instanceof CloudflareError && err.status === 403 ? 403 : 502;
  return c.json({ error: message }, status);
}

// Zones the token can see, each with its routing status and whether the
// catch-all already points at this worker.
domains.get("/", async (c) => {
  try {
    const zones = await listZones(c.env);
    const withStatus = await Promise.all(
      zones.map(async (z) => ({
        ...z,
        routing: await routingStatus(c.env, z.id).catch(() => ({ enabled: false })),
      })),
    );
    return c.json({ worker: workerName(c.env), zones: withStatus });
  } catch (err) {
    return fail(c, err);
  }
});

domains.get("/:zoneId/dns", async (c) => {
  try {
    return c.json({ records: await routingDns(c.env, c.req.param("zoneId")) });
  } catch (err) {
    return fail(c, err);
  }
});

// Enable routing (writes MX + SPF) and point the catch-all here.
domains.post("/", async (c) => {
  const { zoneId } = await c.req
    .json<{ zoneId?: string }>()
    .catch(() => ({}) as { zoneId?: string });
  if (!zoneId) return c.json({ error: "zoneId required" }, 400);

  const worker = workerName(c.env);
  try {
    const status = await routingStatus(c.env, zoneId);
    if (!status.enabled) await enableRouting(c.env, zoneId);
    await setCatchAllToWorker(c.env, zoneId, worker);
    const sending = await enableSending(c.env, zoneId);
    return c.json({ ok: true, worker, sending, records: await routingDns(c.env, zoneId) });
  } catch (err) {
    return fail(c, err);
  }
});

domains.delete("/:zoneId", async (c) => {
  try {
    await disableRouting(c.env, c.req.param("zoneId"));
    return c.json({ ok: true });
  } catch (err) {
    return fail(c, err);
  }
});
