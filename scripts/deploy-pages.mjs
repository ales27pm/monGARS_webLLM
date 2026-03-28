import { cpSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { spawnSync } from "node:child_process";

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    stdio: "pipe",
    encoding: "utf8",
    ...options,
  });
  return result;
}

function runOrThrow(cmd, args, options = {}) {
  const result = run(cmd, args, options);
  if (result.status !== 0) {
    const stderr = result.stderr?.trim();
    const stdout = result.stdout?.trim();
    throw new Error(
      `Command failed: ${cmd} ${args.join(" ")}\n${stderr || stdout || ""}`,
    );
  }
  return result;
}

function hasFlag(flag) {
  return process.argv.slice(2).includes(flag);
}

async function confirmPush() {
  if (hasFlag("--yes")) {
    return true;
  }
  if (hasFlag("--no-push")) {
    return false;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const answer = await rl.question(
      "Push prepared docs/ to origin/gh-pages now? [y/N] ",
    );
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

function ensureSafeGitState() {
  runOrThrow("git", ["rev-parse", "--is-inside-work-tree"]);

  const branchResult = run("git", ["branch", "--show-current"]);
  const branch = branchResult.stdout.trim();
  if (!branch) {
    throw new Error(
      "Detached HEAD detected. Check out your deployment branch before running deploy:pages.",
    );
  }

  if (!["main", "master"].includes(branch) && !hasFlag("--allow-any-branch")) {
    throw new Error(
      `Current branch is "${branch}". Use main/master or pass --allow-any-branch.`,
    );
  }

  const dirty = run("git", ["status", "--porcelain"]).stdout.trim();
  if (dirty && !hasFlag("--allow-dirty")) {
    throw new Error(
      "Working tree is not clean. Commit/stash changes or pass --allow-dirty.",
    );
  }
}

function ensureOriginRemote() {
  const remoteResult = run("git", ["remote", "get-url", "origin"]);
  if (remoteResult.status !== 0) {
    throw new Error(
      'Missing git remote "origin". Add one before running deploy:pages push.',
    );
  }
}

function buildDocs() {
  console.log("Building app and preparing docs/ …");
  runOrThrow("npm", ["run", "deploy:pages:docs"], { stdio: "inherit" });
  if (!existsSync("docs/index.html")) {
    throw new Error("docs/index.html not found after prepare step.");
  }
}

function pushDocsToGhPages() {
  ensureOriginRemote();
  const remoteUrl = runOrThrow("git", [
    "remote",
    "get-url",
    "origin",
  ]).stdout.trim();
  const tempDir = mkdtempSync(join(os.tmpdir(), "deploy-pages-"));

  try {
    cpSync("docs", tempDir, { recursive: true });

    runOrThrow("git", ["init"], { cwd: tempDir });
    runOrThrow("git", ["checkout", "-b", "gh-pages"], { cwd: tempDir });
    runOrThrow("git", ["add", "-A"], { cwd: tempDir });
    runOrThrow(
      "git",
      [
        "-c",
        "user.name=pages-bot",
        "-c",
        "user.email=pages-bot@local",
        "commit",
        "-m",
        "Deploy GitHub Pages",
      ],
      { cwd: tempDir },
    );
    runOrThrow("git", ["remote", "add", "origin", remoteUrl], { cwd: tempDir });
    runOrThrow("git", ["push", "--force", "origin", "gh-pages"], {
      cwd: tempDir,
      stdio: "inherit",
    });
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

async function main() {
  try {
    ensureSafeGitState();
    buildDocs();

    const shouldPush = await confirmPush();
    if (!shouldPush) {
      console.log("Skipped push. docs/ is ready for manual publish.");
      return;
    }

    pushDocsToGhPages();
    console.log("Deployment complete: origin/gh-pages updated.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

await main();
