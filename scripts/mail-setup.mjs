// Wire a domain's Email Routing to a worker.
//
//   pnpm instance:mail <name>                  # domains + worker from instances.jsonc
//   pnpm instance:mail --domain a.com --worker driftmail
//   pnpm instance:mail <name> --dry-run        # print the commands, run nothing
//
// The --domain/--worker form exists for workers that have no entry in
// instances.jsonc — e.g. one deployed from a different machine.

import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { loadInstances, resolveEnv, die } from "./lib/instances.mjs";
import {
  wireUpDomain,
  commandsFor,
  describePlan,
  isConfigurableDomain,
  manualCatchAllSteps,
} from "./lib/email-routing.mjs";

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const has = (name) => argv.includes(`--${name}`);

const dryRun = has("dry-run");
const domainFlag = flag("domain");
const workerFlag = flag("worker");
const name = argv.find((a) => !a.startsWith("--") && a !== domainFlag && a !== workerFlag);

let domains;
let worker;

if (domainFlag) {
  domains = domainFlag.split(",").map((d) => d.trim()).filter(Boolean);
  worker = workerFlag;
  if (!worker) die("--domain also needs --worker <deployed worker name>.");
} else {
  if (!name) {
    die(
      "Usage:\n" +
        "  pnpm instance:mail <name>\n" +
        "  pnpm instance:mail --domain example.com --worker driftmail\n\n" +
        "Add --dry-run to print the commands without running them.",
    );
  }
  const { cfg } = loadInstances();
  const env = resolveEnv(cfg, name);
  worker = env.name ?? name;
  domains = (env.vars?.ALIAS_DOMAINS ?? "")
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);
}

const skipped = domains.filter((d) => !isConfigurableDomain(d));
domains = domains.filter(isConfigurableDomain);

for (const s of skipped) {
  console.log(`\x1b[2m· skipping "${s}" — a wildcard isn't a zone to configure\x1b[0m`);
}
if (!domains.length) die("No configurable domains found in ALIAS_DOMAINS.");

console.log(describePlan(domains, worker));

if (dryRun) {
  console.log("\x1b[2mdry run — these are the commands, nothing has been run:\x1b[0m\n");
  for (const d of domains) for (const c of commandsFor(d, worker)) console.log(`  ${c}`);
  console.log();
  process.exit(0);
}

const rl = createInterface({ input: stdin, output: stdout });
const answer = (await rl.question("Apply this now? [y/N] ")).trim().toLowerCase();
rl.close();

if (answer !== "y" && answer !== "yes") {
  console.log("\nNothing changed. To do it yourself:\n");
  for (const d of domains) for (const c of commandsFor(d, worker)) console.log(`  ${c}`);
  console.log();
  process.exit(0);
}

const results = [];
for (const d of domains) results.push(await wireUpDomain(d, worker));
const failed = results.filter((r) => !r.ok);

console.log();
for (const r of results) {
  if (r.ok) {
    console.log(
      `\x1b[32m✓ ${r.domain}\x1b[0m` +
        (r.sending ? "" : "  \x1b[33m(inbound only — enabling Email Sending failed)\x1b[0m"),
    );
  } else {
    console.log(`\x1b[31m✗ ${r.domain}\x1b[0m — failed to ${r.step}`);
  }
}

const manual = results.filter((r) => r.needsManualCatchAll);
if (manual.length) {
  console.log(
    `\n\x1b[33mMX and SPF records are in place, but mail isn't reaching the worker\n` +
      `yet — the catch-all still needs pointing at it.\x1b[0m\n`,
  );
  for (const r of manual) console.log(manualCatchAllSteps(r.domain, worker) + "\n");
}

if (failed.length) {
  console.log(
    `${failed.length} of ${results.length} domain(s) not fully configured. ` +
      `The worker itself is deployed and unaffected; re-run this command for those domains.`,
  );
  process.exit(1);
}

console.log(`\nMail for ${domains.join(", ")} now routes to "${worker}".`);
