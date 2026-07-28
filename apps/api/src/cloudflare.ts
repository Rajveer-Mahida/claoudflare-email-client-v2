// Minimal Cloudflare REST client for in-app domain management.
//
// Optional feature: without a CF_TOKEN secret none of this is reachable (see
// routes/domains.ts), and the SPA hides the Domains section entirely.
//
// Scopes the token needs: Zone:Read, Email Routing Rules:Edit,
// Email Routing Addresses:Edit, plus DNS:Edit / DNS Settings:Edit for the
// enable step, which writes the MX and SPF records.
//
// Raw fetch, same style as ai.ts — no SDK.

import type { Env } from "./env";

const API = "https://api.cloudflare.com/client/v4";

export class CloudflareError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function domainManagementEnabled(env: Env): boolean {
  return !!env.CF_TOKEN?.trim();
}

/** The worker name Email Routing rules should point at. Must match the
 *  deployed Worker exactly — a worker can't read its own script name. */
export function workerName(env: Env): string {
  return env.CF_WORKER_NAME?.trim() || "driftmail";
}

type CfResponse<T> = {
  success: boolean;
  result: T;
  errors?: Array<{ code: number; message: string }>;
};

async function cf<T>(
  env: Env,
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  if (!env.CF_TOKEN) throw new CloudflareError(503, "CF_TOKEN is not set");

  const res = await fetch(`${API}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      authorization: `Bearer ${env.CF_TOKEN.trim()}`,
      "content-type": "application/json",
    },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });

  let json: CfResponse<T> | null = null;
  try {
    json = (await res.json()) as CfResponse<T>;
  } catch {
    /* non-JSON error body */
  }

  if (!res.ok || !json?.success) {
    // Cloudflare's error messages are specific and worth surfacing verbatim —
    // "token lacks permission X" is far more useful than a generic failure.
    const detail = json?.errors?.map((e) => e.message).join("; ");
    throw new CloudflareError(res.status, detail || `Cloudflare API returned ${res.status}`);
  }
  return json.result;
}

export type Zone = { id: string; name: string; status: string };

/** Zones the token can see. Scoped tokens return only their zones. */
export async function listZones(env: Env): Promise<Zone[]> {
  const q = new URLSearchParams({ per_page: "50", status: "active" });
  if (env.CF_ACCOUNT_ID?.trim()) q.set("account.id", env.CF_ACCOUNT_ID.trim());
  const zones = await cf<Zone[]>(env, `/zones?${q}`);
  return zones.map((z) => ({ id: z.id, name: z.name, status: z.status }));
}

export type RoutingStatus = { enabled: boolean; name?: string; status?: string };

export async function routingStatus(env: Env, zoneId: string): Promise<RoutingStatus> {
  try {
    const r = await cf<RoutingStatus>(env, `/zones/${zoneId}/email/routing`);
    return { enabled: !!r.enabled, name: r.name, status: r.status };
  } catch (err) {
    // Never-onboarded zones 404 here; that's "not enabled", not an error.
    if (err instanceof CloudflareError && err.status === 404) return { enabled: false };
    throw err;
  }
}

export type DnsRecord = { type: string; name: string; content: string; priority?: number };

export async function routingDns(env: Env, zoneId: string): Promise<DnsRecord[]> {
  try {
    return await cf<DnsRecord[]>(env, `/zones/${zoneId}/email/routing/dns`);
  } catch (err) {
    if (err instanceof CloudflareError && err.status === 404) return [];
    throw err;
  }
}

/** Enable Email Routing — this is what adds and locks the MX + SPF records. */
export async function enableRouting(env: Env, zoneId: string): Promise<void> {
  await cf(env, `/zones/${zoneId}/email/routing/enable`, { method: "POST", body: {} });
}

export async function disableRouting(env: Env, zoneId: string): Promise<void> {
  await cf(env, `/zones/${zoneId}/email/routing/disable`, { method: "POST", body: {} });
}

/** Point the catch-all at this worker, so every address on the zone lands here. */
export async function setCatchAllToWorker(
  env: Env,
  zoneId: string,
  worker: string,
): Promise<void> {
  await cf(env, `/zones/${zoneId}/email/routing/rules/catch_all`, {
    method: "PUT",
    body: {
      name: "Driftmail catch-all",
      enabled: true,
      matchers: [{ type: "all" }],
      actions: [{ type: "worker", value: [worker] }],
    },
  });
}

/** Outbound sending. Best-effort: the inbox works without it. */
export async function enableSending(env: Env, zoneId: string): Promise<boolean> {
  try {
    await cf(env, `/zones/${zoneId}/email/sending/subdomains`, { method: "POST", body: {} });
    return true;
  } catch {
    return false;
  }
}
