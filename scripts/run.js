#!/usr/bin/env node

/**
 * L.C.G Task Runner CLI
 *
 * Unified entry point for all L.C.G automations.
 *
 * Usage:
 *   node scripts/run.js <task>       [options]
 *   node scripts/run.js list
 *
 * Examples:
 *   node scripts/run.js morning-triage
 *   node scripts/run.js morning-triage --date 2026-03-24
 *   node scripts/run.js meeting-brief --meeting-name "Contoso QBR" --customer Contoso
 *   node scripts/run.js milestone-review --force-weekend
 *   node scripts/run.js list
 *
 * Options:
 *   --date YYYY-MM-DD        Override target date
 *   --force-weekend          Run even on weekends
 *   --dry-run                Print what would happen without executing
 *   --meeting-name <name>    Meeting name (meeting-brief, meeting-followup)
 *   --customer <name>        Customer name (update-request, meeting-brief)
 *   --max-repair <n>         Override max repair attempts
 */

import { resolve, join } from "node:path";
import { existsSync, readdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { runTask, runPromptPassthrough } from "./lib/runner.js";
import { loadSchedule, cronToHuman } from "./lib/parse-schedule.js";

const TASKS_DIR = resolve(import.meta.dirname, "tasks");
const REPO_DIR = resolve(import.meta.dirname, "..");

// ── Parse CLI args ──────────────────────────────────────────────────
const args = process.argv.slice(2);
const taskName = args[0];

function flag(name) {
  return args.includes(`--${name}`);
}

function param(name) {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

// ── List mode ───────────────────────────────────────────────────────
if (taskName === "list" || !taskName) {
  // Try vault-backed schedule first, fall back to task JS files
  const vaultDir = process.env.VAULT_DIR || process.env.LCG_VAULT_DIR || null;
  const { tasks: vaultTasks, source, path: schedPath } = loadSchedule(vaultDir, REPO_DIR);

  const rows = [];

  if (vaultTasks.length > 0) {
    // Vault schedule is source of truth
    for (const t of vaultTasks) {
      rows.push({
        name: t.name,
        schedule: t.schedule,
        enabled: t.enabled,
        description: t.description,
      });
    }

    // Also include task JS files not in the vault registry (on-demand tasks)
    const files = readdirSync(TASKS_DIR).filter((f) => f.endsWith(".js"));
    const vaultNames = new Set(vaultTasks.map((t) => t.name));
    for (const file of files) {
      const mod = await import(pathToFileURL(join(TASKS_DIR, file)).href);
      const t = mod.default;
      if (!vaultNames.has(t.name)) {
        rows.push({
          name: t.name,
          schedule: t.schedule
            ? `${t.schedule.days.join(",")} @ ${t.schedule.time}`
            : "on-demand",
          enabled: true,
          description: "",
        });
      }
    }
  } else {
    // Fallback: read from task JS files
    const files = readdirSync(TASKS_DIR).filter((f) => f.endsWith(".js"));
    for (const file of files) {
      const mod = await import(pathToFileURL(join(TASKS_DIR, file)).href);
      const t = mod.default;
      const sched = t.schedule
        ? `${t.schedule.days.join(",")} @ ${t.schedule.time}`
        : "on-demand";
      rows.push({ name: t.name, schedule: sched, enabled: true, description: "" });
    }
  }

  // Display
  console.log("\nL.C.G Scheduled Automations\n");
  if (source !== "none") {
    console.log(`  📋 Source: ${source === "vault" ? "Obsidian vault" : "repo starter"} (${schedPath})\n`);
  }

  const maxName = Math.max(...rows.map((r) => r.name.length));
  const maxSched = Math.max(...rows.map((r) => r.schedule.length));

  // Scheduled tasks first, then on-demand
  const scheduled = rows.filter((r) => r.schedule !== "on-demand");
  const onDemand = rows.filter((r) => r.schedule === "on-demand");

  if (scheduled.length) {
    console.log("  Recurring:");
    for (const r of scheduled) {
      const status = r.enabled ? "✅" : "⏸️ ";
      console.log(`    ${status} ${r.name.padEnd(maxName + 2)} ${r.schedule.padEnd(maxSched + 2)} ${r.description ? "— " + r.description : ""}`);
    }
    console.log();
  }

  if (onDemand.length) {
    console.log("  On-demand:");
    for (const r of onDemand) {
      console.log(`    🔧 ${r.name.padEnd(maxName + 2)} ${r.schedule}`);
    }
    console.log();
  }

  console.log(`Usage: node scripts/run.js <task> [--date YYYY-MM-DD] [--force-weekend]`);
  console.log(`Edit:  _lcg/scheduled-tasks.md in your Obsidian vault to manage schedules\n`);
  process.exit(0);
}

// ── Load task ───────────────────────────────────────────────────────
// All tasks route through the vault registry first (passthrough to Copilot).
// JS task files in scripts/tasks/ are a legacy fallback.
const vaultDir = process.env.VAULT_DIR || process.env.LCG_VAULT_DIR || null;
const { tasks: vaultTasks } = loadSchedule(vaultDir, REPO_DIR);

// Match by derived name: LCG-Morning-Triage → morning-triage
const vaultTask = vaultTasks.find((t) => t.name === taskName);

if (vaultTask && vaultTask.prompt) {
  console.log(`\n📋 Running: ${vaultTask.id}`);
  console.log(`   Prompt from: _lcg/scheduled-tasks.md\n`);

  if (flag("dry-run")) {
    process.env.DRY_RUN = "1";
    console.log(`[dry-run] Would run: ${vaultTask.name}`);
    console.log(`[dry-run] Date: ${param("date") || "(today)"}`);
    console.log(`[dry-run] Schedule: ${vaultTask.schedule}`);
    console.log(`[dry-run] Prompt:\n${vaultTask.prompt}`);
    process.exit(0);
  }

  const overrides = {};
  if (param("date")) overrides.date = param("date");
  const exitCode = await runPromptPassthrough(vaultTask, overrides);
  process.exit(exitCode);
}

// Fallback: check for legacy JS task file
const taskFile = join(TASKS_DIR, `${taskName}.js`);
if (!existsSync(taskFile)) {
  console.error(`Unknown task: ${taskName}`);
  console.error(`No matching entry in scheduled-tasks.md and no legacy JS file.`);
  console.error(`\nTo create a task, add a section to _lcg/scheduled-tasks.md:`);
  console.error(`\n  ## LCG-${taskName.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join("-")}`);
  console.error(`  - **Schedule:** Every weekday at 9:00 AM`);
  console.error(`  - **Enabled:** true`);
  console.error(`  - **Description:** What this task does.`);
  console.error(`  - **Prompt:**`);
  console.error(`    > Your prompt text here.\n`);
  process.exit(1);
}

const { default: task } = await import(pathToFileURL(taskFile).href);

// ── Build overrides from CLI args ───────────────────────────────────
const overrides = {};
if (param("date")) overrides.date = param("date");
if (flag("force-weekend")) overrides.forceWeekend = true;
if (param("max-repair")) overrides.maxRepair = parseInt(param("max-repair"), 10);
if (param("meeting-name")) overrides.meeting_name = param("meeting-name");
if (param("customer")) overrides.customer = param("customer");
if (param("meeting-file-slug")) overrides.meeting_file_slug = param("meeting-file-slug");

// ── Dry run ─────────────────────────────────────────────────────────
if (flag("dry-run")) {
  process.env.DRY_RUN = "1";
  console.log(`[dry-run] Would run: ${task.name}`);
  console.log(`[dry-run] Date: ${overrides.date || "(today)"}`);
  console.log(`[dry-run] Prompt: ${task.prompt}`);
  if (task.schedule) {
    console.log(`[dry-run] Schedule: ${task.schedule.days.join(",")} @ ${task.schedule.time}`);
  }
  process.exit(0);
}

// ── Validate required inputs for on-demand tasks ────────────────────
if (task.name === "meeting-brief" || task.name === "meeting-followup") {
  if (!overrides.meeting_name && !process.env.MEETING_NAME) {
    console.error(`ERROR: --meeting-name is required for ${task.name}`);
    console.error(`Example: node scripts/run.js ${task.name} --meeting-name "Contoso QBR"`);
    process.exit(2);
  }
}

if (task.name === "update-request") {
  if (!overrides.customer && !process.env.CUSTOMER) {
    console.error(`ERROR: --customer is required for update-request`);
    console.error(`Example: node scripts/run.js update-request --customer Contoso`);
    process.exit(2);
  }
}

// ── Execute ─────────────────────────────────────────────────────────
// Tasks with customRun get routed differently
if (task.customRun) {
  const { createLogger } = await import("./lib/logger.js");
  const { resolveVaultPath, resolveDate } = await import("./lib/config.js");
  const date = overrides.date || resolveDate();
  const vaultDir = resolveVaultPath();
  const { log } = createLogger(task.name, vaultDir, date);
  const exitCode = await task.customRun({ date, vaultDir, log, overrides });
  process.exit(exitCode);
}

const exitCode = await runTask(task, overrides);
process.exit(exitCode);
