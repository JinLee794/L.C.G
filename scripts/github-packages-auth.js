#!/usr/bin/env node
// Suppress DEP0190 — all shell args are program-controlled, not user input.
process.removeAllListeners("warning");
const _origEmit = process.emit;
process.emit = function (name, data) {
  if (name === "warning" && data?.name === "DeprecationWarning" && data?.code === "DEP0190") return false;
  return _origEmit.apply(process, arguments);
};

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";

const ROOT = resolve(import.meta.dirname, "..");
export const NPMRC_PATH = resolve(homedir(), ".npmrc");

const HOST = "github.com";
const REGISTRY = "https://npm.pkg.github.com";
const MANAGED_START = "# >>> L.C.G github-packages auth >>>";
const MANAGED_END = "# <<< L.C.G github-packages auth <<<";
const NPMJS = "https://registry.npmjs.org";
const PRIVATE_PACKAGES = [
  { name: "@microsoft/msx-mcp-server", registry: REGISTRY },
  { name: "@jinlee794/obsidian-intelligence-layer", registry: REGISTRY },
];
const PUBLIC_PACKAGES = [
  { name: "@microsoft/workiq", registry: NPMJS },
];

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: ROOT,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
    // On Windows, npm/npx are .cmd batch files that require a shell to execute.
    shell: process.platform === "win32",
    ...options,
  }).trim();
}

function ensureGhOnPath() {
  if (process.platform !== "win32") return;

  const candidates = [
    "C:\\Program Files\\GitHub CLI",
    "C:\\Program Files (x86)\\GitHub CLI",
    "C:\\Users\\Public\\scoop\\apps\\gh\\current\\bin",
  ];

  for (const dir of candidates) {
    if (!existsSync(join(dir, "gh.exe"))) continue;
    const pathParts = (process.env.PATH || "").split(";").map((p) => p.trim().toLowerCase());
    if (!pathParts.includes(dir.toLowerCase())) {
      process.env.PATH = `${process.env.PATH};${dir}`;
    }
    break;
  }
}

function hasGhCli() {
  ensureGhOnPath();

  const candidates = process.platform === "win32"
    ? [
        "gh",
        "C:\\Program Files\\GitHub CLI\\gh.exe",
        "C:\\Program Files (x86)\\GitHub CLI\\gh.exe",
        "C:\\Users\\Public\\scoop\\apps\\gh\\current\\bin\\gh.exe",
      ]
    : ["gh"];

  for (const cmd of candidates) {
    const result = spawnSync(cmd, ["--version"], { stdio: "ignore", shell: process.platform === "win32" && cmd === "gh" });
    if (!result.error && result.status === 0) return true;
  }

  return false;
}

function hasCommand(cmd) {
  const result = spawnSync(process.platform === "win32" ? "where" : "which", [cmd], { stdio: "ignore" });
  return !result.error && result.status === 0;
}

