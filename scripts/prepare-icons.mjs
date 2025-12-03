import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const iconsDir = join(__dirname, "..", "src-tauri", "icons");
const jsonPath = join(iconsDir, "icons.base64.json");

function ensureIcons() {
  const raw = readFileSync(jsonPath, "utf8");
  const mapping = JSON.parse(raw);
  mkdirSync(iconsDir, { recursive: true });
  Object.entries(mapping).forEach(([name, b64]) => {
    const dest = join(iconsDir, name);
    writeFileSync(dest, Buffer.from(b64, "base64"));
    console.log(`wrote ${dest}`);
  });
}

ensureIcons();
