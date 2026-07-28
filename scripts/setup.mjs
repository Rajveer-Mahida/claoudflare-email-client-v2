// Stand up a new deployment: provision D1 + R2, write the instance config,
// and set the required secrets.
//
//   pnpm instance:new <name>
//
// Everything it writes lands in instances.jsonc (gitignored). Afterwards:
//   pnpm instance:deploy <name>

import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { parseJsonc, blankComments } from "./lib/jsonc.mjs";
import {
  INSTANCES_PATH,
  WRANGLER_PATH,
  STRUCTURAL_KEYS,
  ROOT,
  die,
  capture,
} from "./lib/instances.mjs";
import {
  wireUpDomain,
  describePlan,
  isConfigurableDomain,
  manualCatchAllSteps,
} from "./lib/email-routing.mjs";

const name = process.argv[2];
if (!name) die("Usage: pnpm instance:new <name>    (e.g. pnpm instance:new acme)");
if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
  die(`"${name}" isn't a usable instance name — use lowercase letters, digits and dashes.`);
}

const rl = createInterface({ input: stdin, output: stdout });
const ask = async (q, fallback = "") => {
  const a = (await rl.question(fallback ? `${q} [${fallback}] ` : `${q} `)).trim();
  return a || fallback;
};

// ── 1. Make sure instances.jsonc exists, with a structure that can't drift ───
if (!existsSync(INSTANCES_PATH)) {
  const root = parseJsonc(readFileSync(WRANGLER_PATH, "utf8"));
  const skeleton = { $schema: "node_modules/wrangler/config-schema.json" };
  for (const key of STRUCTURAL_KEYS) if (root[key] !== undefined) skeleton[key] = root[key];
  skeleton.env = {};
  writeFileSync(
    INSTANCES_PATH,
    "// GITIGNORED — your real deployments. See instances.example.jsonc.\n" +
      "// The structural block mirrors wrangler.jsonc; `pnpm check:config` enforces that.\n" +
      JSON.stringify(skeleton, null, 2) +
      "\n",
  );
  console.log("· created instances.jsonc");
}

const text = readFileSync(INSTANCES_PATH, "utf8");
const cfg = parseJsonc(text);
if (cfg.env?.[name]) die(`instances.jsonc already has an instance called "${name}".`);

// ── 2. Ask for the bits only you know ───────────────────────────────────────
console.log(`\n\x1b[1mNew instance "${name}"\x1b[0m`);
console.log(`\x1b[2mThe zone must already exist in your Cloudflare account.\x1b[0m\n`);

const host = await ask("Hostname to serve it on (e.g. mail.example.com):");
if (!host || !host.includes(".")) die("A hostname is required.");

const aliasDomains = await ask(
  "Domain(s) you receive mail on, comma-separated:",
  host.split(".").slice(-2).join("."),
);
if (!aliasDomains) die("At least one mail domain is required.");

console.log(
  `\n\x1b[2mWhich addresses on those domains to accept. Blank accepts every\n` +
    `address (a true catch-all). "*" is a wildcard, e.g. *.mail@${aliasDomains.split(",")[0]}\x1b[0m`,
);
const allowedEmails = await ask("Accepted addresses (blank = all):");
const aliasSuffix = await ask("Alias suffix for generated addresses (blank = none):");
const fallbackForward = await ask("Forward rejected mail to (blank = bounce it):");

// ── 3. Provision D1 + R2 ────────────────────────────────────────────────────
const dbName = `${name}-db`;
const bucketName = `${name}-email-cache`;

console.log(`\n· creating D1 database ${dbName}`);
const d1Out = capture("pnpm", ["exec", "wrangler", "d1", "create", dbName]);
let databaseId = (d1Out.match(/database_id\s*[:=]\s*"?([0-9a-f-]{36})"?/i) ??
  d1Out.match(/\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i))?.[1];
if (!databaseId) {
  console.log(d1Out);
  databaseId = await ask("Couldn't read the database_id from that output — paste it:");
  if (!/^[0-9a-f-]{36}$/i.test(databaseId)) die("That doesn't look like a database id.");
}
console.log(`  database_id ${databaseId}`);

console.log(`\n· creating R2 bucket ${bucketName}`);
capture("pnpm", ["exec", "wrangler", "r2", "bucket", "create", bucketName]);

