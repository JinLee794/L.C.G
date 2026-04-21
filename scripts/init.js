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
import { existsSync, readFileSync, writeFileSync } from "node:fs";
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

// ── prerequisite validation ─────────────────────────────────────────
function checkPrereqs({ autoInstallOptional = false } = {}) {
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
    const account = tryRun("az account show --query user.name -o tsv");
    if (account) {
      ok(`Signed in as ${account}`);
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
function checkOnly() {
  const prereqsOk = checkPrereqs();

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
  const binPath = join(ROOT, "bin", "mcaps.js");
  if (isWindows) {
    const escaped = binPath.replace(/\\/g, "\\\\");
    console.log();
    warn("  Alternatives for PowerShell:");
    warn("");
    warn("  Option 1 — Add a function to your PowerShell profile:");
    warn(`    Add-Content $PROFILE 'function mcaps { node "${escaped}" @args }'`);
    warn("    . $PROFILE   # reload your profile");
    warn("");
    warn("  Option 2 — Use from the repo directory:");
    warn("    node bin\\mcaps.js");
    warn("");
    warn("  Option 3 — Retry from an elevated terminal:");
    warn("    npm link --ignore-scripts");
  } else {
    warn("  Try: sudo npm link --ignore-scripts");
    warn("  Or with nvm/fnm (no sudo): npm link --ignore-scripts");
  }
}

function registerAlias() {
  console.log();
  console.log("  \x1b[1m\x1b[36m╔══════════════════════════════════════════════════════════╗\x1b[0m");
  console.log("  \x1b[1m\x1b[36m║                                                          ║\x1b[0m");
  console.log("  \x1b[1m\x1b[36m║   Installing the 'mcaps' CLI binary globally              ║\x1b[0m");
  console.log("  \x1b[1m\x1b[36m║                                                          ║\x1b[0m");
  console.log("  \x1b[1m\x1b[36m║   This registers bin/mcaps.js as a global command so      ║\x1b[0m");
  console.log("  \x1b[1m\x1b[36m║   you can run 'mcaps' from any terminal, anywhere.        ║\x1b[0m");
  console.log("  \x1b[1m\x1b[36m║                                                          ║\x1b[0m");
  console.log("  \x1b[1m\x1b[36m╚══════════════════════════════════════════════════════════╝\x1b[0m");
  console.log();

  // Ensure bin script is executable on Unix
  if (!isWindows) {
    const binScript = join(ROOT, "bin", "mcaps.js");
    try {
      execSync(`chmod +x "${binScript}"`, { stdio: "pipe" });
    } catch { /* best-effort */ }
  }

  // Check if 'mcaps' is already linked and working
  const whichCmd = isWindows ? "where mcaps" : "which mcaps";
  const existing = tryRun(whichCmd);

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
    // If link failed but 'mcaps' already exists and works, that's fine
    if (existing) {
      ok("'mcaps' is already registered globally — no changes needed.");
      return true;
    }
    warn("Could not register global alias automatically.");
    printAliasFallback();
    return false;
  }

  // Verify the command is actually reachable after linking
  const found = tryRun(whichCmd);

  if (found) {
    ok("'mcaps' is now available globally — try it from any directory!");
    return true;
  }

  // On Windows, npm link often succeeds but current PATH does not yet include
  // npm's global bin directory in this process/session.
  if (isWindows) {
    const npmPrefix = tryRun("npm config get prefix");
    if (npmPrefix) {
      const sep = process.env.PATH?.includes(";") ? ";" : ":";
      const currentPath = process.env.PATH || "";
      const hasPrefixInPath = currentPath
        .split(sep)
        .map((p) => p.trim().toLowerCase())
        .includes(npmPrefix.trim().toLowerCase());

      if (!hasPrefixInPath) {
        process.env.PATH = currentPath ? `${currentPath};${npmPrefix}` : npmPrefix;
      }

      const foundAfterPathRefresh = tryRun(whichCmd);
      if (foundAfterPathRefresh) {
        ok("'mcaps' is now available globally — PATH was refreshed for this session.");

        // Best effort: persist PATH update for future terminals.
        if (!hasPrefixInPath) {
          try {
            run(
              `powershell -NoProfile -Command "if (-not (($env:Path -split ';') -contains '${npmPrefix}')) { [Environment]::SetEnvironmentVariable('PATH', [Environment]::GetEnvironmentVariable('PATH','User') + ';${npmPrefix}', 'User') }"`,
              ROOT,
            );
            info("Persisted npm global bin path to User PATH.");
          } catch {
            // Non-fatal; session is already fixed.
          }
        }

        return true;
      }
    }
  }

  // npm link appeared to succeed but the command isn't callable
  warn("npm link succeeded, but 'mcaps' was not found in your PATH.");

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
  console.log("  The OIL MCP server needs the path to your Obsidian vault.");
  console.log("  This is stored in .env (gitignored) — not committed.");
  console.log("  Press Enter to use a local vault inside the repo (.vault/).\n");

  const vaultInput = await ask("  Obsidian vault path (Enter = local .vault/): ");
  const localVault = join(ROOT, ".vault");
  const vaultPath = vaultInput || localVault;

  if (!vaultInput) {
    // Scaffold local vault from vault-starter/ if it doesn't exist yet
    const starterDir = join(ROOT, "vault-starter");
    if (!existsSync(localVault) && existsSync(starterDir)) {
      info("Initializing local vault from vault-starter/...");
      cpSync(starterDir, localVault, { recursive: true });
      ok(`Local vault created at ${localVault}`);
    } else if (existsSync(localVault)) {
      ok(`Local vault already exists at ${localVault}`);
    }
    info("You can point this to an Obsidian vault later by editing .env");
  } else if (!existsSync(vaultPath)) {
    warn(`Path does not exist yet: ${vaultPath}`);
    warn("Saving anyway — make sure the vault is created before starting OIL.");
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
  const ok = checkOnly();
  process.exit(ok ? 0 : 1);
} else {
  const prereqsOk = checkPrereqs({ autoInstallOptional: true });
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
      console.log("  \x1b[1m\x1b[32m│   ★  'mcaps' CLI installed successfully!                    │\x1b[0m");
      console.log("  \x1b[1m\x1b[32m│                                                             │\x1b[0m");
      console.log("  \x1b[1m\x1b[32m│   Run from any terminal, any directory:                     │\x1b[0m");
      console.log("  \x1b[1m\x1b[32m│                                                             │\x1b[0m");
      console.log("  \x1b[1m\x1b[33m│       'mcaps'                                                 │\x1b[0m");
      console.log("  \x1b[1m\x1b[33m│       'mcaps' -p \"morning triage\"                             │\x1b[0m");
      console.log("  \x1b[1m\x1b[32m│                                                             │\x1b[0m");
      console.log("  \x1b[1m\x1b[32m│   Launches Copilot CLI with all L.C.G servers,          │\x1b[0m");
      console.log("  \x1b[1m\x1b[32m│   agents, and skills — no need to cd into the repo.        │\x1b[0m");
      console.log("  \x1b[1m\x1b[32m│                                                             │\x1b[0m");
      console.log("  \x1b[1m\x1b[32m└─────────────────────────────────────────────────────────────┘\x1b[0m");
      console.log();
    } else {
      console.log();
      console.log("  \x1b[1m\x1b[33m┌─────────────────────────────────────────────────────────────┐\x1b[0m");
      console.log("  \x1b[1m\x1b[33m│                                                             │\x1b[0m");
      console.log("  \x1b[1m\x1b[33m│   ⚠  'mcaps' CLI was NOT installed globally.                │\x1b[0m");
      console.log("  \x1b[1m\x1b[33m│   See the instructions above to register it manually.      │\x1b[0m");
      console.log("  \x1b[1m\x1b[33m│                                                             │\x1b[0m");
      console.log("  \x1b[1m\x1b[33m└─────────────────────────────────────────────────────────────┘\x1b[0m");
      console.log();
    }

    // Check if already signed in to provide the right next step
    const account = tryRun("az account show --query user.name -o tsv");
    if (account) {
      console.log(`
  You're signed in as ${account}. Everything is ready!

  Next steps:
    1. Open this repo in VS Code:  code .
    2. MCP servers auto-start via .vscode/mcp.json
    3. Open Copilot chat (Cmd+Shift+I) and try: "Who am I in MSX?"
    4. Or just run 'mcaps' from any terminal!
`);
    } else {
      console.log(`
  Next steps:
    1. Connect to Microsoft VPN
    2. Sign in to Azure:        az login
    3. Open this repo in VS Code:  code .
    4. MCP servers auto-start via .vscode/mcp.json
    5. Open Copilot chat (Cmd+Shift+I) and try: "Who am I in MSX?"
    6. Or just run 'mcaps' from any terminal!
`);
    }
  } else {
    heading("Some steps failed — see errors above");
    process.exit(1);
  }
}
