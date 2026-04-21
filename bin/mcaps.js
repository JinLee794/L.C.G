#!/usr/bin/env node

import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveCopilotBin } from "../scripts/lib/copilot.js";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const args = process.argv.slice(2);

function run(cmd, cmdArgs, opts = {}) {
  return new Promise((resolveRun) => {
    const child = spawn(cmd, cmdArgs, {
      cwd: ROOT,
      env: process.env,
      stdio: "inherit",
      shell: false,
      ...opts,
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
  const bin = resolveCopilotBin();

  if (bin) {
    const code = await run(bin, args);
    process.exit(code);
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
