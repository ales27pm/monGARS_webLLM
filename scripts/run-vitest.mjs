import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const vitestBin = require.resolve("vitest/vitest.mjs");

const forwardedArgs = [];
const filters = [];
let runInBand = false;
let hasModeArg = false;

for (const arg of process.argv.slice(2)) {
  if (arg === "--runInBand" || arg === "-i") {
    runInBand = true;
    continue;
  }
  if (arg === "run" || arg === "watch" || arg === "dev") {
    hasModeArg = true;
  }
  if (arg.startsWith("-")) {
    forwardedArgs.push(arg);
  } else {
    filters.push(arg);
  }
}

if (runInBand) {
  forwardedArgs.push("--pool=threads", "--maxConcurrency=1");
}

if (!hasModeArg) {
  forwardedArgs.unshift("run");
}

if (filters.length > 0) {
  forwardedArgs.push("--testNamePattern", filters.join("|"));
}

const child = spawn(process.execPath, [vitestBin, ...forwardedArgs], {
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

