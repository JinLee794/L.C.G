---
icon: LiLayoutDashboard
sticker: lucide//layout-dashboard
description: Visual dashboard for L.C.G scheduled automations
cssclasses:
  - lcg-schedule-dashboard
---

# 🤖 Automation Dashboard

> Powered by `_lcg/scheduled-tasks.md` — edit that file to manage your automations.

```dataviewjs
// ─── Load preferences & resolve repo path ───────────────────────────
const registryPath = "_lcg/scheduled-tasks.md";
const prefs = dv.page("_lcg/preferences");
const repoPath = prefs?.lcg_repo || null;

// Resolve Node.js binary — Obsidian's Electron doesn't inherit login PATH,
// so we need to find a real Node to run scripts with.
function findNode() {
  const fs = require("fs");
  const path = require("path");
  const home = require("os").homedir();

  // nvm — scan installed versions, prefer latest
  const nvmBase = path.join(home, ".nvm/versions/node");
  try {
    const versions = fs.readdirSync(nvmBase)
      .filter(v => v.startsWith("v"))
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    for (const v of versions) {
      const p = path.join(nvmBase, v, "bin/node");
      if (fs.existsSync(p)) return p;
    }
  } catch {}

  // Common locations
  for (const p of ["/usr/local/bin/node", "/opt/homebrew/bin/node"]) {
    if (fs.existsSync(p)) return p;
  }

  // Fallback to Obsidian's embedded Node (process.execPath)
  return process.execPath;
}

const nodeBin = findNode();

// Run a repo script directly (NOT the lcg binary which launches Copilot)
function repoExec(scriptPath, args = [], timeout = 15000) {
  return new Promise((resolve) => {
    if (!repoPath) { resolve({ ok: false, error: "lcg_repo not set in _lcg/preferences.md" }); return; }
    const { execFile } = require("child_process");
    const fullScript = require("path").join(repoPath, scriptPath);
    execFile(nodeBin, [fullScript, ...args], { timeout, cwd: repoPath }, (err, stdout, stderr) => {
      resolve({ ok: !err, stdout: (stdout || "") + (stderr || ""), error: err?.message });
    });
  });
}

if (!repoPath) {
  dv.paragraph(`> [!warning] Set \`lcg_repo\` in the frontmatter of [_lcg/preferences.md](_lcg/preferences.md) to the L.C.G repo path. This is set automatically during \`npm run setup\`.`);
}

// ─── Parse scheduled-tasks.md ───────────────────────────────────────
const file = app.vault.getAbstractFileByPath(registryPath);
if (!file) {
  dv.paragraph("⚠️ `_lcg/scheduled-tasks.md` not found. Run the L.C.G bootstrap to create it.");
}

const content = file ? await app.vault.read(file) : "";
const tasks = [];

const DAY_LOOKUP = {
  sunday:0,sun:0,monday:1,mon:1,tuesday:2,tue:2,wednesday:3,wed:3,
  thursday:4,thu:4,friday:5,fri:5,saturday:6,sat:6
};
const DOW_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
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

function parseSchedule(raw) {
  if (!raw) return null;
  const s = raw.trim();
  
  if (/^[0-9*,/-]+\s+[0-9*,/-]+\s+[0-9*,/-]+\s+[0-9*,/-]+\s+[0-9*,/-]+$/.test(s)) {
    const [min,hour,,,dow] = s.split(/\s+/);
    return { cron: s, days: expandDow(dow) };
  }

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
  return `Every ${days.map(d=>DOW_NAMES[d]).join(", ")} at ${time}`;
}

function nextRunStr(parsed) {
  if (!parsed) return "—";
  const now = new Date();
  const [mn,h] = parsed.cron.split(/\s+/).map(Number);
  for (let off=0;off<8;off++) {
    const c=new Date(now); c.setDate(c.getDate()+off); c.setHours(h,mn,0,0);
    if (parsed.days.includes(c.getDay()) && c>now)
      return `${DOW_NAMES[c.getDay()]} ${c.toLocaleDateString("en-US",{month:"short",day:"numeric"})} · ${c.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"})}`;
  }
  return "—";
}

