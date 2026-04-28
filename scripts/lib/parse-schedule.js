/**
 * parse-schedule.js — Parse scheduled-tasks.md into structured task objects.
 *
 * The vault file `_lcg/scheduled-tasks.md` is the source of truth for all
 * L.C.G automations. This module reads it and returns a clean array of task
 * definitions that the runner, installer, and dashboard can all consume.
 *
 * Schedule field supports two formats:
 *   Human:  "Every weekday at 7:00 AM"
 *   Cron:   "0 7 * * 1-5"            (legacy, still accepted)
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// ── Constants ───────────────────────────────────────────────────────

const DOW_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const DAY_LOOKUP = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

// ── Human ↔ Cron conversion ────────────────────────────────────────

/**
 * Detect whether a schedule string is a cron expression.
 */
function isCron(s) {
  return /^[0-9*,/-]+\s+[0-9*,/-]+\s+[0-9*,/-]+\s+[0-9*,/-]+\s+[0-9*,/-]+$/.test(s.trim());
}

/**
 * Parse a human-readable schedule into a cron expression.
 *
 * Supported patterns:
 *   "Every weekday at 7:00 AM"
 *   "Every day at 6:00 AM"
 *   "Every Monday at 8:00 AM"
 *   "Every Mon, Wed, Fri at 9:00 AM"
 *   "Every Monday and Friday at 9:00 AM"
 *
 * @param {string} human
 * @returns {string|null} cron expression or null if unparseable
 */
