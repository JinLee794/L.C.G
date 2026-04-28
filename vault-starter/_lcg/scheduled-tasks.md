---
icon: LiCalendarCheck
sticker: lucide//calendar-check
description: L.C.G scheduled task registry — declarative cron-based task definitions
updated: 2026-04-21
cssclasses:
  - lcg-schedule
---

# Scheduled Tasks

> [!info] This file is the **source of truth** for all L.C.G automations.
> Edit the task sections below, then check the live preview table to verify your schedules are correct. Run `npm run schedule:sync` to push changes to your OS scheduler.

## Live Schedule Preview

```dataviewjs
// ─── Live validator: re-reads THIS file on every render ─────────────
const registryPath = "_lcg/scheduled-tasks.md";
const file = app.vault.getAbstractFileByPath(registryPath);
if (!file) { dv.paragraph("⚠️ Cannot find registry file."); }

const content = file ? await app.vault.read(file) : "";

// ─── Schedule parser (human → cron) ────────────────────────────────
const DAY_LOOKUP = {
  sunday:0,sun:0,monday:1,mon:1,tuesday:2,tue:2,wednesday:3,wed:3,
  thursday:4,thu:4,friday:5,fri:5,saturday:6,sat:6
};
const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const DOW_FULL = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

function expandDow(d) {
  const r = [];
  if (d === "*") { for (let i=0;i<7;i++) r.push(i); return r; }
  for (const seg of d.split(",")) {
    if (seg.includes("-")) { const [a,b]=seg.split("-").map(Number); for(let i=a;i<=b;i++) r.push(i); }
    else r.push(Number(seg));
  }
  return r;
}

function parseToCron(raw) {
  if (!raw) return null;
  const s = raw.trim();

  // Legacy cron passthrough
  if (/^[0-9*,/-]+\s+[0-9*,/-]+\s+[0-9*,/-]+\s+[0-9*,/-]+\s+[0-9*,/-]+$/.test(s)) {
    return { cron: s, days: expandDow(s.split(/\s+/)[4]) };
  }

  // Human: "Every <days> at <H>:<MM> <AM|PM>"
  const m = s.match(/^every\s+(.+?)\s+at\s+(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  const [, daysPart, hStr, mStr, ap] = m;
  let h = parseInt(hStr), mn = parseInt(mStr);
  if (ap.toUpperCase()==="PM" && h<12) h+=12;
  if (ap.toUpperCase()==="AM" && h===12) h=0;

  const dl = daysPart.toLowerCase().trim();
  let cronDow, days;
  if (dl==="day") { cronDow="*"; days=[0,1,2,3,4,5,6]; }
  else if (dl==="weekday"||dl==="weekdays") { cronDow="1-5"; days=[1,2,3,4,5]; }
  else if (dl==="weekend"||dl==="weekends") { cronDow="0,6"; days=[0,6]; }
  else {
    const tokens = dl.replace(/\band\b/g,",").split(",").map(t=>t.trim()).filter(Boolean);
    days = tokens.map(t=>DAY_LOOKUP[t]).filter(n=>n!==undefined);
    cronDow = days.join(",");
  }
  return { cron: `${mn} ${h} * * ${cronDow}`, days };
}

function cronToHuman(cron) {
  const [mn,h,,,dow] = cron.split(/\s+/);
  const hr = parseInt(h), mi = parseInt(mn);
  const ap = hr>=12?"PM":"AM";
  const h12 = hr===0?12:hr>12?hr-12:hr;
  const time = `${h12}:${String(mi).padStart(2,"0")} ${ap}`;
  if (dow==="*") return `Every day at ${time}`;
  const days = expandDow(dow);
  if (days.length===5 && !days.includes(0) && !days.includes(6)) return `Every weekday at ${time}`;
  if (days.length===2 && days.includes(0) && days.includes(6)) return `Every weekend at ${time}`;
  if (days.length===1) return `Every ${DOW_FULL[days[0]]} at ${time}`;
  return `Every ${days.map(d=>DOW[d]).join(", ")} at ${time}`;
}

function nextRun(parsed) {
  if (!parsed) return "—";
  const now = new Date();
  const [mn,h] = parsed.cron.split(/\s+/).map(Number);
  for (let off=0; off<8; off++) {
    const c = new Date(now); c.setDate(c.getDate()+off); c.setHours(h,mn,0,0);
    if (parsed.days.includes(c.getDay()) && c > now) {
      return `${DOW[c.getDay()]} ${c.toLocaleDateString("en-US",{month:"short",day:"numeric"})} · ${c.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"})}`;
    }
  }
  return "—";
}

