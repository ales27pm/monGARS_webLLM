import { createRequire } from 'node:module';
import process from 'node:process';

const require = createRequire(import.meta.url);

const requiredDependencies = ['zod'];

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
