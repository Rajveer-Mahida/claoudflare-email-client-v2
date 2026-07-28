// Wiring a domain's mail to a worker, via the wrangler CLI.
//
// All four steps are scriptable — the README used to claim otherwise:
//   wrangler email routing enable <domain>          adds the MX + SPF records
//   wrangler email routing rules update <domain> catch-all --action-type worker
//   wrangler email sending enable <domain>          outbound (compose/reply)
//   wrangler email routing dns get <domain>         inspect the records
//
// These change live DNS and mail delivery, so nothing here runs without the
// caller having confirmed first — see setup.mjs / mail-setup.mjs.

import { tryRun, capture } from "./instances.mjs";

const wrangler = (...args) => ["exec", "wrangler", ...args];

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
    `pnpm exec wrangler email routing rules update ${domain} catch-all` +
      ` --action-type worker --action-value ${worker} --enabled`,
    `pnpm exec wrangler email sending enable ${domain}`,
  ];
}

export function enableRouting(domain) {
  return tryRun("pnpm", wrangler("email", "routing", "enable", domain));
}

export function setCatchAllToWorker(domain, worker) {
  return tryRun(
    "pnpm",
    wrangler(
      "email",
      "routing",
      "rules",
      "update",
      domain,
      "catch-all",
      "--action-type",
      "worker",
      "--action-value",
      worker,
      "--enabled",
    ),
  );
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
export function wireUpDomain(domain, worker) {
  if (!enableRouting(domain)) {
    return { ok: false, domain, step: "enable Email Routing" };
  }
  if (!setCatchAllToWorker(domain, worker)) {
    return { ok: false, domain, step: "point the catch-all at the worker" };
  }
  // Sending is the one step the inbox works without, so a failure here is
  // reported but doesn't mark the domain as unconfigured.
  const sending = enableSending(domain);
  showDns(domain);
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
    `  2. catch-all → Worker     → all mail for the domain goes to "${worker}"\n` +
    `  3. enable Email Sending   → lets the worker send replies from it\n`
  );
}
