#!/usr/bin/env node

/**
 * sync-schedule.js — Sync OS schedulers from _lcg/scheduled-tasks.md.
 *
 * Reads the vault registry (source of truth) and reconciles OS-level
 * scheduling (launchd on macOS, cron on Linux) to match.
 *
 * Usage:
 *   node scripts/sync-schedule.js              # Sync all enabled tasks
 *   node scripts/sync-schedule.js --dry-run    # Show what would change
 *   node scripts/sync-schedule.js --status     # Show current sync state
 *   node scripts/sync-schedule.js --uninstall  # Remove all LCG schedules
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync, readFileSync, unlinkSync, readdirSync } from "node:fs";
import { homedir, platform } from "node:os";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSchedule } from "./lib/parse-schedule.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OS = platform();
const PLIST_DIR = join(homedir(), "Library", "LaunchAgents");
const PLIST_PREFIX = "project.lcg.";

// ── CLI args ────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const STATUS_ONLY = args.includes("--status");
const UNINSTALL = args.includes("--uninstall");

// ── Load registry ───────────────────────────────────────────────────
const vaultDir = process.env.VAULT_DIR || process.env.LCG_VAULT_DIR || null;
const { tasks, source, path: schedPath } = loadSchedule(vaultDir, ROOT);

if (!tasks.length) {
  console.error("No scheduled-tasks.md found. Set VAULT_DIR or ensure vault-starter/_lcg/scheduled-tasks.md exists.");
  process.exit(1);
}

console.log(`\n📋 Registry: ${source} (${schedPath})`);
console.log(`   ${tasks.length} task(s) defined, ${tasks.filter((t) => t.enabled).length} enabled\n`);

if (UNINSTALL) {
  uninstallAll();
  process.exit(0);
}

if (STATUS_ONLY) {
  showStatus();
  process.exit(0);
}

// ── Sync ────────────────────────────────────────────────────────────
syncAll();

function syncAll() {
  const enabled = tasks.filter((t) => t.enabled && t.cron);
  const disabled = tasks.filter((t) => !t.enabled || !t.cron);

  for (const task of enabled) {
    console.log(`  ✅ ${task.id} — ${task.schedule}`);
    if (!DRY_RUN) installTask(task);
  }

  for (const task of disabled) {
    const installed = isInstalled(task);
    if (installed) {
      console.log(`  ⏸️  ${task.id} — removing (disabled)`);
      if (!DRY_RUN) removeTask(task);
    } else {
      console.log(`  ⏸️  ${task.id} — skipped (disabled)`);
    }
  }

  if (DRY_RUN) {
    console.log("\n  (dry-run — no changes made)\n");
  } else {
    console.log("\n  ✅ OS scheduler synced to vault registry.\n");
  }
}

function showStatus() {
  for (const task of tasks) {
    const installed = isInstalled(task);
    const icon = task.enabled ? (installed ? "✅" : "⚠️ ") : (installed ? "🔴" : "⏸️ ");
    const state = task.enabled
      ? (installed ? "active" : "NOT INSTALLED")
      : (installed ? "SHOULD BE REMOVED" : "disabled");
    console.log(`  ${icon} ${task.id.padEnd(30)} ${task.schedule.padEnd(22)} ${state}`);
  }
  console.log();
}

function uninstallAll() {
  if (OS === "darwin") {
    if (!existsSync(PLIST_DIR)) return;
    const plists = readdirSync(PLIST_DIR).filter((f) => f.startsWith(PLIST_PREFIX));
    for (const f of plists) {
      const p = join(PLIST_DIR, f);
      const label = f.replace(".plist", "");
      console.log(`  🗑️  Removing ${label}`);
      if (!DRY_RUN) {
        spawnSync("launchctl", ["bootout", `gui/${process.getuid()}`, p], { stdio: "ignore" });
        unlinkSync(p);
      }
    }
  } else {
    // Linux: remove tagged crontab lines
    if (!DRY_RUN) {
      const result = spawnSync("crontab", ["-l"], { encoding: "utf-8" });
      if (result.status === 0) {
        const lines = result.stdout.split("\n").filter((l) => !l.includes("# LCG-"));
        spawnSync("crontab", ["-"], { input: lines.join("\n"), encoding: "utf-8" });
      }
    }
  }
  console.log(DRY_RUN ? "\n  (dry-run)\n" : "\n  Done.\n");
}

// ── OS-specific install/remove ──────────────────────────────────────

function plistLabel(task) {
  return `${PLIST_PREFIX}${task.name}`;
}

function plistPath(task) {
  return join(PLIST_DIR, `${plistLabel(task)}.plist`);
}

function isInstalled(task) {
  if (OS === "darwin") {
    return existsSync(plistPath(task));
  }
  // Linux: check crontab for tag
  const result = spawnSync("crontab", ["-l"], { encoding: "utf-8" });
  return result.status === 0 && result.stdout.includes(`# ${task.id}`);
}

function installTask(task) {
  if (OS === "darwin") installLaunchd(task);
  else installCron(task);
}

function removeTask(task) {
  if (OS === "darwin") removeLaunchd(task);
  else removeCron(task);
}

function installLaunchd(task) {
  const label = plistLabel(task);
  const path = plistPath(task);
  const logDir = join(homedir(), "Library", "Logs");
  mkdirSync(PLIST_DIR, { recursive: true });
  mkdirSync(logDir, { recursive: true });

  // Parse cron to get weekdays, hour, minute
  const [min, hour, , , dow] = task.cron.split(/\s+/);

  const DOW_MAP = { "0": 0, "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6 };
  const expandDow = (d) => {
    const result = [];
    for (const seg of d.split(",")) {
      if (seg.includes("-")) {
        const [a, b] = seg.split("-").map(Number);
        for (let i = a; i <= b; i++) result.push(i);
      } else if (seg === "*") {
        for (let i = 0; i <= 6; i++) result.push(i);
      } else {
        result.push(Number(seg));
      }
    }
    return result;
  };

  const days = expandDow(dow);
  const calDicts = days
    .map(
      (d) =>
        `      <dict><key>Weekday</key><integer>${d}</integer><key>Hour</key><integer>${Number(hour)}</integer><key>Minute</key><integer>${Number(min)}</integer></dict>`
    )
    .join("\n");

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${process.execPath}</string>
    <string>${resolve(ROOT, "bin", "lcg.js")}</string>
    <string>run</string>
    <string>${task.name}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${ROOT}</string>
  <key>StartCalendarInterval</key>
  <array>
${calDicts}
  </array>
  <key>StandardOutPath</key>
  <string>${join(logDir, `${label}.out.log`)}</string>
  <key>StandardErrorPath</key>
  <string>${join(logDir, `${label}.err.log`)}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
${vaultDir ? `    <key>VAULT_DIR</key>\n    <string>${vaultDir}</string>` : ""}
  </dict>
</dict>
</plist>`;

  // Bootout old version if loaded
  spawnSync("launchctl", ["bootout", `gui/${process.getuid()}`, path], { stdio: "ignore" });
  writeFileSync(path, plist);
  spawnSync("launchctl", ["bootstrap", `gui/${process.getuid()}`, path], { stdio: "ignore" });
}

function removeLaunchd(task) {
  const path = plistPath(task);
  if (existsSync(path)) {
    spawnSync("launchctl", ["bootout", `gui/${process.getuid()}`, path], { stdio: "ignore" });
    unlinkSync(path);
  }
}

function installCron(task) {
  const result = spawnSync("crontab", ["-l"], { encoding: "utf-8" });
  let lines = result.status === 0 ? result.stdout.split("\n") : [];
  // Remove old entry
  lines = lines.filter((l) => !l.includes(`# ${task.id}`));
  // Add new
  const runner = `${process.execPath} ${resolve(ROOT, "bin", "lcg.js")} run ${task.name}`;
  lines.push(`${task.cron} cd ${ROOT} && ${runner} # ${task.id}`);
  spawnSync("crontab", ["-"], { input: lines.join("\n") + "\n", encoding: "utf-8" });
}

function removeCron(task) {
  const result = spawnSync("crontab", ["-l"], { encoding: "utf-8" });
  if (result.status === 0) {
    const lines = result.stdout.split("\n").filter((l) => !l.includes(`# ${task.id}`));
    spawnSync("crontab", ["-"], { input: lines.join("\n") + "\n", encoding: "utf-8" });
  }
}