// Split on H2 headers
const sections = content.split(/^## /m).slice(1);
for (const section of sections) {
  const lines = section.split("\n");
  const id = lines[0].trim();
  if (!id.startsWith("LCG-")) continue;
  
  const field = (label) => {
    const line = lines.find(l => new RegExp(`^-\\s+\\*\\*${label}:\\*\\*`, "i").test(l));
    if (!line) return "";
    const m = line.match(new RegExp(`\\*\\*${label}:\\*\\*\\s*\`?([^\`]+)\`?`, "i"));
    return m ? m[1].trim() : "";
  };
  
  const scheduleRaw = field("Schedule") || field("Cron");
  const enabled = field("Enabled").toLowerCase() === "true";
  const description = field("Description");
  const parsed = parseSchedule(scheduleRaw);
  
  tasks.push({
    id, enabled, description,
    scheduleRaw,
    schedule: parsed ? cronToHuman(parsed.cron) : "on-demand",
    cron: parsed?.cron || "",
    days: parsed?.days || [],
    nextRun: enabled ? nextRunStr(parsed) : "—",
    valid: !!parsed,
  });
}

// ─── Summary cards ──────────────────────────────────────────────────
const activeCount = tasks.filter(t => t.enabled).length;
const pausedCount = tasks.filter(t => !t.enabled).length;
const totalCount = tasks.length;

dv.paragraph(`<div style="display:flex;gap:12px;margin-bottom:16px;">
  <div style="flex:1;padding:12px 16px;border-radius:8px;background:var(--background-secondary);border-left:4px solid var(--color-green);">
    <div style="font-size:2em;font-weight:bold;color:var(--color-green);">${activeCount}</div>
    <div style="font-size:0.85em;color:var(--text-muted);">Active</div>
  </div>
  <div style="flex:1;padding:12px 16px;border-radius:8px;background:var(--background-secondary);border-left:4px solid var(--color-yellow);">
    <div style="font-size:2em;font-weight:bold;color:var(--color-yellow);">${pausedCount}</div>
    <div style="font-size:0.85em;color:var(--text-muted);">Paused</div>
  </div>
  <div style="flex:1;padding:12px 16px;border-radius:8px;background:var(--background-secondary);border-left:4px solid var(--text-muted);">
    <div style="font-size:2em;font-weight:bold;">${totalCount}</div>
    <div style="font-size:0.85em;color:var(--text-muted);">Total</div>
  </div>
</div>`);

// ─── Task table with cron verification ──────────────────────────────
const tableData = tasks.map(t => [
  t.enabled ? "✅" : "⏸️",
  t.id.replace("LCG-", "").replace(/-/g, " "),
  t.schedule,
  t.valid ? `\`${t.cron}\`` : "⚠️ Invalid",
  t.valid ? "✅" : "❌",
  t.nextRun,
  t.description || "—",
]);

dv.table(
  ["", "Task", "Schedule", "Cron (agent)", "✓", "Next Run", "Description"],
  tableData
);

// Validation summary
const invalid = tasks.filter(t => !t.valid);
if (invalid.length) {
  dv.paragraph(`> [!warning] ${invalid.length} task(s) have unparseable schedules: ${invalid.map(t=>t.id).join(", ")}`);
} else {
  dv.paragraph(`> [!success] All ${tasks.length} schedules parse correctly.`);
}

// ─── Weekly heat map ────────────────────────────────────────────────
const heatmap = Array(7).fill(0);
for (const t of tasks.filter(t => t.enabled && t.days.length)) {
  for (const d of t.days) heatmap[d]++;
}

const maxHeat = Math.max(...heatmap, 1);
const heatCells = DOW_NAMES.map((label, i) => {
  const count = heatmap[i];
  const intensity = count / maxHeat;
  const bg = count === 0
    ? "var(--background-secondary)"
    : `rgba(76, 175, 80, ${0.2 + intensity * 0.6})`;
  const today = new Date().getDay() === i ? "border:2px solid var(--text-accent);" : "";
  return `<div style="text-align:center;padding:8px 12px;border-radius:6px;background:${bg};${today}min-width:48px;">
    <div style="font-weight:bold;">${label}</div>
    <div style="font-size:0.8em;color:var(--text-muted);">${count} task${count !== 1 ? "s" : ""}</div>
  </div>`;
}).join("");

dv.paragraph(`<div style="margin-top:16px;"><strong>Weekly Load</strong></div>`);
dv.paragraph(`<div style="display:flex;gap:6px;margin-top:8px;">${heatCells}</div>`);

// ─── Action buttons ─────────────────────────────────────────────────
const btnContainer = dv.el("div", "", {
  attr: { style: "display:flex;gap:10px;margin-top:20px;flex-wrap:wrap;" }
});

function makeBtn(parent, label, icon, style, onClick) {
  const btn = parent.createEl("button", { text: `${icon} ${label}` });
  btn.style.cssText = `
    padding:8px 16px;border-radius:6px;cursor:pointer;font-size:0.9em;
    border:1px solid var(--background-modifier-border);font-weight:500;
    ${style}
  `;
  btn.addEventListener("click", onClick);
  return btn;
}

// Sync button
makeBtn(btnContainer, "Sync to OS Scheduler", "🔄", 
  "background:var(--interactive-accent);color:var(--text-on-accent);border:none;",
  async () => {
    if (!repoPath) { new Notice("⚠️ Set lcg_repo in _lcg/preferences.md frontmatter", 5000); return; }
    new Notice("⏳ Syncing schedules to OS…");
    const r = await repoExec("scripts/sync-schedule.js");
    if (r.ok) {
      const lines = r.stdout.split("\n").filter(l => l.includes("✅") || l.includes("⏸")).join("\n");
      new Notice(`✅ Schedule synced!\n${lines}`, 6000);
    } else {
      new Notice(`❌ Sync failed: ${r.error}`, 8000);
      console.error("Schedule sync error:", r.error);
    }
  }
);

// Check status button
makeBtn(btnContainer, "Check Status", "📋",
  "background:var(--background-secondary);",
  async () => {
    if (!repoPath) { new Notice("⚠️ Set lcg_repo in _lcg/preferences.md frontmatter", 5000); return; }
    const r = await repoExec("scripts/sync-schedule.js", ["--status"], 10000);
    if (r.ok) new Notice(r.stdout.trim(), 8000);
    else new Notice(`❌ ${r.error}`, 5000);
  }
);

// Edit registry button
makeBtn(btnContainer, "Edit Schedules", "✏️",
  "background:var(--background-secondary);",
  () => {
    const target = app.vault.getAbstractFileByPath(registryPath);
    if (target) app.workspace.getLeaf().openFile(target);
    else new Notice("⚠️ scheduled-tasks.md not found");
  }
);

// Run a specific task button
makeBtn(btnContainer, "Run Task…", "▶️",
  "background:var(--background-secondary);",
  async () => {
    if (!repoPath) { new Notice("⚠️ Set lcg_repo in _lcg/preferences.md frontmatter", 5000); return; }
    const names = tasks.map(t => t.id.replace("LCG-","").toLowerCase().replace(/-/g,"-"));
    const chosen = await app.plugins?.plugins?.["quickadd"]?.api?.suggester?.(
      names.map((n,i) => `${tasks[i].enabled ? "✅" : "⏸️"} ${n}`),
      names
    );
    if (!chosen) {
      await navigator.clipboard.writeText(`lcg list`);
      new Notice("📋 Copied 'lcg list' to clipboard. Paste in terminal to see tasks.", 5000);
      return;
    }
    new Notice(`⏳ Running ${chosen}…`);
    const r = await repoExec("scripts/run.js", [chosen], 120000);
    if (r.ok) new Notice(`✅ ${chosen} complete`, 5000);
    else new Notice(`❌ ${chosen} failed: ${r.error}`, 8000);
  }
);

// ─── Footer ─────────────────────────────────────────────────────────
dv.paragraph(`<div style="margin-top:20px;padding-top:12px;border-top:1px solid var(--background-modifier-border);font-size:0.82em;color:var(--text-muted);">
  📄 Source: <a class="internal-link" href="${registryPath}">_lcg/scheduled-tasks.md</a> · Last refreshed: ${new Date().toLocaleString("en-US", {month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})}
</div>`);

// ─── Auto-refresh when scheduled-tasks.md changes ───────────────────
// Dataview re-renders when the source file changes. Register a vault
// event listener to trigger a re-render of THIS note when the registry
// file is modified (covers edits made in another pane).
const dashboardPath = dv.current().file.path;
const handler = (changedFile) => {
  if (changedFile.path === registryPath) {
    // Force dataview to re-evaluate this note
    app.metadataCache.trigger("dataview:refresh-views");
  }
};
app.vault.on("modify", handler);
// Clean up when the note is unloaded to prevent listener leaks
this.register?.(() => app.vault.off("modify", handler));
```

## Quick Actions

- [[_lcg/scheduled-tasks|✏️ Edit Schedule Registry]]
- Run `npm run schedule:sync` in terminal to push changes to OS scheduler
- Run `npm run schedule:status` to check what's installed vs. what's in the registry
- Run `npm run task:list` to see the CLI view