// ── 4. Splice the env block into instances.jsonc, comments intact ───────────
const envBlock = {
  name,
  workers_dev: false,
  routes: [{ pattern: host, custom_domain: true }],
  d1_databases: [
    {
      binding: "DB",
      database_name: dbName,
      database_id: databaseId,
      migrations_dir: "apps/api/migrations",
    },
  ],
  r2_buckets: [{ binding: "EMAIL_CACHE", bucket_name: bucketName }],
  send_email: [{ name: "EMAIL" }],
  vars: {
    ALIAS_DOMAINS: aliasDomains,
    ALLOWED_EMAILS: allowedEmails,
    ALIAS_SUFFIX: aliasSuffix,
    REPLY_FROM: "",
    FORWARD_TO: "",
    FALLBACK_FORWARD_TO: fallbackForward,
    VAPID_SUBJECT: "",
  },
};

const anchor = /"env"\s*:\s*\{/.exec(blankComments(text));
if (!anchor) die(`instances.jsonc has no "env" block to add to.`);
const at = anchor.index + anchor[0].length;
const entry =
  `    ${JSON.stringify(name)}: ` +
  JSON.stringify(envBlock, null, 2).split("\n").join("\n    ");
const needsComma = Object.keys(cfg.env ?? {}).length > 0;

writeFileSync(INSTANCES_PATH, `${text.slice(0, at)}\n${entry}${needsComma ? "," : ""}${text.slice(at)}`);
console.log(`\n· wrote env.${name} to instances.jsonc`);

// ── 5. Secrets ──────────────────────────────────────────────────────────────
const putSecret = (key, value) => {
  const res = spawnSync(
    "pnpm",
    ["exec", "wrangler", "secret", "put", key, "-c", INSTANCES_PATH, "-e", name],
    { input: value, cwd: ROOT, stdio: ["pipe", "inherit", "inherit"] },
  );
  if (res.status !== 0) die(`Failed to set ${key} (exit ${res.status}).`);
};

const authSecret = randomBytes(32).toString("hex");
console.log(`\n· setting AUTH_SECRET (generated, 32 random bytes)`);
putSecret("AUTH_SECRET", authSecret);

let password = "";
while (!password) {
  password = await ask("\nPassword for the login screen (pick something long):");
  if (!password) console.log("  Required — login fails closed without it.");
}
console.log(`· setting AUTH_PASSWORD`);
putSecret("AUTH_PASSWORD", password);

// ── 6. Offer to wire up the domain's mail ───────────────────────────────────
// This changes live DNS and mail delivery, so it only runs on an explicit yes.
const domains = aliasDomains
  .split(",")
  .map((d) => d.trim())
  .filter(Boolean)
  .filter(isConfigurableDomain);

let wired = false;
if (domains.length) {
  console.log(describePlan(domains, name));
  const answer = (await ask("Apply this now? [y/N]")).trim().toLowerCase();
  if (answer === "y" || answer === "yes") {
    const results = [];
    for (const d of domains) results.push(await wireUpDomain(d, name));
    wired = results.every((r) => r.ok);
    console.log();
    for (const r of results) {
      console.log(r.ok ? `\x1b[32m✓ ${r.domain}\x1b[0m` : `\x1b[31m✗ ${r.domain}\x1b[0m — failed to ${r.step}`);
    }
    for (const r of results.filter((x) => x.needsManualCatchAll)) {
      console.log(`\n${manualCatchAllSteps(r.domain, name)}`);
    }
    if (!wired) console.log(`\nRe-run for the failed domains with: pnpm instance:mail ${name}`);
  } else {
    console.log("\n\x1b[2mSkipped. Run `pnpm instance:mail " + name + "` when you're ready.\x1b[0m");
  }
}

rl.close();

console.log(`
\x1b[32m✓ "${name}" is configured.\x1b[0m

  \x1b[1mpnpm instance:deploy ${name}\x1b[0m
${
  wired
    ? ""
    : `
Mail isn't routed yet — after deploying, run:
  pnpm instance:mail ${name}
`
}
Optional secrets:
  pnpm exec wrangler secret put ANTHROPIC_API_KEY -c instances.jsonc -e ${name}
  pnpm exec wrangler secret put VAPID_PRIVATE_JWK -c instances.jsonc -e ${name}   # pnpm generate-vapid
`);
