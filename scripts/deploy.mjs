// Build + migrate + deploy one instance from instances.jsonc.
//
//   pnpm instance:deploy <name>
//   pnpm instance:deploy <name> --skip-migrations    # DB predates D1 migration bookkeeping
//   pnpm instance:deploy <name> --dry-run            # resolve everything, upload nothing
//
// The SPA's public origin is derived from the instance's route, so
// VITE_PUBLIC_ORIGIN never has to be set by hand.

import { loadInstances, resolveEnv, originOf, run, INSTANCES_PATH, die } from "./lib/instances.mjs";

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const positional = args.filter((a) => !a.startsWith("--"));

const known = new Set(["--skip-migrations", "--dry-run"]);
for (const f of flags) if (!known.has(f)) die(`Unknown flag ${f}. Known: ${[...known].join(", ")}`);

const name = positional[0];
const dryRun = flags.has("--dry-run");
const skipMigrations = flags.has("--skip-migrations");

const { cfg } = loadInstances();
const env = resolveEnv(cfg, name);
const origin = originOf(env, name);

console.log(`\n\x1b[1mDeploying "${name}"\x1b[0m`);
console.log(`  worker  ${env.name ?? `${cfg.name ?? "driftmail"}-${name}`}`);
console.log(`  origin  ${origin}`);
console.log(`  d1      ${env.d1_databases?.[0]?.database_name ?? "(none)"}`);
console.log(`  r2      ${env.r2_buckets?.[0]?.bucket_name ?? "(none)"}`);
if (dryRun) console.log(`  \x1b[33mdry run — nothing will be uploaded\x1b[0m`);

// 1. Build the SPA with this instance's origin baked into the meta tags.
run("pnpm", ["build"], { env: { ...process.env, VITE_PUBLIC_ORIGIN: origin } });

// 2. Migrations. Skipped on --dry-run (there is no dry-run for migrations) and
//    on instances whose DB predates D1 migration bookkeeping.
if (dryRun) {
  console.log(`\n\x1b[2m· skipping migrations (dry run)\x1b[0m`);
} else if (skipMigrations) {
  console.log(`\n\x1b[2m· skipping migrations (--skip-migrations)\x1b[0m`);
} else {
  run("pnpm", [
    "exec",
    "wrangler",
    "d1",
    "migrations",
    "apply",
    "DB",
    "--remote",
    "-c",
    INSTANCES_PATH,
    "-e",
    name,
  ]);
}

// 3. Deploy.
run("pnpm", [
  "exec",
  "wrangler",
  "deploy",
  "-c",
  INSTANCES_PATH,
  "-e",
  name,
  ...(dryRun ? ["--dry-run"] : []),
]);

if (!dryRun) {
  console.log(`\n\x1b[32m✓ ${name} deployed to ${origin}\x1b[0m`);
  console.log(
    `\n\x1b[2mIf this is a new domain, mail won't arrive until Email Routing is wired:\n` +
      `  zone → Email → Email Routing → enable\n` +
      `  Routing rules → Catch-all → Send to a Worker → ${env.name ?? name}\n` +
      `  pnpm exec wrangler email sending enable <domain>   (per sending domain)\x1b[0m`,
  );
}
