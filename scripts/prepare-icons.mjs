import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const iconsDir = join(__dirname, "..", "src-tauri", "icons");
const jsonPath = join(iconsDir, "icons.base64.json");

function ensureIcons() {
  let raw;
  try {
    raw = readFileSync(jsonPath, "utf8");
  } catch (e) {
    console.error(`Icons JSON not found at ${jsonPath}:`, e);
    process.exit(1);
  }
  let mapping;
  try {
    mapping = JSON.parse(raw);
  } catch (e) {
    console.error("Invalid JSON in icons.base64.json:", e);
    process.exit(1);
  }
  if (typeof mapping !== "object" || mapping === null) {
    console.error("icons.base64.json must be a JSON object of {filename: base64}.");
    process.exit(1);
  }
  mkdirSync(iconsDir, { recursive: true });
  for (const [name, b64] of Object.entries(mapping)) {
    try {
      const dest = join(iconsDir, name);
      const buf = Buffer.from(String(b64), "base64");
      if (!buf.length) throw new Error("Decoded buffer is empty");
      writeFileSync(dest, buf);
      console.log(`wrote ${dest}`);
    } catch (e) {
      console.error(`Failed to write icon "${name}":`, e);
      process.exit(1);
    }
  }
}

ensureIcons();
