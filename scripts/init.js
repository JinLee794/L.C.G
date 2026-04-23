#!/usr/bin/env node

/**
 * Cross-platform environment initializer for L.C.G
 *
 * Usage:
 *   node scripts/init.js          # optional local tooling setup + environment bootstrap
 *   node scripts/init.js --check  # verify runtime prerequisites and local tooling status
 *
 * Exit codes:
 *   0 — success
 *   1 — one or more steps failed
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
import { cpSync } from "node:fs";
import { ensureGithubPackagesAuth } from "./github-packages-auth.js";
import {
  scaffoldVault,
  seedStarter,
  syncSidekick,
  syncStarterConfigs,
  checkConfigIntegrity,
} from "./setup-vault.js";
import { resolveVaultRoot } from "./lib/secure-path.js";

// ── repo root (scripts/ lives one level below) ──────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ── Package-based MCP server definitions ────────────────────────────
// These servers are launched on-demand from npm via npx and do not
// require local source checkout in this repo.
const PACKAGE_SERVERS = [
  {
    name: "msx-crm",
    package: "@microsoft/msx-mcp-server@latest",
  },
  {
    name: "oil (Obsidian Intelligence Layer)",
    package: "@jinlee794/obsidian-intelligence-layer@latest",
    note: "Requires OBSIDIAN_VAULT_PATH to use vault tools.",
  },
];

// ── prerequisite checks ─────────────────────────────────────────────
const PREREQS = [
  { cmd: "node --version", label: "Node.js", minMajor: 18 },
  { cmd: "npm --version", label: "npm" },
];

// ── helpers ─────────────────────────────────────────────────────────
const isWindows = process.platform === "win32";

function run(cmd, cwd) {
  execSync(cmd, {
    cwd,
    stdio: "inherit",
    shell: isWindows ? true : "/bin/sh",
  });
}

function runBestEffort(cmd, cwd = ROOT) {
  try {
    execSync(cmd, {
      cwd,
      stdio: "inherit",
      shell: isWindows ? true : "/bin/sh",
    });
    return true;
  } catch {
    return false;
  }
}

function tryRun(cmd) {
  try {
    return execSync(cmd, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch {
    return null;
  }
}

function heading(text) {
  const bar = "─".repeat(60);
  console.log(`\n${bar}\n  ${text}\n${bar}`);
}

function ok(msg) {
  console.log(`  ✔ ${msg}`);
}
function warn(msg) {
  console.log(`  ⚠ ${msg}`);
}
function info(msg) {
  console.log(`  → ${msg}`);
}
function fail(msg) {
  console.log(`  ✖ ${msg}`);
}

function commandExists(cmd) {
  return Boolean(tryRun(isWindows ? `where ${cmd}` : `command -v ${cmd}`));
}

function ensureOptionalCli(name, verifyCmd, installers) {
  if (tryRun(verifyCmd)) return true;

  info(`${name} not detected. Attempting automatic install...`);

  if (isWindows) {
    if (installers.wingetId && commandExists("winget")) {
      info(`Installing ${name} via winget...`);
      const okInstall = runBestEffort(
        `winget install --id ${installers.wingetId} -e --accept-package-agreements --accept-source-agreements`
      );
      if (okInstall && tryRun(verifyCmd)) {
        ok(`${name} installed via winget.`);
        return true;
      }
    }

    if (installers.chocoPackage && commandExists("choco")) {
      info(`Installing ${name} via Chocolatey...`);
      const okInstall = runBestEffort(`choco install ${installers.chocoPackage} -y`);
      if (okInstall && tryRun(verifyCmd)) {
        ok(`${name} installed via Chocolatey.`);
        return true;
      }
    }
  } else if (process.platform === "darwin" && installers.brewFormula && commandExists("brew")) {
    info(`Installing ${name} via Homebrew...`);
    const okInstall = runBestEffort(`brew install ${installers.brewFormula}`);
    if (okInstall && tryRun(verifyCmd)) {
      ok(`${name} installed via Homebrew.`);
      return true;
    }
  }

  warn(`Automatic install did not complete for ${name}.`);
  if (installers.manualUrl) {
    warn(`  Install manually: ${installers.manualUrl}`);
  }
  return false;
}

function findObsidianDesktop() {
  if (isWindows) {
    const candidates = [
      join(process.env.LOCALAPPDATA || "", "Obsidian", "Obsidian.exe"),
      join(process.env.LOCALAPPDATA || "", "Programs", "Obsidian", "Obsidian.exe"),
      "C:\\Program Files\\Obsidian\\Obsidian.exe",
      "C:\\Program Files (x86)\\Obsidian\\Obsidian.exe",
    ].filter(Boolean);

    for (const appPath of candidates) {
      if (existsSync(appPath)) return appPath;
    }
    return null;
  }

  if (process.platform === "darwin") {
    const appPath = "/Applications/Obsidian.app";
    return existsSync(appPath) ? appPath : null;
  }

  return commandExists("obsidian") ? "obsidian" : null;
}

function isObsidianInstalledByWinget() {
  if (!isWindows || !commandExists("winget")) return false;
  const out = tryRun("winget list --id Obsidian.Obsidian -e");
  return Boolean(out && out.toLowerCase().includes("obsidian"));
}

async function ensureObsidianDesktop({ autoInstall = false } = {}) {
  let obsidianPath = findObsidianDesktop();
  if (obsidianPath) {
    ok(`Obsidian Desktop detected (${obsidianPath})`);
    return true;
  }

  // Interactive mode: ask the user whether to install. Non-interactive shells
  // fall back to the autoInstall flag so CI/scripted runs keep working.
  let shouldInstall = autoInstall;
  if (process.stdin.isTTY) {
    console.log();
    console.log("  Obsidian Desktop is the recommended UI for browsing your vault");
    console.log("  (customer notes, meeting briefs, drafts). It is not strictly required —");
    console.log("  everything is plain Markdown and can be viewed with any editor.");
    const answer = await ask("  Install Obsidian Desktop now? [Y/n]: ");
    const normalized = answer.trim().toLowerCase();
    shouldInstall = normalized === "" || normalized === "y" || normalized === "yes";
  }

  if (!shouldInstall) {
    info("Skipping Obsidian Desktop install.");
    info("  You can install it later from https://obsidian.md/download");
    return false;
  }

  info("Installing Obsidian Desktop...");

  if (isWindows && commandExists("winget")) {
    info("Installing Obsidian via winget...");
    runBestEffort("winget install --id Obsidian.Obsidian -e --accept-package-agreements --accept-source-agreements");
  } else if (process.platform === "darwin" && commandExists("brew")) {
    info("Installing Obsidian via Homebrew...");
    runBestEffort("brew install --cask obsidian");
  } else {
    warn("Automatic Obsidian install is not available on this platform.");
  }

  obsidianPath = findObsidianDesktop();
  if (obsidianPath) {
    ok(`Obsidian Desktop installed (${obsidianPath})`);
    return true;
  }

  // winget may return a non-install outcome when app is already present.
  if (isObsidianInstalledByWinget()) {
    ok("Obsidian Desktop is already installed.");
    return true;
  }

  warn("Obsidian Desktop install did not complete automatically.");
  warn("  Install: https://obsidian.md/download");
  return false;
}

// ── prerequisite validation ─────────────────────────────────────────
async function checkPrereqs({ autoInstallOptional = false } = {}) {
  heading("Checking prerequisites");
  let passed = true;

  for (const { cmd, label, minMajor } of PREREQS) {
    const version = tryRun(cmd);
    if (!version) {
      fail(`${label} not found — install it before continuing.`);
      passed = false;
      continue;
    }
    if (minMajor) {
      const major = parseInt(version.replace(/^v/, ""), 10);
      if (major < minMajor) {
        fail(`${label} ${version} found — need v${minMajor}+`);
        passed = false;
        continue;
      }
    }
    ok(`${label} ${version}`);
  }

  // Azure CLI — optional but recommended
  let azVersion = tryRun("az version --query '\"azure-cli\"' -o tsv");
  if (!azVersion && autoInstallOptional) {
    ensureOptionalCli(
      "Azure CLI",
      "az version --query '\"azure-cli\"' -o tsv",
      {
        wingetId: "Microsoft.AzureCLI",
        chocoPackage: "azure-cli",
        brewFormula: "azure-cli",
        manualUrl: "https://learn.microsoft.com/cli/azure/install-azure-cli",
      }
    );
    azVersion = tryRun("az version --query '\"azure-cli\"' -o tsv");
  }
  if (azVersion) {
    ok(`Azure CLI ${azVersion}`);

    // Check if the user is actually signed in
    let account = tryRun("az account show --query user.name -o tsv");
    if (account) {
      ok(`Signed in as ${account}`);
    } else if (autoInstallOptional && process.stdin.isTTY) {
      // Offer sign-in immediately after install — the Azure CLI context is
      // fresh in the user's terminal, and a cached token here means the rest
      // of setup (MCP server checks, vault sync, any az-backed probes) can
      // proceed without prompting again. We only ask once: the tail end of
      // this script relies on the token being cached here if the user opts in.
      console.log();
      info("Azure sign-in required for CRM / M365-connected workflows.");
      console.log("    Use your Microsoft account (example: alias@microsoft.com).");
      console.log("    During subscription selection, press Enter to accept the default.");
      console.log();

      const runAzLogin = await ask("  Run 'az login' now? [Y/n]: ");
      if (!runAzLogin || runAzLogin.toLowerCase() === "y" || runAzLogin.toLowerCase() === "yes") {
        const loginOk = runBestEffort("az login");
        if (!loginOk) {
          warn("Azure login was not completed. You can run 'az login' later.");
        }
        account = tryRun("az account show --query user.name -o tsv");
        if (account) {
          ok(`Signed in as ${account}`);
        } else {
          warn("Still not signed in. Run 'az login' before using lcg.");
        }
      } else {
        warn("Skipping Azure sign-in. Run 'az login' before using lcg.");
      }
    } else {
      warn("Azure CLI installed but not signed in — run: az login");
    }
  } else {
    warn("Azure CLI not found — needed for CRM authentication.");
    warn("  Install: https://learn.microsoft.com/cli/azure/install-azure-cli");
  }

  let ghVersion = tryRun("gh --version");
  if (!ghVersion && autoInstallOptional) {
    ensureOptionalCli("GitHub CLI", "gh --version", {
      wingetId: "GitHub.cli",
      chocoPackage: "gh",
      brewFormula: "gh",
      manualUrl: "https://github.com/cli/cli#installation",
    });
    ghVersion = tryRun("gh --version");
  }
  if (ghVersion) {
    ok(`GitHub CLI ${ghVersion.split("\n")[0].replace("gh version ", "")}`);
    const ghStatus = tryRun("gh auth status");
    if (ghStatus && ghStatus.includes("read:packages")) {
      ok("GitHub Packages auth available via GitHub CLI");
    } else if (ghStatus) {
      warn("GitHub CLI is signed in, but no account with read:packages was detected.");
      warn("  Run: npm run auth:packages");
    } else {
      warn("GitHub CLI installed but not signed in.");
      warn("  Run: npm run auth:packages");
    }
  } else {
    console.log();
    console.log("  \x1b[1m\x1b[31m╔══════════════════════════════════════════════════════════╗\x1b[0m");
    console.log("  \x1b[1m\x1b[31m║                                                          ║\x1b[0m");
    console.log("  \x1b[1m\x1b[31m║   GitHub CLI (gh) is NOT installed.                      ║\x1b[0m");
    console.log("  \x1b[1m\x1b[31m║   It is required for private MCP package auth.           ║\x1b[0m");
    console.log("  \x1b[1m\x1b[31m║                                                          ║\x1b[0m");
    console.log("  \x1b[1m\x1b[31m║   It will be installed automatically during setup,       ║\x1b[0m");
    console.log("  \x1b[1m\x1b[31m║   or install manually:                                   ║\x1b[0m");
    console.log("  \x1b[1m\x1b[31m║                                                          ║\x1b[0m");
    console.log("  \x1b[1m\x1b[33m║     macOS:    brew install gh                            ║\x1b[0m");
    console.log("  \x1b[1m\x1b[33m║     Windows:  winget install --id GitHub.cli             ║\x1b[0m");
    console.log("  \x1b[1m\x1b[33m║     Linux:    https://github.com/cli/cli#installation    ║\x1b[0m");
    console.log("  \x1b[1m\x1b[31m║                                                          ║\x1b[0m");
    console.log("  \x1b[1m\x1b[31m╚══════════════════════════════════════════════════════════╝\x1b[0m");
    console.log();
  }

  await ensureObsidianDesktop({ autoInstall: autoInstallOptional });

  return passed;
}

// ── server initialization ───────────────────────────────────────────
function initServers() {
  heading("Package-based MCP servers (npx)");
  for (const server of PACKAGE_SERVERS) {
    ok(`${server.name} — resolved at runtime via npx (${server.package})`);
    if (server.note) {
      console.log(`    ${server.note}`);
    }
  }
  console.log("    Private GitHub Packages can be bootstrapped with: npm run auth:packages");

  return true;
}

// ── check-only mode ─────────────────────────────────────────────────
async function checkOnly() {
  const prereqsOk = await checkPrereqs();

  heading("Checking package-based MCP servers");
  for (const server of PACKAGE_SERVERS) {
    ok(`${server.name} — configured for npx package launch (${server.package})`);
    if (server.note) {
      console.log(`    ${server.note}`);
    }
  }
  console.log("    Private GitHub Packages bootstrap: npm run auth:packages");

  if (prereqsOk) {
    heading("Runtime environment is ready ✔");
  } else {
    heading("Runtime prerequisites have issues — fix the errors above");
  }
  return prereqsOk;
}

// ── global alias registration ───────────────────────────────────────
function printAliasFallback() {
  const binPath = join(ROOT, "bin", "lcg.js");
  if (isWindows) {
    const escaped = binPath.replace(/\\/g, "\\\\");
    console.log();
    warn("  Alternatives for PowerShell:");
    warn("");
    warn("  Option 1 — Add a function to your PowerShell profile:");
    warn(`    Add-Content $PROFILE 'function lcg { node "${escaped}" @args }'`);
    warn("    . $PROFILE   # reload your profile");
    warn("");
    warn("  Option 2 — Use from the repo directory:");
    warn("    node bin\\lcg.js");
    warn("");
    warn("  Option 3 — Retry from an elevated terminal:");
    warn("    npm link --ignore-scripts");
  } else {
    warn("  Try: sudo npm link --ignore-scripts");
    warn("  Or with nvm/fnm (no sudo): npm link --ignore-scripts");
  }
}

function quotePsSingle(value) {
  return String(value).replace(/'/g, "''");
}

function ensureUserPathContains(pathEntry) {
  if (!isWindows || !pathEntry) return false;

  const escaped = quotePsSingle(pathEntry);
  const cmd = [
    "$entry='" + escaped + "'",
    "$userPath=[Environment]::GetEnvironmentVariable('Path','User')",
    "if ([string]::IsNullOrWhiteSpace($userPath)) { $userPath='' }",
    "$parts=@()",
    "if ($userPath) { $parts=$userPath -split ';' }",
    "$exists=$parts | Where-Object { $_.Trim().ToLowerInvariant() -eq $entry.ToLowerInvariant() }",
    "if (-not $exists) {",
    "  $next=($userPath.TrimEnd(';') + ';' + $entry).Trim(';')",
    "  [Environment]::SetEnvironmentVariable('Path',$next,'User')",
    "}",
  ].join("; ");

  return runBestEffort(`powershell -NoProfile -ExecutionPolicy Bypass -Command \"${cmd}\"`, ROOT);
}

function addPathToCurrentProcess(pathEntry) {
  if (!pathEntry) return;
  const current = process.env.PATH || "";
  const hasEntry = current
    .split(";")
    .map((p) => p.trim().toLowerCase())
    .includes(pathEntry.trim().toLowerCase());
  if (!hasEntry) {
    process.env.PATH = current ? `${current};${pathEntry}` : pathEntry;
  }
}

function getWindowsCommandCandidates(command) {
  if (!isWindows || !command) return [];

  const out = tryRun(`where ${command}`);
  if (!out) return [];

  return out
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function hasNonPs1WindowsCommand(command) {
  const candidates = getWindowsCommandCandidates(command);
  if (candidates.length === 0) return false;
  return candidates.some((p) => /\.(cmd|exe|bat)$/i.test(p) || /\\[^\\.]+$/i.test(p));
}

function hasReachableLcgCommand() {
  if (!isWindows) return Boolean(tryRun("which lcg"));
  return hasNonPs1WindowsCommand("lcg");
}

function hasLcgShim(npmPrefix) {
  if (!npmPrefix) return false;
  const candidates = [
    join(npmPrefix, "lcg.cmd"),
    join(npmPrefix, "lcg.bat"),
    join(npmPrefix, "lcg"),
  ];
  return candidates.some((p) => existsSync(p));
}

function normalizeLcgShims(npmPrefix) {
  if (!isWindows || !npmPrefix) return;
  const psShim = join(npmPrefix, "lcg.ps1");
  if (existsSync(psShim)) {
    try {
      execSync(`del /f /q "${psShim}"`, { stdio: "pipe", shell: true });
    } catch {
      // Best effort only.
    }
  }
}

function createLcgShims(npmPrefix) {
  if (!isWindows || !npmPrefix) return false;

  try {
    if (!existsSync(npmPrefix)) {
      mkdirSync(npmPrefix, { recursive: true });
    }

    const lcgJs = join(ROOT, "bin", "lcg.js");
    const escapedCmdPath = lcgJs.replace(/"/g, "\\\"");

    const cmdShim = join(npmPrefix, "lcg.cmd");
    writeFileSync(cmdShim, `@echo off\r\nnode "${escapedCmdPath}" %*\r\n`, "utf-8");

    // Do not create a .ps1 shim. On corp-managed machines with Restricted
    // execution policy, PowerShell prefers .ps1 and then blocks execution.
    normalizeLcgShims(npmPrefix);

    return true;
  } catch {
    return false;
  }
}

function ensurePowerShellProfileLcg() {
  if (!isWindows) return false;

  const policy = (tryRun("powershell -NoProfile -Command \"Get-ExecutionPolicy\"") || "").trim().toLowerCase();
  if (policy === "restricted" || policy === "allsigned") {
    return false;
  }

  const lcgJs = join(ROOT, "bin", "lcg.js");
  const escapedPath = lcgJs.replace(/'/g, "''");
  const cmd = [
    "$profilePath=$PROFILE.CurrentUserCurrentHost",
    "$dir=Split-Path -Parent $profilePath",
    "if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }",
    "if (-not (Test-Path $profilePath)) { New-Item -ItemType File -Path $profilePath -Force | Out-Null }",
    `$fn=\"function lcg { node '${escapedPath}' @args }\"`,
    "$raw=Get-Content -Path $profilePath -Raw",
    "if (-not $raw) { $raw='' }",
    "if ($raw -notmatch 'function\\s+lcg\\s*\\{') { Add-Content -Path $profilePath -Value \"`r`n$fn`r`n\" }",
  ].join("; ");

  return runBestEffort(`powershell -NoProfile -ExecutionPolicy Bypass -Command \"${cmd}\"`, ROOT);
}

function registerAlias() {
  console.log();
  console.log("  \x1b[1m\x1b[36m╔══════════════════════════════════════════════════════════╗\x1b[0m");
  console.log("  \x1b[1m\x1b[36m║                                                          ║\x1b[0m");
  console.log("  \x1b[1m\x1b[36m║   Installing the 'lcg' CLI binary globally              ║\x1b[0m");
  console.log("  \x1b[1m\x1b[36m║                                                          ║\x1b[0m");
  console.log("  \x1b[1m\x1b[36m║   This registers bin/lcg.js as a global command so      ║\x1b[0m");
  console.log("  \x1b[1m\x1b[36m║   you can run 'lcg' from any terminal, anywhere.        ║\x1b[0m");
  console.log("  \x1b[1m\x1b[36m║                                                          ║\x1b[0m");
  console.log("  \x1b[1m\x1b[36m╚══════════════════════════════════════════════════════════╝\x1b[0m");
  console.log();

  // Ensure bin script is executable on Unix
  if (!isWindows) {
    const binScript = join(ROOT, "bin", "lcg.js");
    try {
      execSync(`chmod +x "${binScript}"`, { stdio: "pipe" });
    } catch { /* best-effort */ }
  }

  // Check if 'lcg' is already linked and working
  const existing = hasReachableLcgCommand();

  try {
    // --ignore-scripts prevents recursive postinstall
    // --force overwrites if already linked (avoids EEXIST on re-install)
    // Use pipe stdio to suppress noisy npm force/warn output
    execSync("npm link --ignore-scripts --force", {
      cwd: ROOT,
      stdio: ["pipe", "pipe", "pipe"],
      shell: isWindows ? true : "/bin/sh",
    });
  } catch {
    // If link failed but 'lcg' already exists and works, that's fine
    if (existing) {
      ok("'lcg' is already registered globally — no changes needed.");
      return true;
    }

    if (isWindows) {
      const npmPrefix = tryRun("npm config get prefix");
      if (npmPrefix) {
        addPathToCurrentProcess(npmPrefix);
        ensureUserPathContains(npmPrefix);
        createLcgShims(npmPrefix);
      }
      ensurePowerShellProfileLcg();

      if (hasReachableLcgCommand() || (npmPrefix && hasLcgShim(npmPrefix))) {
        ok("'lcg' command was configured automatically.");
        info("If this terminal cannot run 'lcg' yet, open a new PowerShell window.");
        return true;
      }
    }

    warn("Could not register global alias automatically.");
    printAliasFallback();
    return false;
  }

  // npm link on Windows may leave a blocked .ps1 shim; normalize immediately.
  if (isWindows) {
    const npmPrefix = tryRun("npm config get prefix");
    if (npmPrefix) {
      normalizeLcgShims(npmPrefix);
      createLcgShims(npmPrefix);
    }
  }

  // Verify the command is actually reachable after linking
  const found = hasReachableLcgCommand();

  if (found) {
    ok("'lcg' is now available globally — try it from any directory!");
    return true;
  }

  // On Windows, npm link often succeeds but PATH/state is stale.
  if (isWindows) {
    const npmPrefix = tryRun("npm config get prefix");
    if (npmPrefix) {
      normalizeLcgShims(npmPrefix);

      // Ensure shim launchers exist even if npm link succeeds but does not
      // materialize command shims in this environment.
      createLcgShims(npmPrefix);

      const hadPrefixInSession = (process.env.PATH || "")
        .split(";")
        .map((p) => p.trim().toLowerCase())
        .includes(npmPrefix.trim().toLowerCase());

      addPathToCurrentProcess(npmPrefix);
      const persisted = ensureUserPathContains(npmPrefix);
      if (persisted && !hadPrefixInSession) {
        info("Persisted npm global bin path to User PATH.");
      }

      const foundAfterRepair = hasReachableLcgCommand();
      if (foundAfterRepair) {
        ok("'lcg' is now available globally — PATH was repaired automatically.");
        return true;
      }

      // Accept success if the shim exists. In some PowerShell sessions,
      // command discovery lags until a new terminal is opened.
      if (hasLcgShim(npmPrefix)) {
        ok("'lcg' shim was installed and PATH was configured automatically.");
        info("Open a new terminal to use 'lcg' globally.");
        return true;
      }

      // Last automatic fallback: persist a PowerShell profile function.
      if (ensurePowerShellProfileLcg()) {
        ok("PowerShell profile was updated with an 'lcg' function automatically.");
        info("Open a new PowerShell window and run 'lcg'.");
        return true;
      }
    }
  }

  // npm link appeared to succeed but the command isn't callable
  warn("npm link succeeded, but 'lcg' was not found in your PATH.");

  if (isWindows) {
    const npmPrefix = tryRun("npm config get prefix");
    if (npmPrefix) {
      warn(`  npm global bin directory: ${npmPrefix}`);
      warn("");
      warn("  Add it to your PATH for this session:");
      warn(`    $env:PATH += ";${npmPrefix}"`);
      warn("");
      warn("  Or make it permanent:");
      warn(`    [Environment]::SetEnvironmentVariable("PATH", $env:PATH + ";${npmPrefix}", "User")`);
    }

    // Check PowerShell execution policy (common blocker for .ps1 shims)
    const policy = tryRun('powershell -NoProfile -Command "Get-ExecutionPolicy"');
    if (policy && policy.toLowerCase() === "restricted") {
      warn("");
      warn("  PowerShell execution policy is 'Restricted' — .ps1 scripts are blocked.");
      warn("  Fix:  Set-ExecutionPolicy RemoteSigned -Scope CurrentUser");
    }

    printAliasFallback();
  } else {
    warn("  Check: npm config get prefix");
    warn("  Make sure <prefix>/bin is in your PATH.");
  }

  return false;
}