async function tryInstallGhCli() {
  const isWin = process.platform === "win32";
  const isMac = process.platform === "darwin";

  process.stderr.write("\n");
  process.stderr.write("  \x1b[1m\x1b[31m╔══════════════════════════════════════════════════════════╗\x1b[0m\n");
  process.stderr.write("  \x1b[1m\x1b[31m║                                                          ║\x1b[0m\n");
  process.stderr.write("  \x1b[1m\x1b[31m║   GitHub CLI (gh) is required but not installed.         ║\x1b[0m\n");
  process.stderr.write("  \x1b[1m\x1b[31m║                                                          ║\x1b[0m\n");
  process.stderr.write("  \x1b[1m\x1b[31m╚══════════════════════════════════════════════════════════╝\x1b[0m\n");
  process.stderr.write("\n");

  // Detect available package manager and attempt auto-install
  if (isMac && hasCommand("brew")) {
    process.stdout.write("[auth:packages] Detected macOS with Homebrew. Installing GitHub CLI…\n");
    const result = spawnSync("brew", ["install", "gh"], { cwd: ROOT, stdio: "inherit" });
    if (!result.error && result.status === 0) {
      process.stdout.write("[auth:packages] GitHub CLI installed successfully.\n");
      return;
    }
    process.stderr.write("[auth:packages] Homebrew install failed.\n");
  } else if (isWin && hasCommand("winget")) {
    process.stdout.write("[auth:packages] Detected Windows with winget. Installing GitHub CLI…\n");
    const result = spawnSync("winget", ["install", "--id", "GitHub.cli", "-e", "--silent", "--accept-package-agreements", "--accept-source-agreements"], { cwd: ROOT, stdio: "inherit" });
    if ((!result.error && result.status === 0) || hasGhCli()) {
      ensureGhOnPath();
      process.stdout.write("[auth:packages] GitHub CLI is available.\n");
      return;
    }
    process.stderr.write("[auth:packages] winget install failed.\n");
  } else if (isWin && hasCommand("choco")) {
    process.stdout.write("[auth:packages] Detected Windows with Chocolatey. Installing GitHub CLI…\n");
    const result = spawnSync("choco", ["install", "gh", "-y"], { cwd: ROOT, stdio: "inherit", shell: true });
    if ((!result.error && result.status === 0) || hasGhCli()) {
      ensureGhOnPath();
      process.stdout.write("[auth:packages] GitHub CLI is available.\n");
      return;
    }
    process.stderr.write("[auth:packages] Chocolatey install failed.\n");
  } else if (isWin) {
    process.stderr.write("[auth:packages] winget not found. Install GitHub CLI manually:\n");
    process.stderr.write("  https://cli.github.com/\n");
    process.stderr.write("  Then run: $env:Path += \";C:\\Program Files\\GitHub CLI\"\n\n");
  } else if (isMac) {
    process.stderr.write("[auth:packages] Homebrew not found. Install GitHub CLI manually:\n");
    process.stderr.write("  https://cli.github.com/\n\n");
  } else {
    // Linux
    process.stderr.write("[auth:packages] Auto-install not available on this platform. Install GitHub CLI manually:\n");
    process.stderr.write("  https://github.com/cli/cli#installation\n\n");
  }

  // If we couldn't auto-install and we're interactive, wait for the user
  if (process.stdin.isTTY) {
    await ask("  Press Enter after installing GitHub CLI to continue…");
  }
}

function parseScopes(line) {
  const scopes = [];
  for (const match of line.matchAll(/'([^']+)'/g)) {
    scopes.push(match[1]);
  }
  if (scopes.length > 0) return scopes;
  const colon = line.indexOf(":");
  if (colon === -1) return [];
  return line
    .slice(colon + 1)
    .split(",")
    .map((scope) => scope.trim().replace(/^'+|'+$/g, ""))
    .filter(Boolean);
}

function getGhAccounts() {
  const output = run("gh", ["auth", "status", "--hostname", HOST]);
  const accounts = [];
  let current = null;

  for (const rawLine of output.split("\n")) {
    const line = rawLine.trimEnd();
    const accountMatch = line.match(/^\s*[✓*]\s+Logged in to github\.com account\s+(.+?)\s+\(/);
    if (accountMatch) {
      current = {
        user: accountMatch[1],
        active: false,
        scopes: [],
      };
      accounts.push(current);
      continue;
    }

    if (!current) continue;

    if (line.includes("Active account:")) {
      current.active = line.toLowerCase().includes("true");
      continue;
    }

    if (line.includes("Token scopes:")) {
      current.scopes = parseScopes(line);
    }
  }

  return accounts;
}

function hasReadPackages(account) {
  return account.scopes.includes("read:packages") || account.scopes.includes("write:packages");
}

function selectAccount(accounts) {
  const eligible = accounts.filter(hasReadPackages);
  if (eligible.length === 0) return null;
  if (eligible.length === 1) return eligible[0];

  // If only one is active, use it without prompting
  const active = eligible.find((a) => a.active);
  if (eligible.length === 2 && active) return active;

  return null; // caller will prompt
}

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (a) => { rl.close(); resolve(a.trim()); }));
}

async function promptAccountChoice(accounts) {
  const eligible = accounts.filter(hasReadPackages);
  process.stdout.write("\n[auth:packages] Multiple GitHub accounts have read:packages:\n");
  eligible.forEach((a, i) => {
    const tag = a.active ? " (active)" : "";
    process.stdout.write(`  ${i + 1}) ${a.user}${tag}\n`);
  });

  if (!process.stdin.isTTY) {
    const active = eligible.find((a) => a.active);
    process.stdout.write(`[auth:packages] Non-interactive shell — using ${active ? active.user : eligible[0].user}.\n`);
    return active || eligible[0];
  }

  const answer = await ask(`\n  Select account [1-${eligible.length}]: `);
  const idx = parseInt(answer, 10) - 1;
  if (idx >= 0 && idx < eligible.length) return eligible[idx];

  process.stdout.write(`  Invalid selection — using ${eligible[0].user}.\n`);
  return eligible[0];
}

