import { createRequire } from 'node:module';
import process from 'node:process';

const require = createRequire(import.meta.url);

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(join(__dirname, '..', 'package.json'), 'utf-8')
);
const requiredDependencies = [
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.devDependencies || {}),
];

const missing = requiredDependencies.filter((dep) => {
  try {
    require.resolve(dep);
    return false;
  } catch {
    return true;
  }
});

if (missing.length > 0) {
  console.error(`Missing dependencies detected: ${missing.join(', ')}`);
  console.error(
    'Run "npm install" to install project dependencies before starting the dev server.'
  );
  process.exitCode = 1;
}
