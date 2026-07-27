// Guard for the root `deploy` script (the one-click deploy button's entrypoint).
//
// wrangler.jsonc ships a placeholder database_id. Cloudflare's deploy flow
// rewrites it to a real provisioned database before building, so in that flow
// this check passes silently. Run from a dev machine nothing rewrites it, and
// wrangler fails deep inside the D1 API with an opaque "database could not be
// found [code: 7404]" — after already having tried to migrate.
//
// Fail early, and point at the command the author actually wanted.

import { readFileSync, existsSync } from "node:fs";
import { parseJsonc } from "./lib/jsonc.mjs";
import { WRANGLER_PATH, INSTANCES_PATH } from "./lib/instances.mjs";

const PLACEHOLDER = "00000000-0000-0000-0000-000000000000";

const cfg = parseJsonc(readFileSync(WRANGLER_PATH, "utf8"));
const id = cfg.d1_databases?.[0]?.database_id;

if (id === PLACEHOLDER) {
  let hint = "  pnpm instance:new <name>      # first time on a new domain\n";
  if (existsSync(INSTANCES_PATH)) {
    try {
      const names = Object.keys(parseJsonc(readFileSync(INSTANCES_PATH, "utf8")).env ?? {});
      if (names.length) {
        hint = names.map((n) => `  pnpm instance:deploy ${n}`).join("\n") + "\n";
      }
    } catch {
      /* fall back to the generic hint */
    }
  }

  console.error(
    `\n✗ \`pnpm deploy\` is the one-click deploy button's script, not a local one.\n\n` +
      `  wrangler.jsonc still has the placeholder database_id — Cloudflare rewrites\n` +
      `  it when the button provisions a database. Locally it points at nothing.\n\n` +
      `To deploy one of your own instances:\n\n${hint}`,
  );
  process.exit(1);
}
