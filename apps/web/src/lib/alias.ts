// Random alias generator — ported from legacy components/sidebar.tsx.

const ADJS = [
  "async", "static", "typed", "lazy", "eager", "cached", "secure", "native",
  "agile", "stable", "modular", "atomic", "binary", "linear", "virtual",
  "proxy", "local", "global", "dense", "sparse",
];
const NOUNS = [
  "stack", "cache", "queue", "token", "scope", "build", "fetch", "hook",
  "query", "patch", "docker", "socket", "kernel", "lambda", "shader",
  "mutex", "cron", "redis", "pixel", "worker",
];

const SUFFIX = "smi";

export function randomAlias(domain: string): string {
  const adj = ADJS[Math.floor(Math.random() * ADJS.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(1000 + Math.random() * 9000);
  return `${adj}-${noun}-${num}.${SUFFIX}@${domain}`;
}
