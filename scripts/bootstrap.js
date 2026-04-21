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

// After `winget install` succeeds, the new tool's install directory is added to
// the Machine or User PATH in the registry, but the current Node process still
// has the stale PATH it inherited. Re-read both registry hives and merge into
// process.env.PATH so subsequent `has()` / `where` checks can see the new tools
// without requiring a shell restart.
function refreshWindowsPath() {
  if (!isWin) return;

  const readRegPath = (hive, keyPath) => {
    const r = spawnSync(
      "reg.exe",
      ["query", `${hive}\\${keyPath}`, "/v", "Path"],
      { encoding: "utf-8" }
    );
    if (r.status !== 0) return "";
    // Output format: "    Path    REG_EXPAND_SZ    C:\...;C:\..."
    const match = (r.stdout || "").match(/Path\s+REG_(?:EXPAND_)?SZ\s+(.+)/i);
    return match ? match[1].trim() : "";
  };

  const machinePath = readRegPath(
    "HKLM",
    "SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment"
  );
  const userPath = readRegPath("HKCU", "Environment");

  const current = process.env.PATH || "";
  const merged = [current, machinePath, userPath]
    .filter(Boolean)
    .join(";")
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean);

  // Dedupe case-insensitively while preserving order.
  const seen = new Set();
  const deduped = [];
  for (const p of merged) {
    const key = p.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(p);
    }
  }
  process.env.PATH = deduped.join(";");
}

// When a tool is just installed by winget but `where` can't see it (stale PATH,
// shim not yet wired), fall back to well-known install directories.
function findKnownWindowsBinary(relativePaths) {
  if (!isWin) return null;
  const roots = [
    process.env["ProgramFiles"],
    process.env["ProgramFiles(x86)"],
    process.env["LocalAppData"],
  ].filter(Boolean);
  for (const root of roots) {
    for (const rel of relativePaths) {
      const full = join(root, rel);
      if (existsSync(full)) return full;
    }
  }
  return null;
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
    if (rc === 0) {
      refreshWindowsPath();
      return true;
    }
  }

  if (has("choco")) {
    const rc = run("choco", ["install", chocoPkg, "-y"]);
    if (rc === 0) {
      refreshWindowsPath();
      return true;
    }
  }

  return false;
}

function hasGhCopilot() {
  if (!has("gh")) return false;
  return runQuiet("gh", ["copilot", "--help"]) === 0;
}

function hasRunnableCopilot() {
  if (!isWin) {
    return has("copilot") && runQuiet("copilot", ["--version"]) === 0;
  }

  const where = spawnSync("where", ["copilot"], { encoding: "utf-8" });
  const candidates = where.status === 0
    ? (where.stdout || "")
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean)
        .filter((p) => /\.(cmd|exe)$/i.test(p))
    : [];

  // Fallback: probe the npm global prefix directly. `where` may miss it when
  // PATH was updated mid-session and hasn't been picked up by the child
  // process's resolver, or when the shim is a .ps1 without a .cmd sibling.
  if (candidates.length === 0) {
    const p = spawnSync("cmd.exe", ["/d", "/s", "/c", "npm config get prefix"], { encoding: "utf-8" });
    if (p.status === 0) {
      const prefix = (p.stdout || "").trim();
      if (prefix) {
        for (const name of ["copilot.cmd", "copilot.exe"]) {
          const full = join(prefix, name);
          if (existsSync(full)) candidates.push(full);
        }
      }
    }
  }

  if (candidates.length === 0) return false;
  return runQuiet(candidates[0], ["--version"]) === 0;
}

function ensurePathHasNpmPrefix() {
  if (!isWin) return;
  const p = spawnSync("cmd.exe", ["/d", "/s", "/c", "npm config get prefix"], { encoding: "utf-8" });
  if (p.status !== 0) return;

  const prefix = (p.stdout || "").trim();
  if (!prefix) return;

  const parts = (process.env.PATH || "").split(";").map((x) => x.trim().toLowerCase());
  if (!parts.includes(prefix.toLowerCase())) {
    process.env.PATH = process.env.PATH ? `${process.env.PATH};${prefix}` : prefix;
  }
}

function normalizeCopilotShim() {
  if (!isWin) return;
  const p = spawnSync("cmd.exe", ["/d", "/s", "/c", "npm config get prefix"], { encoding: "utf-8" });
  if (p.status !== 0) return;
  const prefix = (p.stdout || "").trim();
  if (!prefix) return;

  const psShim = join(prefix, "copilot.ps1");
  if (existsSync(psShim)) {
    runQuiet("cmd.exe", ["/d", "/s", "/c", `del /f /q "${psShim}"`]);
  }
}

function installAzureCli() {
  if (has("az")) return true;
  if (!isWin) return false;

  info("Azure CLI missing - installing...");
  const installed = installWithWingetOrChoco("Microsoft.AzureCLI", "azure-cli");
  if (!installed) return false;

  // winget sometimes returns before the new PATH entry is visible to the
  // current process, even after refreshWindowsPath(). Fall back to the
  // canonical install path if `where az` still can't see it.
  if (has("az")) return true;

  const azBin = findKnownWindowsBinary([
    "Microsoft SDKs\\Azure\\CLI2\\wbin\\az.cmd",
  ]);
  if (azBin) {
    const dir = dirname(azBin);
    process.env.PATH = `${process.env.PATH || ""};${dir}`;
    return has("az");
  }
  return false;
}

function installCopilotCli() {
  if (hasRunnableCopilot()) return true;

  info("Copilot CLI missing - installing official @github/copilot npm package...");

  // Primary path: the OFFICIAL GitHub Copilot CLI npm package, which provides
  // the `copilot` binary. Note: @githubnext/github-copilot-cli is the old
  // deprecated preview (it installs `github-copilot-cli` / `??`, NOT `copilot`)
  // and must not be used here.
  const npmCmd = isWin ? "cmd.exe" : "npm";
  const npmArgs = isWin
    ? ["/d", "/s", "/c", "npm install -g @github/copilot"]
    : ["install", "-g", "@github/copilot"];
  const npmRc = run(npmCmd, npmArgs);
  if (npmRc === 0) {
    ensurePathHasNpmPrefix();
    normalizeCopilotShim();
    if (hasRunnableCopilot()) return true;
  }

  // Fallback path: gh + gh-copilot extension (Windows only; macOS/Linux users
  // typically already have this wired up through the official package above).
  if (isWin) {
    if (!has("gh")) {
      installWithWingetOrChoco("GitHub.cli", "gh");
    }
    if (has("gh")) {
      runQuiet("gh", ["extension", "remove", "github/gh-copilot"]);
      run("gh", ["extension", "install", "github/gh-copilot"]);
      if (hasGhCopilot()) return true;
    }
  }

  return hasRunnableCopilot() || hasGhCopilot();
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

// GitHub Copilot CLI — prefer the real `copilot` binary. Only treat `gh copilot`
// as acceptable when the official CLI cannot be installed at all.
let hasCopilot = hasRunnableCopilot();
if (!hasCopilot && !CHECK_ONLY) {
  hasCopilot = installCopilotCli();
}
if (hasCopilot) {
  if (hasRunnableCopilot()) {
    ok("GitHub Copilot CLI available (copilot)");
  } else {
    ok("GitHub Copilot CLI available (gh copilot fallback)");
  }
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