function buildManagedBlock(token, account) {
  return [
    MANAGED_START,
    `# Managed by L.C.G for GitHub account: ${account}`,
    `//npm.pkg.github.com/:_authToken=${token}`,
    MANAGED_END,
  ].join("\n");
}

function upsertManagedBlock(filePath, block) {
  let current = existsSync(filePath) ? readFileSync(filePath, "utf-8") : "";
  // Remove blanket @microsoft scope routing — it breaks public @microsoft packages
  current = current.replace(/^@microsoft:registry=https:\/\/npm\.pkg\.github\.com\n?/gm, "");
  // Remove our existing managed block
  const pattern = new RegExp(`${MANAGED_START}[\\s\\S]*?${MANAGED_END}\\n?`, "m");
  current = current.replace(pattern, "");
  // Remove other tools' managed blocks for the same registry (e.g. lcg)
  // to prevent stale token conflicts — only one authToken per registry should exist
  current = current.replace(/^# >>> .+ github-packages auth >>>[\s\S]*?# <<< .+ github-packages auth <<<\n?/gm, "");
  // Remove any bare //npm.pkg.github.com/:_authToken lines (stale PATs from manual edits)
  current = current.replace(/^\/\/npm\.pkg\.github\.com\/:_authToken=.+\n?/gm, "");
  // Collapse excessive blank lines left by removals
  current = current.replace(/\n{3,}/g, "\n\n");
  const next = `${current.replace(/\s*$/, "")}${current.trim() ? "\n\n" : ""}${block}\n`;
  writeFileSync(filePath, next, "utf-8");
}

async function loginForPackages(accounts) {
  if (!process.stdin.isTTY) {
    throw new Error("GitHub Packages auth is required, but the shell is non-interactive. Run 'gh auth login --web --scopes read:packages' first.");
  }

  // Bold warning about EMU accounts
  process.stdout.write("\n");
  process.stdout.write("  \x1b[1m\x1b[33m\u2588\u2588 IMPORTANT: Use your PERSONAL GitHub account (e.g. JohnDoe)      \u2588\u2588\x1b[0m\n");
  process.stdout.write("  \x1b[1m\x1b[33m\u2588\u2588 Do NOT use your Enterprise Managed (EMU) account               \u2588\u2588\x1b[0m\n");
  process.stdout.write("  \x1b[1m\x1b[33m\u2588\u2588 (the one ending in _microsoft).                                \u2588\u2588\x1b[0m\n");
  process.stdout.write("\n");

  // If there are existing accounts, offer to refresh one
  if (accounts && accounts.length > 0) {
    process.stdout.write("[auth:packages] Which GitHub account should we authorize for packages?\n");
    const options = [...accounts.map((a) => a.user), "Sign in with a different account"];
    options.forEach((opt, i) => {
      const isEmu = accounts[i]?.user.endsWith("_microsoft");
      const tag = [accounts[i]?.active ? "active" : "", isEmu ? "\x1b[31mEMU \u2014 not recommended\x1b[0m" : ""].filter(Boolean).join(", ");
      const prefix = isEmu ? "\x1b[2m" : "";
      const suffix = isEmu ? "\x1b[0m" : "";
      process.stdout.write(`  ${i + 1}) ${prefix}${opt}${tag ? ` (${tag})` : ""}${suffix}\n`);
    });

    const answer = await ask(`\n  Select [1-${options.length}]: `);
    const idx = parseInt(answer, 10) - 1;

    if (idx >= 0 && idx < accounts.length) {
      // Switch to selected account, then refresh to add read:packages scope
      const user = accounts[idx].user;
      process.stdout.write(`[auth:packages] Switching to ${user} and refreshing token with read:packages scope…\n`);
      spawnSync("gh", ["auth", "switch", "--hostname", HOST, "--user", user], { cwd: ROOT, stdio: "inherit", shell: process.platform === "win32" });
      const result = spawnSync(
        "gh",
        ["auth", "refresh", "--hostname", HOST, "--scopes", "read:packages"],
        { cwd: ROOT, stdio: "inherit", shell: process.platform === "win32" },
      );
      if (result.error || result.status !== 0) {
        throw new Error(`Token refresh failed for ${user}. Run 'gh auth switch --user ${user} && gh auth refresh --scopes read:packages' manually.`);
      }
      return;
    }
    // Fall through to fresh login
  }

  process.stdout.write("[auth:packages] Opening browser for GitHub login…\n");
  const result = spawnSync(
    "gh",
    ["auth", "login", "--hostname", HOST, "--web", "--scopes", "read:packages"],
    { cwd: ROOT, stdio: "inherit", shell: process.platform === "win32" },
  );

  if (result.error || result.status !== 0) {
    throw new Error("GitHub CLI login failed. Complete 'gh auth login' manually and retry.");
  }
}

function checkPackageReachable(packageName, registry) {
  try {
    // npm ignores --registry for scoped packages when a scope-level registry
    // is set in .npmrc. Use a scope-level config flag to truly override it.
    const scope = packageName.startsWith("@") ? packageName.split("/")[0] : null;
    const args = ["view", `${packageName}@latest`, "version"];
    if (scope) {
      args.push(`--${scope}:registry=${registry}`);
    } else {
      args.push("--registry", registry);
    }
    const version = run("npm", args);
    return { reachable: true, version };
  } catch {
    return { reachable: false };
  }
}

function checkAllPackages() {
  const all = [...PRIVATE_PACKAGES, ...PUBLIC_PACKAGES];
  const results = [];
  for (const pkg of all) {
    const result = checkPackageReachable(pkg.name, pkg.registry);
    results.push({ ...pkg, ...result });
  }
  return results;
}

function printPackageStatus(results) {
  for (const r of results) {
    if (r.reachable) {
      process.stdout.write(`  ✔ ${r.name}@${r.version}\n`);
    } else {
      process.stderr.write(`  ✖ ${r.name} — not reachable\n`);
    }
  }
}

export async function ensureGithubPackagesAuth(options = {}) {
  const checkOnly = options.checkOnly || false;

  // ── Step 1: Check if everything is already reachable ──────────
  process.stdout.write("[auth:packages] Checking package access…\n");
  const currentResults = checkAllPackages();
  printPackageStatus(currentResults);

  const unreachable = currentResults.filter((r) => !r.reachable);
  if (unreachable.length === 0) {
    process.stdout.write("[auth:packages] All packages reachable — no auth changes needed.\n");
    return { ok: currentResults.length, warned: 0 };
  }

  // ── Step 2: Some packages failed — need GitHub auth ───────────
  const privateUnreachable = unreachable.filter((r) => PRIVATE_PACKAGES.some((p) => p.name === r.name));
  if (privateUnreachable.length === 0) {
    // Only public packages failed — not an auth issue
    process.stderr.write("\n[auth:packages] Unreachable packages are public — this is a network issue, not auth.\n");
    return { ok: currentResults.length - unreachable.length, warned: unreachable.length };
  }

  if (checkOnly) {
    process.stderr.write("\n[auth:packages] Private packages are not reachable. Run 'npm run auth:packages' to sign in.\n");
    return { ok: currentResults.length - unreachable.length, warned: unreachable.length };
  }

  if (!hasGhCli()) {
    await tryInstallGhCli();
    if (!hasGhCli()) {
      throw new Error("GitHub CLI (gh) is still not available. Open Copilot Chat (Cmd+Shift+I) and ask: 'Help me debug my MCP package auth setup'");
    }
  }

  // ── Step 3: Interactive sign-in ───────────────────────────────
  process.stdout.write("\n[auth:packages] Private packages need authentication. Signing in via GitHub CLI…\n");

  let accounts = [];
  try {
    accounts = getGhAccounts();
  } catch {
    // not signed in at all
  }

  await loginForPackages(accounts);
  accounts = getGhAccounts();

  let account = selectAccount(accounts);
  if (!account && accounts.filter(hasReadPackages).length > 1) {
    account = await promptAccountChoice(accounts);
  }
  if (!account) {
    throw new Error("No GitHub account with read:packages found after login. Open Copilot Chat and ask: 'Help me debug my MCP package auth setup'");
  }

  // ── Step 4: Write ~/.npmrc and re-verify ──────────────────────
  const token = run("gh", ["auth", "token", "--hostname", HOST, "--user", account.user]);
  const managedBlock = buildManagedBlock(token, account.user);
  upsertManagedBlock(NPMRC_PATH, managedBlock);
  process.stdout.write(`[auth:packages] Updated ${NPMRC_PATH} using GitHub account ${account.user}.\n`);

  process.stdout.write("\n[auth:packages] Re-checking package access…\n");
  const retryResults = checkAllPackages();
  printPackageStatus(retryResults);

  const stillFailing = retryResults.filter((r) => !r.reachable);
  if (stillFailing.length > 0) {
    const hasMicrosoftPkg = stillFailing.some((r) => r.name.startsWith("@microsoft/"));
    process.stderr.write(`\n[auth:packages] ${stillFailing.length} package(s) still unreachable after auth.\n`);
    for (const r of stillFailing) {
      if (PRIVATE_PACKAGES.some((p) => p.name === r.name)) {
        process.stderr.write(`  → ${r.name}: Your account may not have read access. Ask the package owner to grant it.\n`);
      } else {
        process.stderr.write(`  → ${r.name}: Check the package name/registry or network connectivity.\n`);
      }
    }
    if (hasMicrosoftPkg) {
      process.stderr.write("\n");
      process.stderr.write("  \x1b[1m\x1b[33m┌──────────────────────────────────────────────────────────┐\x1b[0m\n");
      process.stderr.write("  \x1b[1m\x1b[33m│  If the @microsoft org uses SAML SSO, your token needs   │\x1b[0m\n");
      process.stderr.write("  \x1b[1m\x1b[33m│  SSO authorization. Try:                                 │\x1b[0m\n");
      process.stderr.write("  \x1b[1m\x1b[33m│                                                          │\x1b[0m\n");
      process.stderr.write("  \x1b[1m\x1b[33m│  1. Open https://github.com/settings/tokens              │\x1b[0m\n");
      process.stderr.write("  \x1b[1m\x1b[33m│  2. Click \"Configure SSO\" next to your active token       │\x1b[0m\n");
      process.stderr.write("  \x1b[1m\x1b[33m│  3. Authorize for the \"microsoft\" organization            │\x1b[0m\n");
      process.stderr.write("  \x1b[1m\x1b[33m│                                                          │\x1b[0m\n");
      process.stderr.write("  \x1b[1m\x1b[33m│  Or create a classic PAT with read:packages + SSO:        │\x1b[0m\n");
      process.stderr.write("  \x1b[1m\x1b[33m│    https://github.com/settings/tokens/new                │\x1b[0m\n");
      process.stderr.write("  \x1b[1m\x1b[33m└──────────────────────────────────────────────────────────┘\x1b[0m\n");
    }
    process.stderr.write("\n");
    process.stderr.write("  \x1b[1m\x1b[36m┌──────────────────────────────────────────────────────────┐\x1b[0m\n");
    process.stderr.write("  \x1b[1m\x1b[36m│  Still stuck? Open Copilot Chat (Ctrl+Shift+I) and ask: │\x1b[0m\n");
    process.stderr.write("  \x1b[1m\x1b[36m│                                                          │\x1b[0m\n");
    process.stderr.write("  \x1b[1m\x1b[36m│    \"Help me debug my MCP package auth setup\"             │\x1b[0m\n");
    process.stderr.write("  \x1b[1m\x1b[36m│                                                          │\x1b[0m\n");
    process.stderr.write("  \x1b[1m\x1b[36m│  Copilot can read your logs and walk you through it.     │\x1b[0m\n");
    process.stderr.write("  \x1b[1m\x1b[36m└──────────────────────────────────────────────────────────┘\x1b[0m\n");
    process.stderr.write("\n");
  }

  return {
    ok: retryResults.filter((r) => r.reachable).length,
    warned: stillFailing.length,
  };
}

function isDirectRun() {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isDirectRun()) {
  (async () => {
    try {
      await ensureGithubPackagesAuth({
        checkOnly: process.argv.includes("--check"),
      });
    } catch (error) {
      process.stderr.write(`[auth:packages] ${error.message}\n`);
      process.exit(1);
    }
  })();
}