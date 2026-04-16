---
name: dev-task-scheduler
description: 'Create, list, update, and remove scheduled tasks using cron-based definitions stored in a vault registry file. Cross-platform (macOS/Linux cron, launchd). Always inventories the registry before mutations to prevent sprawl and duplicates. Triggers: schedule task, scheduled task, task scheduler, list scheduled tasks, create scheduled task, remove scheduled task, cron job, recurring task, daily task, crontab, launchd, schedule cron.'
argument-hint: 'Describe what you want to schedule, or ask to list/audit existing tasks'
---

# Scheduled Task Management

Create, list, audit, and remove scheduled tasks using a declarative Markdown registry with cron expressions — cross-platform, vault-backed.

## Purpose

Manages recurring L.C.G automations through a single registry file (`_lcg/scheduled-tasks.md`) that defines each task's cron schedule, prompt, and metadata. The registry is the source of truth; OS-level scheduling (cron/launchd) is installed from it.

## Architecture

```
┌─────────────────────────────────────────────────┐
│  _lcg/scheduled-tasks.md  (vault registry)      │
│  ─────────────────────────────────────────────── │
│  Declarative task definitions:                   │
│    • Name, cron expression, enabled flag         │
│    • Prompt text or prompt file reference         │
│    • Task runner command                          │
│  ─────────────────────────────────────────────── │
│  Persisted via OIL MCP → vault                   │
│  Fallback: .copilot/scheduled-tasks.md → repo    │
└──────────────────┬──────────────────────────────┘
                   │ install-scheduler.js reads
                   ▼
┌─────────────────────────────────────────────────┐
│  OS Scheduler                                    │
│  macOS: launchd plist                            │
│  Linux: user crontab                             │
│  Windows: schtasks (legacy)                      │
└─────────────────────────────────────────────────┘
```

## When to Use

- Creating a new recurring task with a cron schedule.
- Listing or auditing all registered tasks from the registry.
- Checking for duplicate or overlapping schedules before adding a new one.
- Updating an existing task's schedule, prompt, or enabled state.
- Removing a task from the registry.
- Installing registry entries into the OS scheduler.
- Troubleshooting why a task didn't fire.

## When NOT to Use

- Scheduling jobs that belong on a server (use Azure Logic Apps, Azure Functions, etc.).
- One-off ad-hoc runs — just use `node scripts/run.js <task>` directly.

## Safety Rules

1. **Read registry first** — always load the current registry before any create/update/remove.
2. **Prefix all tasks** with `LCG-` for identification and safe cleanup.
3. **Confirm before destructive actions** — present task details and ask for explicit approval before removing entries.
4. **Idempotent writes** — registry updates replace the full task block; no partial edits.
5. **Registry = source of truth** — OS scheduler entries are derived from the registry, never the reverse.

## Naming Convention

All tasks MUST follow:

```
LCG-<Purpose>[-<Qualifier>]
```

Examples: `LCG-Morning-Triage`, `LCG-Milestone-Review`, `LCG-Vault-Backup`

---

## Registry File Format

The registry is a Markdown file at `_lcg/scheduled-tasks.md` in the vault. Each task is an H2 section with structured metadata fields.

### Location Resolution

1. **Primary:** `_lcg/scheduled-tasks.md` in Obsidian vault via OIL MCP tools (`oil:read_note_section`, `oil:atomic_replace`, `oil:create_note`).
2. **Fallback:** `.copilot/scheduled-tasks.md` in this repo (when OIL/Obsidian is unavailable).

### File Structure

```markdown
---
description: L.C.G scheduled task registry
updated: 2026-04-16
---

# Scheduled Tasks

## LCG-Morning-Triage
- **Cron:** `0 7 * * 1-5`
- **Enabled:** true
- **Runner:** `node scripts/run.js morning-triage`
- **Description:** Daily weekday morning triage — pulls calendar, mail, CRM data and produces the daily note.
- **Prompt:**
  > Run morning triage for today. Load config gate, pull calendar and mail
  > for the target date's midnight-to-midnight range, query CRM for pipeline
  > alerts and overdue milestones, and produce the daily triage note at
  > Daily/{{TODAY}}.md.

## LCG-Milestone-Review
- **Cron:** `0 8 * * 1`
- **Enabled:** true
- **Runner:** `node scripts/run.js milestone-review`
- **Description:** Weekly Monday milestone health check across direct reports.
- **Prompt:**
  > Run milestone review. Resolve running user, discover direct reports, pull
  > active milestones per report, and produce a consolidated status brief with
  > flags for at-risk, overdue, uncommitted, and high-value clusters.

## LCG-Portfolio-Review
- **Cron:** `0 14 * * 3`
- **Enabled:** true
- **Runner:** `node scripts/run.js portfolio-review`
- **Description:** Wednesday pipeline review — opportunity hygiene, close-date deltas, risk flags.
- **Prompt:**
  > Run portfolio review. Pull active opportunities by owner, flag stage
  > staleness, close-date drift, and missing fields. Produce consolidated
  > status brief grouped by account or stage.

## LCG-Vault-Hygiene
- **Cron:** `0 16 * * 5`
- **Enabled:** false
- **Runner:** `node scripts/run.js vault-hygiene`
- **Description:** Friday afternoon vault cleanup — stale notes, orphaned links, missing frontmatter.
- **Prompt:**
  > Run vault hygiene check. Scan for stale customer notes (no updates >30d),
  > orphaned wikilinks, missing required frontmatter fields, and produce a
  > cleanup report with suggested actions.
```