export function humanToCron(human) {
  const s = human.trim();

  // Already a cron expression? Return as-is.
  if (isCron(s)) return s;

  // Pattern: Every <days> at <time>
  const m = s.match(/^every\s+(.+?)\s+at\s+(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;

  const [, daysPart, hourStr, minStr, ampm] = m;
  let hour = parseInt(hourStr, 10);
  const min = parseInt(minStr, 10);

  if (ampm.toUpperCase() === "PM" && hour < 12) hour += 12;
  if (ampm.toUpperCase() === "AM" && hour === 12) hour = 0;

  // Parse days
  const daysLower = daysPart.toLowerCase().trim();

  if (daysLower === "day") {
    return `${min} ${hour} * * *`;
  }
  if (daysLower === "weekday" || daysLower === "weekdays") {
    return `${min} ${hour} * * 1-5`;
  }
  if (daysLower === "weekend" || daysLower === "weekends") {
    return `${min} ${hour} * * 0,6`;
  }

  // Parse comma/and-separated day names
  const dayTokens = daysLower
    .replace(/\band\b/g, ",")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const dayNums = dayTokens
    .map((t) => DAY_LOOKUP[t])
    .filter((n) => n !== undefined);

  if (dayNums.length === 0) return null;

  return `${min} ${hour} * * ${dayNums.join(",")}`;
}

/**
 * Convert a cron expression to a human-readable string.
 */
export function cronToHuman(cron) {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return cron;

  const [min, hour, , , dow] = parts;
  const h = parseInt(hour, 10);
  const m = parseInt(min, 10);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const time = `${h12}:${String(m).padStart(2, "0")} ${ampm}`;

  if (dow === "*") return `Every day at ${time}`;

  const days = expandDow(dow);
  const dayNames = days.map((d) => DOW_NAMES[d]).filter(Boolean);

  if (dayNames.length === 5 && !days.includes(0) && !days.includes(6)) {
    return `Every weekday at ${time}`;
  }
  if (dayNames.length === 2 && days.includes(0) && days.includes(6)) {
    return `Every weekend at ${time}`;
  }
  if (dayNames.length === 1) {
    // Full day name for single days
    const fullNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    return `Every ${fullNames[days[0]]} at ${time}`;
  }
  return `Every ${dayNames.join(", ")} at ${time}`;
}

function expandDow(dow) {
  const result = new Set();
  for (const segment of dow.split(",")) {
    if (segment.includes("-")) {
      const [a, b] = segment.split("-").map(Number);
      for (let i = a; i <= b; i++) result.add(i);
    } else {
      result.add(Number(segment));
    }
  }
  return [...result].sort();
}

/**
 * Normalize any schedule string (human or cron) into both representations.
 *
 * @param {string} raw - The raw Schedule field value
 * @returns {{ cron: string, human: string } | null}
 */
export function normalizeSchedule(raw) {
  if (!raw) return null;
  const s = raw.trim();

  if (isCron(s)) {
    return { cron: s, human: cronToHuman(s) };
  }

  const cron = humanToCron(s);
  if (cron) {
    return { cron, human: s };
  }

  return null;
}

// ── Markdown parser ─────────────────────────────────────────────────

/**
 * Parse the Markdown registry into an array of task objects.
 *
 * Accepts both `**Schedule:**` (preferred) and `**Cron:**` (legacy) fields.
 */
export function parseScheduleMarkdown(content) {
  const tasks = [];
  const sections = content.split(/^## /m).slice(1);

  for (const section of sections) {
    const lines = section.split("\n");
    const id = lines[0].trim();

    // Skip non-task sections
    if (!id.startsWith("LCG-")) continue;

    const field = (label) => {
      const line = lines.find((l) =>
        l.match(new RegExp(`^-\\s+\\*\\*${label}:\\*\\*`, "i"))
      );
      if (!line) return "";
      const m = line.match(new RegExp(`\\*\\*${label}:\\*\\*\\s*\`?([^\`]+)\`?`, "i"));
      return m ? m[1].trim() : "";
    };

    // Accept Schedule (new) or Cron (legacy)
    const scheduleRaw = field("Schedule") || field("Cron");
    const enabled = field("Enabled").toLowerCase() === "true";
    const description = field("Description");

    // Extract prompt
    const promptIdx = lines.findIndex((l) => /\*\*Prompt:\*\*/.test(l));
    let prompt = "";
    if (promptIdx !== -1) {
      const promptLines = [];
      for (let i = promptIdx + 1; i < lines.length; i++) {
        if (lines[i].match(/^\s*>/)) {
          promptLines.push(lines[i].replace(/^\s*>\s?/, ""));
        } else if (lines[i].trim() === "") {
          continue;
        } else {
          break;
        }
      }
      prompt = promptLines.join("\n").trim();
    }

    // Derive task name from LCG-ID: LCG-Morning-Triage → morning-triage
    const name = id.replace(/^LCG-/, "").toLowerCase().replace(/\s+/g, "-");

    // Normalize schedule
    const normalized = normalizeSchedule(scheduleRaw);

    tasks.push({
      id,
      name,
      cron: normalized ? normalized.cron : "",
      enabled,
      description,
      prompt,
      schedule: normalized ? normalized.human : "on-demand",
    });
  }

  return tasks;
}

/**
 * Resolve the schedule file path. Tries vault first, falls back to repo.
 *
 * @param {string} [vaultDir] - Obsidian vault root
 * @param {string} [repoDir]  - Repository root
 * @returns {{ path: string, source: "vault" | "repo" } | null}
 */
export function resolveScheduleFile(vaultDir, repoDir) {
  if (vaultDir) {
    const vaultPath = join(vaultDir, "_lcg", "scheduled-tasks.md");
    if (existsSync(vaultPath)) return { path: vaultPath, source: "vault" };
  }
  if (repoDir) {
    const repoPath = join(repoDir, "vault-starter", "_lcg", "scheduled-tasks.md");
    if (existsSync(repoPath)) return { path: repoPath, source: "repo" };
  }
  return null;
}

/**
 * Load and parse the schedule from the resolved file.
 *
 * @param {string} [vaultDir]
 * @param {string} [repoDir]
 * @returns {{ tasks: Array, source: string, path: string }}
 */
export function loadSchedule(vaultDir, repoDir) {
  const resolved = resolveScheduleFile(vaultDir, repoDir);
  if (!resolved) {
    return { tasks: [], source: "none", path: null };
  }
  const content = readFileSync(resolved.path, "utf-8");
  return {
    tasks: parseScheduleMarkdown(content),
    source: resolved.source,
    path: resolved.path,
  };
}
