#!/usr/bin/env node

/**
 * bootstrap.js — cross-platform project bootstrap.
 *
 * Runs the one-time onboarding flow:
 *   1. Verify required prerequisites (Node, npm, git, optional: az, copilot).
 *   2. `npm install` to pull dependencies.
 *   3. Delegate to scripts/init.js for MCP / env setup + CLI linking.
 *
 * Usage:
 *   node scripts/bootstrap.js            # full bootstrap
 *   node scripts/bootstrap.js --check    # verify prereqs only, no changes
 *   node scripts/bootstrap.js --skip-install
 *
 * Note: Node.js (>=18) and npm must already be installed. If they aren't,
 * install them first via your package manager:
 *   macOS:    brew install node
 *   Linux:    apt/yum/dnf install nodejs npm  (or use nvm)
 *   Windows:  winget install OpenJS.NodeJS    (or use nvm-windows)
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { platform } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const args = process.argv.slice(2);
const CHECK_ONLY = args.includes("--check") || args.includes("--check-only");
const SKIP_INSTALL = args.includes("--skip-install");

const isWin = platform() === "win32";
const C = {
  reset: "\x1b[0m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  blue: "\x1b[34m",
  bold: "\x1b[1m",
};

function step(msg) { console.log(`\n${C.cyan}━━━ ${msg} ━━━${C.reset}`); }
function ok(msg)   { console.log(`  ${C.green}✔ ${msg}${C.reset}`); }
function warn(msg) { console.log(`  ${C.yellow}⚠ ${msg}${C.reset}`); }
function fail(msg) { console.log(`  ${C.red}✖ ${msg}${C.reset}`); }
function info(msg) { console.log(`  ${C.blue}→ ${msg}${C.reset}`); }

function has(cmd) {
  const r = spawnSync(isWin ? "where" : "which", [cmd], { stdio: "ignore" });
  return r.status === 0;
}

function version(cmd, flag = "--version") {
  const r = spawnSync(cmd, [flag], { encoding: "utf-8" });
  if (r.status !== 0) return null;
  return (r.stdout || r.stderr).trim().split("\n")[0];
}

function run(cmd, cmdArgs, opts = {}) {
  const r = spawnSync(cmd, cmdArgs, { stdio: "inherit", cwd: ROOT, ...opts });
  return r.status ?? 1;
}

function runQuiet(cmd, cmdArgs, opts = {}) {
  const r = spawnSync(cmd, cmdArgs, { stdio: "ignore", cwd: ROOT, ...opts });
  return r.status ?? 1;
}

function installWithWingetOrChoco(wingetId, chocoPkg) {
  if (!isWin) return false;

  if (has("winget")) {
    const rc = run("winget", [
      "install",
      "--id",
      wingetId,
      "-e",
      "--silent",
      "--accept-package-agreements",
      "--accept-source-agreements",
    ]);
    if (rc === 0) return true;
  }

  if (has("choco")) {
    const rc = run("choco", ["install", chocoPkg, "-y"]);
    if (rc === 0) return true;
  }

  return false;
}

function hasGhCopilot() {
  if (!has("gh")) return false;
  return runQuiet("gh", ["copilot", "--help"]) === 0;
}

function installAzureCli() {
  if (has("az")) return true;
  if (!isWin) return false;

  info("Azure CLI missing - installing...");
  const installed = installWithWingetOrChoco("Microsoft.AzureCLI", "azure-cli");
  return installed && has("az");
}

function installCopilotCli() {
  if (has("copilot") || hasGhCopilot()) return true;

  if (isWin) {
    info("Copilot CLI missing - installing...");

    // Primary path: npm package that provides the `copilot` command.
    const npmRc = run("cmd.exe", ["/d", "/s", "/c", "npm install -g @githubnext/github-copilot-cli"]);
    if (npmRc === 0 && has("copilot")) return true;

    // Fallback path: gh + gh-copilot extension.
    if (!has("gh")) {
      installWithWingetOrChoco("GitHub.cli", "gh");
    }
    if (has("gh")) {
      run("gh", ["extension", "install", "github/gh-copilot"]);
      if (hasGhCopilot()) return true;
    }
  }

  return has("copilot") || hasGhCopilot();
}

function npmVersion() {
  if (isWin) {
    const r = spawnSync("cmd.exe", ["/d", "/s", "/c", "npm --version"], { encoding: "utf-8" });
    if (r.status !== 0) return null;
    return (r.stdout || r.stderr).trim().split("\n")[0];
  }
  return version("npm");
}

function npmInstall() {
  if (isWin) {
    return run("cmd.exe", ["/d", "/s", "/c", "npm install --no-audit --no-fund"]);
  }
  return run("npm", ["install", "--no-audit", "--no-fund"]);
}

// ── Step 1: prereq checks ───────────────────────────────────────────
step("Checking prerequisites");

let allGood = true;

// Node
const nodeVer = process.versions.node;
const nodeMajor = parseInt(nodeVer.split(".")[0], 10);
if (nodeMajor >= 18) {
  ok(`Node.js v${nodeVer}`);
} else {
  fail(`Node.js v${nodeVer} is too old (need >= 18)`);
  allGood = false;
}

// npm
if (has("npm")) {
  ok(`npm ${npmVersion() || "(version unknown)"}`);
} else {
  fail("npm not found");
  allGood = false;
}

// git
if (has("git")) {
  ok(version("git") || "git");
} else {
  warn("git not found — required for repo operations");
}

// Azure CLI
let hasAz = has("az");
if (!hasAz && !CHECK_ONLY) {
  hasAz = installAzureCli();
}
if (hasAz) {
  const azRaw = version("az", "version");
  // `az version` outputs JSON; extract the azure-cli value.
  const azVer = azRaw?.match(/"azure-cli":\s*"([^"]+)"/)?.[1] || azRaw?.replace(/[{}\s]/g, "") || "Azure CLI";
  ok(`Azure CLI ${azVer}`);
} else {
  if (CHECK_ONLY) {
    warn("Azure CLI (`az`) not found");
  } else {
    fail("Azure CLI installation failed");
    allGood = false;
  }
}

// GitHub Copilot CLI
let hasCopilot = has("copilot") || hasGhCopilot();
if (!hasCopilot && !CHECK_ONLY) {
  hasCopilot = installCopilotCli();
}
if (hasCopilot) {
  ok("GitHub Copilot CLI available");
} else {
  if (CHECK_ONLY) {
    warn("GitHub Copilot CLI not found");
  } else {
    fail("GitHub Copilot CLI installation failed");
    allGood = false;
  }
}

// pwsh (optional, only needed for setup-outlook-rules)
if (has("pwsh")) {
  ok(`PowerShell Core: ${version("pwsh") || "present"}`);
} else if (isWin) {
  info("Windows PowerShell is present; setup-outlook-rules will use it.");
} else {
  warn("`pwsh` not found — required only for setup-outlook-rules");
}

if (!allGood) {
  console.log(`\n${C.red}One or more critical prerequisites are missing. Fix the above and re-run.${C.reset}`);
  process.exit(1);
}

if (CHECK_ONLY) {
  console.log(`\n${C.green}✔ Prereq check complete (no changes made).${C.reset}`);
  process.exit(0);
}

// ── Step 2: npm install ─────────────────────────────────────────────
if (!SKIP_INSTALL) {
  step("Installing npm dependencies");
  if (!existsSync(join(ROOT, "package.json"))) {
    fail("package.json not found — are you running this from inside the repo?");
    process.exit(1);
  }
  const rc = npmInstall();
  if (rc !== 0) {
    fail("npm install failed");
    process.exit(rc);
  }
  ok("Dependencies installed");
}

// ── Step 3: delegate to init.js ─────────────────────────────────────
step("Running environment initializer");
const rc2 = run(process.execPath, [join(ROOT, "scripts", "init.js")]);
if (rc2 !== 0) {
  fail(`init.js exited with code ${rc2}`);
  process.exit(rc2);
}

console.log(`\n${C.bold}${C.green}✔ Bootstrap complete.${C.reset}`);
console.log(`  Next: ${C.yellow}npm run task:list${C.reset} to see available automations.`);
