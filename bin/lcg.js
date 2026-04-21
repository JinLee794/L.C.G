#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveCopilotBin } from "../scripts/lib/copilot.js";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const args = process.argv.slice(2);

function needsShell(cmd) {
  if (process.platform !== "win32") return false;
  // On Node 20+ Windows, spawning .cmd/.bat with shell:false throws EINVAL.
  // Also use the shell for bare command names (e.g. "gh", "copilot") because
  // PATHEXT resolution requires it.
  if (/\.(cmd|bat)$/i.test(cmd)) return true;
  if (!/[\\/]/.test(cmd) && !/\.exe$/i.test(cmd)) return true;
  return false;
}

function quoteWinArg(arg) {
  if (arg === "") return '""';
  if (!/[\s"&|<>^%]/.test(arg)) return arg;
  return `"${String(arg).replace(/"/g, '\\"')}"`;
}

function run(cmd, cmdArgs, opts = {}) {
  return new Promise((resolveRun) => {
    const useShell = opts.shell ?? needsShell(cmd);

    // When running through a Windows shell, spawn() doesn't escape arguments
    // for us. Do it explicitly so spaces / special chars survive.
    let spawnCmd = cmd;
    let spawnArgs = cmdArgs;
    if (useShell && process.platform === "win32") {
      const quoted = [cmd, ...cmdArgs].map(quoteWinArg).join(" ");
      spawnCmd = quoted;
      spawnArgs = [];
    }

    const child = spawn(spawnCmd, spawnArgs, {
      cwd: ROOT,
      env: process.env,
      stdio: "inherit",
      windowsHide: true,
      ...opts,
      shell: useShell,
    });
    child.on("exit", (code) => resolveRun(code ?? 0));
    child.on("error", () => resolveRun(1));
  });
}

async function hasGhCopilot() {
  const code = await run("gh", ["copilot", "--help"], { stdio: "ignore" });
  return code === 0;
}

async function main() {
  let bin = resolveCopilotBin();

  if (process.platform === "win32" && bin === "copilot") {
    const where = spawnSync("where", ["copilot"], { encoding: "utf-8" });
    if (where.status === 0) {
      const candidates = (where.stdout || "")
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      const preferred = candidates.find((p) => /\.(cmd|exe)$/i.test(p));
      if (preferred) {
        bin = preferred;
      } else {
        // Only PowerShell shims are present and may be blocked by policy.
        bin = null;
      }
    }
  }

  if (bin) {
    const code = await run(bin, args);
    if (code === 0) {
      process.exit(0);
    }
    // If the detected binary is not runnable in this shell (e.g. blocked
    // PowerShell shim), continue to gh copilot fallback.
    console.log("Detected Copilot binary did not run successfully. Trying gh copilot fallback...");
  }

  // Fallback for environments where standalone `copilot` is absent:
  // use GitHub CLI extension and install it automatically if needed.
  let ghCopilotReady = await hasGhCopilot();
  if (!ghCopilotReady) {
    console.log("GitHub Copilot CLI not found. Attempting to enable gh copilot...");
    await run("gh", ["extension", "install", "github/gh-copilot"]);
    ghCopilotReady = await hasGhCopilot();
  }

  if (!ghCopilotReady) {
    console.error("Copilot CLI is unavailable. Install GitHub Copilot Chat in VS Code or run: gh extension install github/gh-copilot");
    process.exit(1);
  }

  const code = await run("gh", ["copilot", ...args]);
  process.exit(code);
}

await main();