// ── .env configuration ──────────────────────────────────────────────
function parseEnvFile(filePath) {
  const vars = {};
  if (!existsSync(filePath)) return vars;
  const lines = readFileSync(filePath, "utf-8").split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    vars[line.slice(0, eq).trim()] = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  }
  return vars;
}

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (a) => { rl.close(); resolve(a.trim()); }));
}

async function configureEnv() {
  const envPath = join(ROOT, ".env");
  const existing = parseEnvFile(envPath);

  if (existing.OBSIDIAN_VAULT_PATH) {
    ok(`Vault path already configured: ${existing.OBSIDIAN_VAULT_PATH}`);
    return;
  }

  // Skip prompt in non-interactive environments (CI, piped stdin)
  if (!process.stdin.isTTY) {
    const localVault = join(ROOT, ".vault");
    const starterDir = join(ROOT, "vault-starter");
    if (!existsSync(localVault) && existsSync(starterDir)) {
      info("Non-interactive shell — initializing local vault from vault-starter/...");
      cpSync(starterDir, localVault, { recursive: true });
    }
    const envLine = `OBSIDIAN_VAULT_PATH=${localVault}\n`;
    const content = existsSync(envPath) ? readFileSync(envPath, "utf-8") : "";
    writeFileSync(envPath, content + envLine, "utf-8");
    ok(`Vault path set to local .vault/ directory`);
    return;
  }

  heading("Obsidian Vault Configuration");
  const localVault = join(ROOT, ".vault");
  const starterDir = join(ROOT, "vault-starter");

  console.log("  L.C.G. needs an Obsidian vault — plain Markdown files for customer notes,");
  console.log("  meeting history, drafts, and learning corrections. The path is saved to .env");
  console.log("  (gitignored — not committed).\n");
  console.log("  Where should your vault live?\n");
  console.log(`    1) Inside the L.C.G. folder  ${"\x1b[2m"}[recommended — easy to find]${"\x1b[0m"}`);
  console.log(`       ${"\x1b[2m"}→ ${localVault}${"\x1b[0m"}`);
  console.log("    2) Create a new vault at a custom location");
  console.log(`       ${"\x1b[2m"}→ you'll enter a path; the folder will be created if it doesn't exist${"\x1b[0m"}`);
  console.log("    3) Use an existing Obsidian vault");
  console.log(`       ${"\x1b[2m"}→ you'll enter the path to a vault you already have${"\x1b[0m"}`);
  console.log();

  let choice = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const raw = await ask("  Choice [1-3, Enter=1]: ");
    const normalized = raw.trim();
    if (normalized === "" || normalized === "1" || normalized === "2" || normalized === "3") {
      choice = normalized || "1";
      break;
    }
    warn(`Invalid choice "${raw}". Enter 1, 2, or 3.`);
  }
  if (!choice) {
    warn("No valid choice provided — defaulting to option 1 (local .vault/).");
    choice = "1";
  }

  let vaultPath = localVault;

  if (choice === "1") {
    if (!existsSync(localVault) && existsSync(starterDir)) {
      info("Initializing local vault from vault-starter/...");
      cpSync(starterDir, localVault, { recursive: true });
      ok(`Local vault created at ${localVault}`);
    } else if (existsSync(localVault)) {
      ok(`Local vault already exists at ${localVault}`);
    }
  } else if (choice === "2") {
    const raw = (await ask("  New vault path: ")).trim().replace(/^["']|["']$/g, "");
    if (!raw) {
      warn("No path provided — falling back to local .vault/.");
      vaultPath = localVault;
      if (!existsSync(localVault) && existsSync(starterDir)) {
        cpSync(starterDir, localVault, { recursive: true });
      }
    } else {
      vaultPath = resolve(raw);
      if (!existsSync(vaultPath)) {
        info(`Creating new vault at ${vaultPath}`);
        mkdirSync(vaultPath, { recursive: true });
      }
      if (existsSync(starterDir)) {
        info("Seeding vault-starter/ into the new vault...");
        cpSync(starterDir, vaultPath, { recursive: true });
      }
      ok(`Vault created at ${vaultPath}`);
    }
  } else {
    // choice === "3"
    const raw = (await ask("  Path to existing Obsidian vault: ")).trim().replace(/^["']|["']$/g, "");
    if (!raw) {
      warn("No path provided — falling back to local .vault/.");
      vaultPath = localVault;
      if (!existsSync(localVault) && existsSync(starterDir)) {
        cpSync(starterDir, localVault, { recursive: true });
      }
    } else {
      vaultPath = resolve(raw);
      if (!existsSync(vaultPath)) {
        warn(`Path does not exist: ${vaultPath}`);
        warn("Saving anyway — create the vault before starting OIL,");
        warn("or re-run 'npm run vault:init' after creating it.");
      } else {
        ok(`Using existing vault at ${vaultPath}`);
        info("Starter templates (_lcg/, Daily/, Meetings/, …) will be seeded next");
        info("without overwriting any existing files.");
      }
    }
  }

  // Append to .env (preserve any other vars)
  const envLine = `OBSIDIAN_VAULT_PATH=${vaultPath}\n`;
  const content = existsSync(envPath) ? readFileSync(envPath, "utf-8") : "";
  writeFileSync(envPath, content + envLine, "utf-8");
  ok(`Saved to .env: OBSIDIAN_VAULT_PATH=${vaultPath}`);
}

// ── vault sync ──────────────────────────────────────────────────────
function runVaultSync() {
  heading("Vault scaffold & sync");

  // Resolve vault path from .env (just written by configureEnv)
  const envPath = join(ROOT, ".env");
  let vaultPath = null;
  if (existsSync(envPath)) {
    const content = readFileSync(envPath, "utf-8");
    const match = content.match(/^OBSIDIAN_VAULT_PATH\s*=\s*(.+)$/m);
    if (match) vaultPath = match[1].trim().replace(/^["']|["']$/g, "");
  }
  if (!vaultPath) {
    const localVault = join(ROOT, ".vault");
    if (existsSync(localVault)) vaultPath = localVault;
  }

  if (!vaultPath) {
    warn("No vault path configured — skipping vault sync.");
    warn("Run 'npm run vault:sync' after setting OBSIDIAN_VAULT_PATH in .env");
    return;
  }

  let resolved;
  try {
    resolved = resolveVaultRoot(vaultPath);
  } catch (err) {
    warn(`Vault path rejected: ${err.message}`);
    warn("Run 'npm run vault:sync' manually after fixing the path.");
    return;
  }

  // Scaffold base folders
  const { created } = scaffoldVault(resolved);
  if (created.length > 0) {
    ok(`Created ${created.length} vault folder(s).`);
  } else {
    ok("All vault folders already exist.");
  }

  // Seed starter files
  const { seeded } = seedStarter(resolved);
  if (seeded.length > 0) {
    ok(`Seeded ${seeded.length} starter file(s).`);
  } else {
    ok("All starter files already present.");
  }

  // Sync sidekick
  const { copied } = syncSidekick(resolved);
  if (copied.length > 0) {
    ok(`Synced ${copied.length} sidekick file(s).`);
  } else {
    ok("Sidekick is up to date.");
  }

  // Sync _lcg/ and Dashboard/ configs
  const { copied: cfgCopied } = syncStarterConfigs(resolved);
  if (cfgCopied.length > 0) {
    ok(`Synced ${cfgCopied.length} config file(s).`);
  } else {
    ok("Configs are up to date.");
  }

  // Integrity check
  const unauthorized = checkConfigIntegrity(resolved);
  if (unauthorized.length > 0) {
    warn(`${unauthorized.length} unauthorized file(s) in _lcg/ — run 'npm run vault:hygiene'`);
  }
}

// ── main ────────────────────────────────────────────────────────────
const checkMode = process.argv.includes("--check");

if (checkMode) {
  const ok = await checkOnly();
  process.exit(ok ? 0 : 1);
} else {
  const prereqsOk = await checkPrereqs({ autoInstallOptional: true });
  if (!prereqsOk) {
    console.log("\nFix prerequisite issues above, then re-run this script.");
    process.exit(1);
  }

  // ── risk acknowledgement ────────────────────────────────────────
  heading("⚠  Important — Please Read");
  console.log(`
  This toolkit uses agentic AI (GitHub Copilot + MCP servers) to read
  and write CRM records, query M365 data, and suggest strategic actions.

  AI models can produce incorrect, incomplete, or misleading outputs.
  YOU are responsible for reviewing and validating every action.

  By proceeding you acknowledge that:
    • All AI-generated outputs are drafts requiring human judgment.
    • Write operations require your explicit confirmation before executing.
    • You will not rely on AI outputs without independent verification.

  \x1b[1m\x1b[31m⛔ MCP SERVER SECURITY\x1b[0m
    • NEVER add MCP servers you found on the internet, blogs, or Discord.
    • NEVER paste MCP configs someone shared outside the v-team.
    • MCP servers run with YOUR credentials and can access your email,
      calendar, CRM, and Teams. A malicious server = full data breach.
    • Only use the approved servers in .vscode/mcp.json.
    • See README.md "MCP Security" section for the full policy.
`);

  if (process.stdin.isTTY) {
    const consent = await ask("  Type 'yes' to accept and continue installation: ");
    if (consent.toLowerCase() !== "yes") {
      console.log("\n  Setup cancelled. Re-run when you're ready.\n");
      process.exit(0);
    }
  } else {
    warn("Non-interactive shell — proceeding with installation.");
    warn("By using this toolkit you accept the risks described above.");
  }

  const serversOk = initServers();
  if (serversOk) {
    // ── GitHub Packages auth ────────────────────────────────────
    heading("GitHub Packages authentication");
    try {
      await ensureGithubPackagesAuth();
    } catch (err) {
      warn(err.message);
      warn("You can retry later with: npm run auth:packages");
      warn("Or open Copilot Chat (Cmd+Shift+I) and ask: 'Help me debug my MCP package auth setup'");
    }

    await configureEnv();
    runVaultSync();
    const aliasOk = registerAlias();
    heading("All done ✔");

    if (aliasOk) {
      console.log();
      console.log("  \x1b[1m\x1b[32m┌─────────────────────────────────────────────────────────────┐\x1b[0m");
      console.log("  \x1b[1m\x1b[32m│                                                             │\x1b[0m");
      console.log("  \x1b[1m\x1b[32m│   ★  'lcg' CLI installed successfully!                      │\x1b[0m");
      console.log("  \x1b[1m\x1b[32m│                                                             │\x1b[0m");
      console.log("  \x1b[1m\x1b[32m│   Run from any terminal, any directory:                     │\x1b[0m");
      console.log("  \x1b[1m\x1b[32m│                                                             │\x1b[0m");
      console.log("  \x1b[1m\x1b[33m│       lcg                                                   │\x1b[0m");
      console.log("  \x1b[1m\x1b[33m│       lcg -p \"Who am I in MSX?\"                             │\x1b[0m");
      console.log("  \x1b[1m\x1b[32m│                                                             │\x1b[0m");
      console.log("  \x1b[1m\x1b[32m│   Launches Copilot CLI with all L.C.G servers,              │\x1b[0m");
      console.log("  \x1b[1m\x1b[32m│   agents, and skills — no need to cd into the repo.         │\x1b[0m");
      console.log("  \x1b[1m\x1b[32m│                                                             │\x1b[0m");
      console.log("  \x1b[1m\x1b[32m└─────────────────────────────────────────────────────────────┘\x1b[0m");
      console.log();
    } else {
      console.log();
      console.log("  \x1b[1m\x1b[33m┌─────────────────────────────────────────────────────────────┐\x1b[0m");
      console.log("  \x1b[1m\x1b[33m│                                                             │\x1b[0m");
      console.log("  \x1b[1m\x1b[33m│   ⚠  'lcg' CLI was NOT installed globally.                │\x1b[0m");
      console.log("  \x1b[1m\x1b[33m│   See the instructions above to register it manually.      │\x1b[0m");
      console.log("  \x1b[1m\x1b[33m│                                                             │\x1b[0m");
      console.log("  \x1b[1m\x1b[33m└─────────────────────────────────────────────────────────────┘\x1b[0m");
      console.log();
    }

    // Re-check sign-in status for the final message. `az login` was already
    // offered right after the Azure CLI prereq check (see checkPrereqs with
    // autoInstallOptional: true) — don't prompt a second time here.
    const account = tryRun("az account show --query user.name -o tsv");

    if (account) {
      console.log(`
  You're signed in as ${account}. Everything is ready!

  Try it now:
      lcg -p "Who am I in MSX?"

  Optional — for editing skills, prompts, and tasks:
      code .                # opens the repo in VS Code
                            # MCP servers auto-start via .vscode/mcp.json
                            # then open Copilot Chat (Ctrl+Alt+I)
`);
    } else {
      console.log(`
  Almost there — finish Azure sign-in, then you're ready.

  Required:
    1. Connect to Microsoft VPN
    2. Sign in to Azure:    az login
       Use your Microsoft account (example: alias@microsoft.com)
       During subscription selection, press Enter to accept the default

  Try it now:
      lcg -p "Who am I in MSX?"

  Optional — for editing skills, prompts, and tasks:
      code .                # opens the repo in VS Code
                            # MCP servers auto-start via .vscode/mcp.json
                            # then open Copilot Chat (Ctrl+Alt+I)
`);
    }
  } else {
    heading("Some steps failed — see errors above");
    process.exit(1);
  }
}
