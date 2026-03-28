import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(rootDir, "dist");
const docsDir = join(rootDir, "docs");

if (!existsSync(distDir)) {
  console.error('Missing dist/ directory. Run "npm run build" first.');
  process.exit(1);
}

rmSync(docsDir, { recursive: true, force: true });
mkdirSync(docsDir, { recursive: true });

cpSync(distDir, docsDir, { recursive: true });
writeFileSync(join(docsDir, ".nojekyll"), "");

const indexHtmlPath = join(docsDir, "index.html");
const spaFallbackPath = join(docsDir, "404.html");
cpSync(indexHtmlPath, spaFallbackPath);

console.log(
  "Prepared docs/ from dist/ for GitHub Pages (including .nojekyll and 404.html).",
);
