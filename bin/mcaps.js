#!/usr/bin/env node

import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveCopilotBin } from "../scripts/lib/copilot.js";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const args = process.argv.slice(2);
const bin = resolveCopilotBin();

if (!bin) {
  console.error("GitHub Copilot CLI not found. Install Copilot Chat in VS Code or set COPILOT_CLI_PATH.");
  process.exit(1);
}

const child = spawn(bin, args, {
  cwd: ROOT,
  env: process.env,
  stdio: "inherit",
  shell: false,
});

child.on("exit", (code) => process.exit(code ?? 0));
child.on("error", (err) => {
  console.error(`Failed to start mcaps: ${err.message}`);
  process.exit(1);
});