// ─── Parse task sections ────────────────────────────────────────────
const sections = content.split(/^## /m).slice(1);
const tasks = [];
for (const section of sections) {
  const lines = section.split("\n");
  const id = lines[0].trim();
  if (!id.startsWith("LCG-")) continue;

  const field = (label) => {
    const line = lines.find(l => new RegExp(`^-\\s+\\*\\*${label}:\\*\\*`,"i").test(l));
    if (!line) return "";
    const m = line.match(new RegExp(`\\*\\*${label}:\\*\\*\\s*\`?([^\`]+)\`?`,"i"));
    return m ? m[1].trim() : "";
  };

  const schedRaw = field("Schedule") || field("Cron");
  const enabled = field("Enabled").toLowerCase() === "true";
  const parsed = parseToCron(schedRaw);

  tasks.push({ id, schedRaw, enabled, parsed });
}

// ─── Render validation table ────────────────────────────────────────
const rows = tasks.map(t => {
  const status = t.enabled ? "✅ Active" : "⏸️ Paused";
  const name = t.id.replace("LCG-","").replace(/-/g," ");
  const youTyped = t.schedRaw || "—";
  const cronExpr = t.parsed ? `\`${t.parsed.cron}\`` : "⚠️ Invalid";
  const verify = t.parsed ? cronToHuman(t.parsed.cron) : "—";
  const match = t.parsed && verify.toLowerCase() === youTyped.toLowerCase() ? "✅" : t.parsed ? "🔄" : "❌";
  const next = t.enabled ? nextRun(t.parsed) : "—";
  return [status, name, youTyped, cronExpr, verify, match, next];
});

dv.table(
  ["Status", "Task", "You typed", "Cron (for agent)", "Translates to", "✓", "Next run"],
  rows
);

// ─── Warnings ───────────────────────────────────────────────────────
const invalid = tasks.filter(t => !t.parsed);
const mismatches = tasks.filter(t => {
  if (!t.parsed) return false;
  return cronToHuman(t.parsed.cron).toLowerCase() !== t.schedRaw.toLowerCase();
});

if (invalid.length) {
  dv.paragraph(`> [!warning] ${invalid.length} task(s) have unparseable schedules: ${invalid.map(t=>t.id).join(", ")}`);
}
if (mismatches.length) {
  dv.paragraph(`> [!note] ${mismatches.length} schedule(s) have minor formatting differences (still valid): ${mismatches.map(t=>t.id).join(", ")}`);
}
if (!invalid.length && !mismatches.length) {
  dv.paragraph(`> [!success] All ${tasks.length} schedules parse correctly.`);
}
```

## How to Add a New Task

Copy this template as a new `## LCG-Your-Task-Name` section. **That's it** — the prompt you write here is sent directly to GitHub Copilot when the task runs. No code needed.

```markdown
## LCG-My-New-Task
- **Schedule:** Every Monday at 9:00 AM
- **Enabled:** true
- **Description:** What this task does.
- **Prompt:**
  > The prompt text that gets sent to GitHub Copilot when this task runs.
  > It has full access to your vault, CRM, calendar, email, and Teams.
  > Use {{TODAY}} for today's date.
```

> [!info] How it works
> The task name is derived from the section heading (e.g., `LCG-My-New-Task` → `my-new-task`). When it fires, L.C.G reads the **Prompt** from this file and sends it directly to GitHub Copilot with your vault attached. The agent has full access to your tools and data.

| Field | Format | Examples |
|---|---|---|
| **Schedule** | Plain English | `Every weekday at 7:00 AM` · `Every Monday at 8:00 AM` · `Every Mon, Wed, Fri at 9:00 AM` |
| **Enabled** | `true` / `false` | Toggle on/off without removing the task |
| **Description** | One-liner | What this automation does |
| **Prompt** | Blockquote lines | What you want the agent to do — plain English instructions |

> [!tip] Schedule patterns
> - `Every weekday at 7:00 AM` — Monday through Friday
> - `Every day at 6:00 AM` — all seven days
> - `Every Monday at 8:00 AM` — single day
> - `Every Mon, Wed, Fri at 9:00 AM` — specific days
> - `Every Friday at 3:00 PM` — use AM/PM for time

> [!tip] Prompt variables
> Use `{{TODAY}}` in your prompt — it's replaced with the current date (YYYY-MM-DD) at runtime.

---

## LCG-Morning-Triage
- **Schedule:** Every weekday at 7:00 AM
- **Enabled:** true
- **Description:** Daily weekday morning triage — pulls calendar, mail, CRM data and produces the daily note.
- **Prompt:**
  > Run morning triage for today. Load config gate, pull calendar and mail
  > for the target date's midnight-to-midnight range, query CRM for pipeline
  > alerts and overdue milestones, and produce the daily triage note at
  > Daily/{{TODAY}}.md.

## LCG-Milestone-Review
- **Schedule:** Every Monday at 8:00 AM
- **Enabled:** true
- **Description:** Weekly Monday milestone health check across direct reports.
- **Prompt:**
  > Run milestone review. Resolve running user, discover direct reports, pull
  > active milestones per report, and produce a consolidated status brief with
  > flags for at-risk, overdue, uncommitted, and high-value clusters.

## LCG-Portfolio-Review
- **Schedule:** Every Wednesday at 2:00 PM
- **Enabled:** true
- **Description:** Wednesday pipeline review — opportunity hygiene, close-date deltas, risk flags.
- **Prompt:**
  > Run portfolio review. Pull active opportunities by owner, flag stage
  > staleness, close-date drift, and missing fields. Produce consolidated
  > status brief grouped by account or stage.

## LCG-Morning-Corrections
- **Schedule:** Every weekday at 7:15 AM
- **Enabled:** true
- **Description:** Post-triage corrections pass — fixes known issues from the morning triage output.
- **Prompt:**
  > Run morning corrections for today. Load the daily note produced by
  > morning triage, check learning log for known correction patterns,
  > and apply fixes.

## LCG-Escalation-Sweep
- **Schedule:** Every weekday at 4:30 PM
- **Enabled:** false
- **Description:** End-of-day escalation sweep — check new VIP signals and unresolved urgent threads.
- **Prompt:**
  > Run end-of-day escalation sweep. Check for new executive/VIP signals
  > and unresolved urgent threads from today. Flag anything that needs
  > action before EOD.

## LCG-Vault-Hygiene
- **Schedule:** Every Friday at 3:00 PM
- **Enabled:** false
- **Description:** Friday afternoon vault cleanup — stale notes, orphaned links, missing frontmatter.
- **Prompt:**
  > Run vault hygiene check. Scan for stale customer notes (no updates >30d),
  > orphaned wikilinks, missing required frontmatter fields, and produce a
  > cleanup report with suggested actions.
