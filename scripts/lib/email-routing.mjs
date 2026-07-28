// Wiring a domain's mail to a worker.
//
//   wrangler email routing enable <domain>          adds the MX + SPF records
//   PUT /zones/{id}/email/routing/rules/catch_all   catch-all → this worker
//   wrangler email sending enable <domain>          outbound (compose/reply)
//   wrangler email routing dns get <domain>         inspect the records
//
// The catch-all step deliberately does NOT use wrangler. Its CLI rejects
// `--action-type worker` for catch-all rules:
//
//   ✘ Catch-all rule only supports 'forward' or 'drop' action types
//
// That validation is wrong — the REST API documents `worker` as a valid
// catch_all action, the dashboard offers "Send to a Worker" as a catch-all, and
// existing deployments already run that way. So that one step goes over the
// API, which needs a token: CLOUDFLARE_API_TOKEN (wrangler's own env var) or
// CF_TOKEN. Without one the other steps still run and the user is told exactly
// what is left to do.
//
// These change live DNS and mail delivery, so nothing here runs without the
// caller having confirmed first — see setup.mjs / mail-setup.mjs.

import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { tryRun, capture } from "./instances.mjs";

const wrangler = (...args) => ["exec", "wrangler", ...args];
const API = "https://api.cloudflare.com/client/v4";

/**
 * Bearer token for the catch-all step.
 *
 * Prefers an explicit env token, then falls back to the OAuth token `wrangler
 * login` already stored — it carries `email_routing:write` and `zone:read`,
 * which is exactly what this call needs, and is the same credential the other
 * steps here use via the CLI. That makes the common case need no setup at all.
 */
export function apiToken() {
  const fromEnv = (process.env.CLOUDFLARE_API_TOKEN || process.env.CF_TOKEN || "").trim();
  if (fromEnv) return fromEnv;
  return wranglerOAuthToken();
}

function wranglerOAuthToken() {
  const home = homedir();
  const candidates = [
    join(home, ".config", ".wrangler", "config", "default.toml"),
    join(home, ".wrangler", "config", "default.toml"),
  ];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    try {
      const toml = readFileSync(path, "utf8");
      const token = toml.match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
      if (!token) continue;
      // Don't hand back a token we know is stale — a 401 here is far more
      // confusing than being told to log in again.
      const exp = toml.match(/^expiration_time\s*=\s*"([^"]+)"/m)?.[1];
      if (exp && new Date(exp).getTime() < Date.now()) {
        console.log(
          `\x1b[33m· your wrangler login has expired — run \`wrangler login\`,` +
            ` or set CLOUDFLARE_API_TOKEN\x1b[0m`,
        );
        return null;
      }
      return token;
    } catch {
      /* unreadable config — fall through */
    }
  }
  return null;
}

async function cf(token, path, init) {
  const res = await fetch(`${API}${path}`, {
    method: init?.method ?? "GET",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    const detail = json?.errors?.map((e) => e.message).join("; ");
    throw new Error(detail || `Cloudflare API returned ${res.status}`);
  }
  return json.result;
}

async function zoneIdFor(token, domain) {
  const zones = await cf(token, `/zones?name=${encodeURIComponent(domain)}`);
  if (!zones?.length) throw new Error(`no zone named ${domain} visible to this token`);
  return zones[0].id;
}

/** Point the zone's catch-all at the worker. Returns true on success. */
export async function setCatchAllToWorker(domain, worker) {
  const token = apiToken();
  if (!token) return false;
  try {
    const zoneId = await zoneIdFor(token, domain);
    await cf(token, `/zones/${zoneId}/email/routing/rules/catch_all`, {
      method: "PUT",
      body: {
        name: "Driftmail catch-all",
        enabled: true,
        matchers: [{ type: "all" }],
        actions: [{ type: "worker", value: [worker] }],
      },
    });
    console.log(`\n\x1b[2m· catch-all for ${domain} → worker ${worker}\x1b[0m`);
    return true;
  } catch (err) {
    console.error(`\n  catch-all failed: ${err.message}`);
    return false;
  }
}

/** What the user must do by hand when no API token is available. */
export function manualCatchAllSteps(domain, worker) {
  return (
    `  Cloudflare dashboard → ${domain} → Email → Email Routing → Routing rules\n` +
    `    → Catch-all address → Edit → Action "Send to a Worker" → ${worker} → Save\n\n` +
    `  Or set an API token and re-run:\n` +
    `    export CLOUDFLARE_API_TOKEN=...   # Zone:Read + Email Routing Rules:Edit`
  );
}

/** Domains that aren't real zones — `*` is a valid ALIAS_DOMAINS value but
 *  there is nothing to configure for it. */
export function isConfigurableDomain(domain) {
  return !!domain && !domain.includes("*");
}

/** The exact commands `wireUpDomain` would run, for --dry-run and for printing
 *  when the user declines. */
export function commandsFor(domain, worker) {
  return [
    `pnpm exec wrangler email routing enable ${domain}`,
    `PUT /zones/<${domain} zone id>/email/routing/rules/catch_all` +
      `   → {"actions":[{"type":"worker","value":["${worker}"]}],"matchers":[{"type":"all"}]}`,
    `pnpm exec wrangler email sending enable ${domain}`,
  ];
}

export function enableRouting(domain) {
  return tryRun("pnpm", wrangler("email", "routing", "enable", domain));
}

export function enableSending(domain) {
  return tryRun("pnpm", wrangler("email", "sending", "enable", domain));
}

/** Read-only: show the records Cloudflare created. Never fatal. */
export function showDns(domain) {
  try {
    console.log(capture("pnpm", wrangler("email", "routing", "dns", "get", domain)));
  } catch {
    /* informational only */
  }
}

/**
 * Wire one domain end to end. Returns an {ok, domain, error} result rather than
 * throwing: by the time this runs the worker is already deployed, and one zone
 * failing shouldn't make the whole setup look like it failed or stop the
 * remaining domains from being configured.
 */
export async function wireUpDomain(domain, worker) {
  if (!enableRouting(domain)) {
    return { ok: false, domain, step: "enable Email Routing" };
  }

  // Needs the API — wrangler's CLI won't set a worker catch-all. Without a
  // token the rest still applies and the user finishes this one step by hand.
  const catchAll = apiToken() ? await setCatchAllToWorker(domain, worker) : false;

  // Sending is the one step the inbox works without, so a failure here is
  // reported but doesn't mark the domain as unconfigured.
  const sending = enableSending(domain);
  showDns(domain);

  if (!catchAll) {
    return {
      ok: false,
      domain,
      step: apiToken()
        ? "point the catch-all at the worker"
        : "point the catch-all at the worker (no API token available)",
      needsManualCatchAll: true,
    };
  }
  return { ok: true, domain, sending };
}

/** Human-readable description of what confirming will change. */
export function describePlan(domains, worker) {
  return (
    `\nThis will change live DNS and mail delivery for ` +
    `${domains.length === 1 ? "this domain" : "these domains"}:\n\n` +
    domains.map((d) => `  · ${d}`).join("\n") +
    `\n\nFor each one:\n` +
    `  1. enable Email Routing   → adds the MX and SPF records to the zone\n` +
    `  2. catch-all → Worker     → all mail for the domain goes to "${worker}"` +
    (apiToken() ? "\n" : "   \x1b[33m(needs an API token — will be skipped)\x1b[0m\n") +
    `  3. enable Email Sending   → lets the worker send replies from it\n`
  );
}
