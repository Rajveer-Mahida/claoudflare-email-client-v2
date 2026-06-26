// One-shot icon/PNG generator for Driftmail brand assets.
// Renders PNGs from the master SVGs in public/ using sharp.
// Run once: `node scripts/gen-icons.mjs` (sharp is resolved via npx if not installed).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

// sharp is a one-shot devtime dep; allow loading it from an external location
// (e.g. SHARP_DIR=/path/to/node_modules) so it need not pollute the monorepo.
const require = createRequire(import.meta.url);
const sharp = process.env.SHARP_DIR
  ? require(join(process.env.SHARP_DIR, "sharp"))
  : require("sharp");

const pub = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
const favicon = readFileSync(join(pub, "favicon.svg"));
const ogCard = readFileSync(join(pub, "og-card.svg"));

const jobs = [
  [favicon, 16, "favicon-16.png"],
  [favicon, 32, "favicon-32.png"],
  [favicon, 180, "apple-touch-icon.png"],
  [favicon, 192, "icon-192.png"],
  [favicon, 512, "icon-512.png"],
];

for (const [svg, size, name] of jobs) {
  await sharp(svg, { density: 384 }).resize(size, size).png().toFile(join(pub, name));
  console.log(`✓ ${name} (${size}×${size})`);
}

await sharp(ogCard, { density: 192 }).resize(1200, 630).png().toFile(join(pub, "og-image.png"));
console.log("✓ og-image.png (1200×630)");
