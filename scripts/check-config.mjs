// Guard against drift between the two wrangler configs.
//
// wrangler.jsonc holds the structural block; each instance in instances.jsonc
// repeats the same structure for its environments. Wrangler has no `extends`,
// so the block exists twice — this asserts the two copies stay byte-equivalent.
//
// No-ops when instances.jsonc is absent (fresh clone, CI).

import { readFileSync, existsSync } from "node:fs";
import { parseJsonc } from "./lib/jsonc.mjs";
import { STRUCTURAL_KEYS, WRANGLER_PATH, INSTANCES_PATH } from "./lib/instances.mjs";

if (!existsSync(INSTANCES_PATH)) {
  console.log("check:config — no instances.jsonc, nothing to compare");
  process.exit(0);
}

const root = parseJsonc(readFileSync(WRANGLER_PATH, "utf8"));
const instances = parseJsonc(readFileSync(INSTANCES_PATH, "utf8"));

const drift = [];
for (const key of STRUCTURAL_KEYS) {
  const a = JSON.stringify(root[key] ?? null);
  const b = JSON.stringify(instances[key] ?? null);
  if (a !== b) drift.push({ key, wrangler: a, instances: b });
}

if (drift.length) {
  console.error(`\n✗ wrangler.jsonc and instances.jsonc have drifted:\n`);
  for (const d of drift) {
    console.error(`  ${d.key}`);
    console.error(`    wrangler.jsonc   ${d.wrangler}`);
    console.error(`    instances.jsonc  ${d.instances}`);
  }
  console.error(`\nMake the structural block identical in both files.\n`);
  process.exit(1);
}

// Every environment must carry the non-inheritable bindings itself.
const envs = instances.env ?? {};
const problems = [];
for (const [name, env] of Object.entries(envs)) {
  if (!env.name) problems.push(`env.${name} has no explicit "name" (wrangler would deploy it as "<top-level>-${name}")`);
  if (!env.d1_databases?.length) problems.push(`env.${name} has no d1_databases (not inherited from top level)`);
  if (!env.r2_buckets?.length) problems.push(`env.${name} has no r2_buckets (not inherited from top level)`);
  if (!env.send_email?.length) problems.push(`env.${name} has no send_email (not inherited from top level)`);
  if (!env.vars?.ALIAS_DOMAINS) problems.push(`env.${name} has no vars.ALIAS_DOMAINS (required — no mail would be accepted)`);
  if (!env.routes?.[0]?.pattern) problems.push(`env.${name} has no routes[0].pattern (the deploy origin is derived from it)`);
}

if (problems.length) {
  console.error(`\n✗ instances.jsonc:\n`);
  for (const p of problems) console.error(`  · ${p}`);
  console.error("");
  process.exit(1);
}

const count = Object.keys(envs).length;
console.log(`check:config — ok (${count} instance${count === 1 ? "" : "s"}: ${Object.keys(envs).join(", ")})`);
