// Run the worker locally against a REAL instance's remote D1/R2.
//
//   pnpm dev:api:remote <name>
//
// Plain `pnpm dev:api` uses a local D1 and never touches production — prefer it.
// This exists for the times you need real data, and it names the instance
// explicitly so it can't happen by accident.

import { loadInstances, resolveEnv, run, INSTANCES_PATH } from "./lib/instances.mjs";

const name = process.argv[2];
const { cfg } = loadInstances();
const env = resolveEnv(cfg, name);

console.log(
  `\n\x1b[33m⚠ Connecting to the REMOTE resources of "${name}" ` +
    `(D1 ${env.d1_databases?.[0]?.database_name}, R2 ${env.r2_buckets?.[0]?.bucket_name}).\n` +
    `  Writes here are real. Use \`pnpm dev:api\` for a local database.\x1b[0m`,
);

run("pnpm", [
  "exec",
  "wrangler",
  "dev",
  "--remote",
  "--port",
  "8787",
  "-c",
  INSTANCES_PATH,
  "-e",
  name,
]);