### Field Reference

| Field | Required | Format | Notes |
|---|---|---|---|
| **Section heading** | Yes | `## LCG-<Name>` | H2, must start with `LCG-` |
| **Cron** | Yes | Standard 5-field cron | `min hour dom month dow` — use [crontab.guru](https://crontab.guru) for validation |
| **Enabled** | Yes | `true` / `false` | Disabled tasks are preserved but skipped by the installer |
| **Runner** | Yes | Shell command | The command `install-scheduler.js` wires into the OS scheduler |
| **Description** | Yes | One-line summary | What the task does, for inventory display |
| **Prompt** | Yes | Blockquote (`>`) | The full agent prompt executed when the task fires. Multi-line blockquotes supported |

### Cron Expression Quick Reference

```
┌───────────── minute (0–59)
│ ┌───────────── hour (0–23)
│ │ ┌───────────── day of month (1–31)
│ │ │ ┌───────────── month (1–12)
│ │ │ │ ┌───────────── day of week (0–6, Sun=0)
│ │ │ │ │
* * * * *
```

| Expression | Meaning |
|---|---|
| `0 7 * * 1-5` | Mon–Fri at 7:00 AM |
| `0 8 * * 1` | Every Monday at 8:00 AM |
| `0 14 * * 3` | Every Wednesday at 2:00 PM |
| `30 16 * * 5` | Every Friday at 4:30 PM |
| `0 9 1 * *` | First day of every month at 9:00 AM |
| `0 10 1 1,4,7,10 *` | First day of each quarter at 10:00 AM |
| `*/15 * * * *` | Every 15 minutes |

---

## Flow 1: Inventory (ALWAYS RUN FIRST)

Run this before every create, update, or remove operation.

### Step 1 — Load Registry

Try OIL MCP first, fall back to local file:

```
1. oil:read_note_section → path: "_lcg/scheduled-tasks.md", heading: "Scheduled Tasks"
2. If OIL unavailable → read_file(".copilot/scheduled-tasks.md")
```

### Step 2 — Parse and Present

Extract all H2 task blocks and present as a markdown table:

| Name | Cron | Enabled | Description | Runner |
|---|---|---|---|---|
| LCG-Morning-Triage | `0 7 * * 1-5` | ✅ | Daily weekday morning triage | `node scripts/run.js morning-triage` |
| LCG-Milestone-Review | `0 8 * * 1` | ✅ | Weekly Monday milestone health check | `node scripts/run.js milestone-review` |
| LCG-Vault-Hygiene | `0 16 * * 5` | ❌ | Friday vault cleanup | `node scripts/run.js vault-hygiene` |

### Step 3 — Sprawl Detection

Before proceeding to any create/update, check for:

| Check | Condition | Action |
|---|---|---|
| **Duplicate name** | Proposed task name already exists in registry | Show existing entry, ask: update or pick a new name? |
| **Overlapping schedule** | Another `LCG-*` task runs the same runner within ±5 min of proposed cron time | Warn and suggest consolidating |
| **Disabled stale tasks** | `Enabled: false` entries with no recent edits | Flag for cleanup or removal |
| **Orphaned runners** | Runner references a task file in `scripts/tasks/` that doesn't exist | Flag for repair |

Present findings as a checklist before proceeding.

---

## Flow 2: Create / Add Task

Only after completing Flow 1.

### Inputs Required

| Parameter | Required | Default | Notes |
|---|---|---|---|
| Task name | Yes | — | Must start with `LCG-` |
| Cron expression | Yes | — | Standard 5-field cron |
| Runner command | Yes | — | Typically `node scripts/run.js <task>` |
| Description | Yes | — | One-line summary |
| Prompt | Yes | — | Full agent prompt as blockquote |
| Enabled | No | `true` | Set `false` to register without activating |

### Step 1 — Build Task Block

Construct the new H2 section following the registry format.

### Step 2 — Show Plan

Before writing, display:

```
╔══════════════════════════════════════════════╗
║  TASK REGISTRATION PLAN                      ║
╠══════════════════════════════════════════════╣
║  Name:      LCG-Daily-Sync                   ║
║  Cron:      0 8 * * 1-5  (Mon-Fri 8:00 AM)  ║
║  Runner:    node scripts/run.js daily-sync    ║
║  Enabled:   true                              ║
║  Conflicts: None detected                     ║
╚══════════════════════════════════════════════╝
```

If sprawl checks found issues, show them here and ask for resolution.

### Step 3 — Write to Registry

```
1. oil:get_note_metadata → path: "_lcg/scheduled-tasks.md"
2a. If exists → oil:atomic_append with heading: "Scheduled Tasks", content: <new task block>
2b. If not exists → oil:create_note with full registry content (frontmatter + header + task block)
3. If OIL unavailable → create or edit .copilot/scheduled-tasks.md
```

### Step 4 — Install to OS Scheduler

After registry write, offer to install:

```bash
node scripts/install-scheduler.js --task <task-name> --time <HH:MM> --days <days>
```

Or for cron-native systems, derive directly from the cron expression:

```bash
# Read the cron expression from the registry and install
# The install-scheduler.js handles OS detection automatically
```

### Step 5 — Confirm

Re-read the registry and display the new entry in the inventory table.

---

## Flow 3: Update

1. Run Flow 1 (inventory).
2. Identify the existing task by name.
3. Show current vs. proposed values as a diff:

   | Field | Current | Proposed |
   |---|---|---|
   | Cron | `0 7 * * 1-5` | `30 6 * * 1-5` |
   | Description | Morning triage at 7 AM | Morning triage at 6:30 AM |

4. Replace the task's H2 block in the registry via `oil:atomic_replace` or file edit.
5. Re-install to OS scheduler if the cron expression changed.
6. Confirm with updated inventory.

---

## Flow 4: Remove

1. Run Flow 1 (inventory).
2. Show full task details to the user.
3. **Ask for explicit confirmation** — never auto-delete.
4. Remove the H2 block from the registry.
5. Uninstall from OS scheduler:
   ```bash
   node scripts/install-scheduler.js --task <task-name> --uninstall
   ```
6. Confirm removal by re-reading the registry.

---

## Flow 5: Enable / Disable

Toggle a task without removing it:

1. Load registry.
2. Find the task's `Enabled` field.
3. Flip `true` ↔ `false`.
4. Write back via OIL or file edit.
5. If disabling: uninstall from OS scheduler.
6. If enabling: install to OS scheduler.

---

## Flow 6: Sync Registry → OS Scheduler

Bulk-install all enabled tasks from the registry into the OS scheduler:

```bash
# For each enabled task in the registry:
node scripts/install-scheduler.js --task <name> --time <HH:MM> --days <days>
```

This is useful after:
- Cloning the repo on a new machine.
- Restoring from vault backup.
- Bulk-enabling tasks.

---

## Flow 7: Troubleshooting

When a task didn't fire as expected:

### macOS (launchd)
```bash
# Check if the plist is loaded
launchctl list | grep LCG

# Check recent logs
cat ~/Library/Logs/project.<task-name>.out.log
cat ~/Library/Logs/project.<task-name>.err.log

# Manually trigger
launchctl start project.<task-name>
```

### Linux (cron)
```bash
# List current crontab entries
crontab -l | grep LCG

# Check cron logs
grep CRON /var/log/syslog | tail -20

# Verify cron daemon is running
systemctl status cron
```

### General
```bash
# Test the runner command directly
node scripts/run.js <task> --dry-run

# Verify the task file exists
ls scripts/tasks/<task>.js
```

---

## Registry Persistence Rules

### Write Path Decision Tree

```
Is OIL MCP available?
├── Yes → Write to _lcg/scheduled-tasks.md in vault
│         Use oil:get_note_metadata → oil:atomic_replace (exists)
│         or oil:create_note (new)
└── No  → Write to .copilot/scheduled-tasks.md in repo
          Use create_file (new) or replace_string_in_file (exists)
```

### Rules

- **Always read before writing** — use `oil:get_note_metadata` or `read_file` to check current state.
- **Atomic writes only** — replace the full file content, never partial line edits.
- **Preserve disabled tasks** — they stay in the registry for re-enablement; only explicit remove deletes them.
- **Update the `updated` frontmatter date** on every write.

---

## Output Formatting Standards

All output MUST be structured for readability:

- **Inventory** → Markdown table with columns: Name, Cron, Enabled, Description, Runner.
- **Single task detail** → Key-value box (see registration plan format above).
- **Sprawl warnings** → Checkbox list with recommended actions.
- **Confirmations** → Single-line status: `✅ LCG-Morning-Triage | 0 7 * * 1-5 | Enabled | Installed`
- **Diffs** → Side-by-side table showing Current vs. Proposed values.

Always include the current local time when showing schedules so the user can gauge timing at a glance.
