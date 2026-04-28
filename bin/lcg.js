#!/usr/bin/env node

/**
 * lcg — Global CLI entry point for L.C.G.
 *
 * A single binary that resolves Copilot CLI (via Agency or direct),
 * sets the working directory to the repo root so MCP servers, agents,
 * and skills are auto-detected, and supports multiple invocation modes.
 *
 * Modes:
 *   lcg                           # interactive Copilot CLI session
 *   lcg -p "morning triage"       # run a prompt non-interactively
 *   lcg run <task>                # run a scheduled task by name
 *   lcg run <task> --dry-run      # preview what a task would do
 *   lcg schedule sync             # sync OS scheduler from vault registry
 *   lcg schedule status           # show scheduler sync state
 *   lcg schedule uninstall        # remove all LCG OS schedules
 *   lcg list                      # list all registered tasks
 *   lcg <any copilot args>        # pass-through to copilot CLI
 *
 * Environment:
 *   OBSIDIAN_VAULT / OBSIDIAN_VAULT_PATH — vault dir (auto-attached)
 *   COPILOT_CLI_PATH — override copilot binary location
 */

import { spawnSync, execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const isWindows = process.platform === "win32";

// ── Parse sub-commands ──────────────────────────────────────────────
const argv = process.argv.slice(2);
const subcommand = argv[0]?.toLowerCase();

// Route to internal sub-commands before falling through to copilot
if (subcommand === "run" || subcommand === "list" || subcommand === "schedule") {
  handleSubcommand(subcommand, argv.slice(1));
} else {
  // Default: launch copilot CLI session with all args forwarded
  launchCopilot(argv);
}

// ── Sub-command handlers ────────────────────────────────────────────

function handleSubcommand(cmd, args) {
  switch (cmd) {
    case "run": {
      // lcg run <task> [--date YYYY-MM-DD] [--dry-run]
      const script = resolve(REPO_ROOT, "scripts", "run.js");
      runNode([script, ...args]);
      break;
    }
    case "list": {
      // lcg list → node scripts/run.js list
      const script = resolve(REPO_ROOT, "scripts", "run.js");
      runNode([script, "list"]);
      break;
    }
    case "schedule": {
      // lcg schedule sync|status|uninstall|dry
      const schedScript = resolve(REPO_ROOT, "scripts", "sync-schedule.js");
      const action = args[0]?.toLowerCase();
      const schedArgs = [schedScript];
      if (action === "status") schedArgs.push("--status");
      else if (action === "uninstall") schedArgs.push("--uninstall");
      else if (action === "dry" || action === "dry-run") schedArgs.push("--dry-run");
      // "sync" or no arg = default (just run it)
      runNode(schedArgs);
      break;
    }
  }
}

/**
 * Run a Node.js script using the same node binary that's running this CLI.
 * Uses process.execPath so nvm/homebrew/system node all work consistently.
 */
function runNode(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: REPO_ROOT,
    stdio: "inherit",
    env: {
      ...process.env,
      OBSIDIAN_VAULT_PATH: process.env.OBSIDIAN_VAULT || process.env.OBSIDIAN_VAULT_PATH || "",
    },
  });
  if (result.error) {
    console.error(`Failed to run: ${result.error.message}`);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}

// ── Copilot CLI launcher ────────────────────────────────────────────

function launchCopilot(userArgs) {
  const copilotArgs = ["--allow-all-tools", "--add-dir", REPO_ROOT];

  // Attach vault if set
  const vaultDir = process.env.OBSIDIAN_VAULT || process.env.OBSIDIAN_VAULT_PATH;
  if (vaultDir) {
    copilotArgs.push("--add-dir", vaultDir);
  }

  copilotArgs.push(...userArgs);

  let result;

  if (hasAgency()) {
    result = spawnSync("agency", ["copilot", ...copilotArgs], {
      cwd: REPO_ROOT,
      stdio: "inherit",
      shell: isWindows,
    });
  } else {
    const copilot = findCopilotCli();
    if (copilot) {
      result = spawnSync(copilot, copilotArgs, {
        cwd: REPO_ROOT,
        stdio: "inherit",
        shell: isWindows,
      });
    } else {
      printInstallHelp();
      console.log("Falling back to VS Code...\n");
      result = spawnSync("code", [REPO_ROOT], {
        stdio: "inherit",
        shell: isWindows,
      });
      if (result.error) {
        console.error("VS Code ('code') also not found in PATH.");
        console.error("Open this repo manually: " + REPO_ROOT);
        process.exit(1);
      }
      process.exit(result.status ?? 0);
    }
  }

  if (result.error && result.error.code === "ENOENT") {
    printInstallHelp();
    process.exit(1);
  }

  process.exit(result.status ?? 1);
}

// ── CLI detection helpers ───────────────────────────────────────────

function hasAgency() {
  try {
    execSync("agency --help", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function findCopilotCli() {
  if (process.env.COPILOT_CLI_PATH) {
    if (existsSync(process.env.COPILOT_CLI_PATH)) return process.env.COPILOT_CLI_PATH;
  }

  try {
    const which = isWindows ? "where copilot" : "which copilot";
    const result = execSync(which, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
    if (result) return result.split("\n")[0];
  } catch { /* not on PATH */ }

  const home = process.env.HOME || process.env.USERPROFILE || "";
  const candidates = [
    resolve(home, "Library/Application Support/Code - Insiders/User/globalStorage/github.copilot-chat/copilotCli/copilot"),
    resolve(home, "Library/Application Support/Code/User/globalStorage/github.copilot-chat/copilotCli/copilot"),
    resolve(home, "AppData/Roaming/Code - Insiders/User/globalStorage/github.copilot-chat/copilotCli/copilot.exe"),
    resolve(home, "AppData/Roaming/Code/User/globalStorage/github.copilot-chat/copilotCli/copilot.exe"),
    resolve(home, ".config/Code - Insiders/User/globalStorage/github.copilot-chat/copilotCli/copilot"),
    resolve(home, ".config/Code/User/globalStorage/github.copilot-chat/copilotCli/copilot"),
  ];

  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

function printInstallHelp() {
  console.log("GitHub Copilot CLI ('copilot') is required.\n");
  console.log("Install options:");
  console.log("  macOS:  brew install copilot-cli");
  console.log("  npm:    npm install -g @github/copilot");
  if (isWindows) {
    console.log("\nAgency CLI (optional):");
    console.log('  iex "& { $(irm aka.ms/InstallTool.ps1)} agency"');
  } else {
    console.log("\nAgency CLI (optional):");
    console.log("  curl -sSfL https://aka.ms/InstallTool.sh | sh -s agency");
  }
  console.log("\nMore info: https://aka.ms/agency\n");
}
