// Shared helpers for the instance-aware scripts (deploy / setup / check-config).

import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseJsonc } from "./jsonc.mjs";

export const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
export const INSTANCES_PATH = join(ROOT, "instances.jsonc");
export const EXAMPLE_PATH = join(ROOT, "instances.example.jsonc");
export const WRANGLER_PATH = join(ROOT, "wrangler.jsonc");

/** Structural keys that must be identical in wrangler.jsonc and instances.jsonc. */
export const STRUCTURAL_KEYS = [
  "main",
  "compatibility_date",
  "compatibility_flags",
  "observability",
  "upload_source_maps",
  "assets",
  "triggers",
];

export function die(msg) {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

/** Read instances.jsonc as { text, cfg }. Exits with guidance when missing. */
export function loadInstances() {
  if (!existsSync(INSTANCES_PATH)) {
    die(
      `instances.jsonc not found.\n\n` +
        `  cp instances.example.jsonc instances.jsonc\n` +
        `  pnpm instance:new <name>\n\n` +
        `It is gitignored on purpose — it holds your hostnames and database ids.`,
    );
  }
  const text = readFileSync(INSTANCES_PATH, "utf8");
  try {
    return { text, cfg: parseJsonc(text) };
  } catch (err) {
    die(`instances.jsonc is not valid JSONC: ${err.message}`);
  }
}

/** Look up env.<name>, or exit listing what does exist. */
export function resolveEnv(cfg, name) {
  const envs = cfg.env ?? {};
  const available = Object.keys(envs);
  if (!name) {
    die(
      `No instance name given.\n\n  pnpm instance:deploy <name>\n\n` +
        `Available: ${available.length ? available.join(", ") : "(none yet — run `pnpm instance:new <name>`)"}`,
    );
  }
  if (!envs[name]) {
    die(
      `No instance "${name}" in instances.jsonc.\n\n` +
        `Available: ${available.length ? available.join(", ") : "(none yet — run `pnpm instance:new <name>`)"}`,
    );
  }
  return envs[name];
}

/**
 * The public origin for an instance, derived from its first route.
 * Handles both custom-domain patterns ("mail.example.com") and route patterns
 * with a path ("mail.example.com/*").
 */
export function originOf(env, name) {
  const pattern = env.routes?.[0]?.pattern;
  if (!pattern) {
    die(
      `Instance "${name}" has no routes[0].pattern, so its public origin can't ` +
        `be derived. Add a route, or deploy it with plain wrangler.`,
    );
  }
  const host = String(pattern).replace(/\/.*$/, "").replace(/\/+$/, "");
  return `https://${host}`;
}

/** Run a command, inheriting stdio. Exits the process on failure. */
export function run(cmd, args, opts = {}) {
  const shown = [cmd, ...args].join(" ");
  console.log(`\n\x1b[2m$ ${shown}\x1b[0m`);
  const res = spawnSync(cmd, args, { stdio: "inherit", cwd: ROOT, ...opts });
  if (res.error) die(`${shown}\n  ${res.error.message}`);
  if (res.status !== 0) die(`${shown}\n  exited with code ${res.status}`);
  return res;
}

/** Run a command and capture stdout (still fails loudly). */
export function capture(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { encoding: "utf8", cwd: ROOT, ...opts });
  if (res.error) die(`${[cmd, ...args].join(" ")}\n  ${res.error.message}`);
  if (res.status !== 0) {
    die(`${[cmd, ...args].join(" ")}\n${res.stdout ?? ""}${res.stderr ?? ""}`);
  }
  return res.stdout ?? "";
}
