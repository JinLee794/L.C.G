---
agent: Chief of Staff
description: Interactive wizard to browse L.C.G's automation catalog and schedule them as Windows tasks
---

# Schedule L.C.G Automations

Walk the user through L.C.G's automation catalog and help them schedule selected automations as Windows scheduled tasks. The user may be non-technical — explain everything in plain language, one step at a time.

## Important Context

- All scheduled tasks MUST follow the `LCG-` naming prefix convention.
- Before creating any task, ALWAYS run the task inventory from the dev-task-scheduler skill (Flow 1) to detect duplicates and sprawl.
- All automations run through a single Node.js entry point: `node scripts/run.js <task-name>`.
- The repo path is stored in `$env:LCG_REPO` or defaults to `$HOME\Repos\_InternalTools\L.C.G`.
- No bash or Git Bash required — everything runs on Node.js (v18+).
- The one exception is **Outlook Rules** (`setup-outlook-rules.ps1`) which uses PowerShell + Exchange Online directly.
- Environment variables (`LCG_REPO`, `OBSIDIAN_VAULT_PATH`) must be set at the user level so scheduled tasks inherit them.

## Step 1 — Welcome & Explain

Greet the user and briefly explain what L.C.G automations are:

> L.C.G has a set of automations that do recurring work for you — things like scanning your inbox every morning, reviewing milestones weekly, or cleaning up your knowledge vault. Each automation runs a pre-built workflow using AI to produce a ready-to-review artifact (a note, a brief, a draft email).
>
> I'll walk you through what's available, help you pick what you want to automate, and set up Windows scheduled tasks so they run on autopilot.

Then proceed to Step 2.

## Step 2 — Show the Catalog

Present the catalog below. Use the EXACT formatting — numbered items, bold names, plain-English descriptions. Do NOT show script filenames, environment variables, or technical details yet.

---

### 📅 Daily Automations

**1. Morning Triage**
Your daily command center. Every weekday morning, L.C.G scans your inbox, checks today's calendar, flags urgent items, reviews milestone deadlines, and produces a single Daily note with everything you need to start your day. Think of it as a personal briefing that's ready before your first coffee.

- **What you'll see:** A note in your vault's `Daily/` folder with sections for urgent items, meeting prep status, pipeline alerts, action queue, and FYI items.
- **Recommended schedule:** Monday–Friday at 7:00 AM (runs before you sit down).

---

### 📆 Weekly Automations

**2. Portfolio Review**
A weekly health check on your CRM portfolio. L.C.G pulls your active opportunities, flags pipeline exceptions (stage staleness, close-date drift, missing fields, coverage gaps), and produces a consolidated status report. Scoped by your team configuration in `_lcg/role.md`. Ideal for Monday morning planning.

- **What you'll see:** A note in `Weekly/` with opportunity status by account, pipeline exception flags, coverage metrics, and recommended follow-ups.
- **Recommended schedule:** Monday at 8:00 AM.

> **First time?** Run `/onboarding` first to configure your role and team — this tells L.C.G how to scope your portfolio.

**3. Learning Review**
L.C.G scans your learning log for recurring correction patterns — things she got wrong more than once — and proposes promoting those learnings into permanent vault rules so the same mistakes don't repeat.

- **What you'll see:** A note summarizing patterns found, promotion candidates, and suggested rule changes.
- **Recommended schedule:** Friday at 4:00 PM (end-of-week reflection).

**4. Vault Hygiene**
A cleanup sweep of your Obsidian vault. L.C.G identifies stale notes, migrates lingering action items that should have moved forward, and reports on overall vault health.

- **What you'll see:** A note in `Daily/` with sections for lingering actions, archive candidates, and structural issues.
- **Recommended schedule:** Sunday at 6:00 PM (clean slate for the week).

---

### 🛠️ One-Time Setup

**5. Outlook Rules**
Configures your Outlook inbox with rules aligned to L.C.G's triage system (priority labels, VIP routing, noise suppression). This is a one-time setup — run it once and your inbox starts pre-sorting automatically. Can be re-run safely if you need to update rules.

- **What it does:** Creates Outlook server-side rules prefixed with `[LCG]` that categorize incoming mail by priority and type.
- **Recommended:** Run once during initial setup, then again if you update your VIP list or triage preferences.

---

### ⚡ On-Demand Automations (not scheduled — run when you need them)

These are available anytime but don't run on a schedule. Mentioning them so you know they exist:

**6. Meeting Brief** — Prepares a one-page briefing doc before an important meeting (attendees, history, open items, risks). Run it the day before or morning of.

**7. Meeting Follow-up** — After a meeting, generates action items, draft follow-up emails, staged CRM tasks, and risk flags. Run it right after the meeting.

**8. Update Requests** — Drafts customer update-request emails for milestone owners who haven't reported progress. Run it when you notice stale milestones.

---

After presenting the catalog, ask:

> **Which automations would you like to schedule?** You can pick by number (e.g., "1, 2, and 4"), or just tell me in your own words. If you're not sure, I can recommend a starter set.

If the user says they're not sure or asks for a recommendation, suggest: **Morning Triage + Portfolio Review** as the starter set — these two cover daily prep and weekly pipeline health, which gives the most immediate value.

If the user hasn't run `/onboarding` yet, recommend doing that first so L.C.G knows their role and team configuration.

## Step 3 — Confirm Prerequisites

Before scheduling, check that the environment is ready. Run these checks in terminal:

```powershell
# Check Node.js
node --version

# Check for environment variables
[System.Environment]::GetEnvironmentVariable("LCG_REPO", "User")
[System.Environment]::GetEnvironmentVariable("OBSIDIAN_VAULT_PATH", "User")

# Verify task runner loads
node scripts/run.js list
```

If anything is missing, explain to the user in plain language:

- **Node.js missing/old:** "L.C.G's automations need Node.js version 18 or newer. You can install it from https://nodejs.org."
- **LCG_REPO not set:** "I need to know where the L.C.G repo lives on your machine. What folder is it in? I'll set it up for you."
- **OBSIDIAN_VAULT_PATH not set:** "I need the path to your Obsidian vault so L.C.G knows where to write notes. What folder is your vault in?"
- **Copilot CLI missing:** "The automations use GitHub Copilot's CLI to run prompts. Let me check if it's installed through VS Code."

Set any missing environment variables at the user level:

```powershell
[System.Environment]::SetEnvironmentVariable("LCG_REPO", "<path>", "User")
[System.Environment]::SetEnvironmentVariable("OBSIDIAN_VAULT_PATH", "<path>", "User")
```

### Admin Privilege Check

Creating Windows scheduled tasks requires an **elevated (Administrator)** terminal. Before moving on, check whether the current session is elevated:

```powershell
([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
```

If this returns `True`, proceed to Step 4.

If it returns `False`, pause and explain:

> **Heads-up — I need admin permissions to create scheduled tasks.**
>
> Windows requires an elevated (Administrator) terminal to register scheduled tasks. Here's what to do:
>
> 1. Save any work in this window.
> 2. Close VS Code.
> 3. Right-click the VS Code icon and choose **"Run as administrator"**.
> 4. Re-open this workspace — I'll pick up right where we left off.
>
> Once you're back in an elevated window, let me know and we'll continue.

Do NOT proceed to task creation until the session is confirmed elevated. Wait for the user to confirm they have restarted with admin privileges.

## Step 4 — Configure Each Selected Automation

For each automation the user selected, walk through these steps conversationally:

### Automation Details Map

Use this lookup table to map user selections to task configuration. Do NOT show this table to the user — use it internally.

| # | Catalog Name | Task Name | Runner Command | Default Time | Default Days |
|---|---|---|---|---|---|
| 1 | Morning Triage | LCG-Morning-Triage | `node scripts/run.js morning-triage` | 07:00 | Mon-Fri |
| 2 | Milestone Review | LCG-Milestone-Review | `node scripts/run.js milestone-review` | 08:00 | Monday |
| 3 | Learning Review | LCG-Learning-Review | `node scripts/run.js learning-review` | 16:00 | Friday |
| 4 | Vault Hygiene | LCG-Vault-Hygiene | `node scripts/run.js vault-hygiene` | 18:00 | Sunday |
| 5 | Outlook Rules | LCG-Outlook-Rules | `pwsh.exe -File scripts\setup-outlook-rules.ps1` | (one-time) | (one-time) |

For each selected automation:

1. **Confirm the schedule.** Present the recommended time/frequency and ask if they want to adjust:
   > "Morning Triage runs best as a daily weekday task at 7:00 AM so your briefing is ready before you start. Does 7:00 AM work, or would you prefer a different time?"

2. **Explain what will happen.** In one sentence, tell them what the scheduled task will do:
   > "I'll create a Windows scheduled task called LCG-Morning-Triage that runs every weekday at 7:00 AM. It'll launch L.C.G's morning workflow, scan your inbox and calendar, and save a briefing note to your vault."

3. **Build and register the task** using the dev-task-scheduler skill (Flow 2). All Node tasks use the same pattern:

   ```powershell
   $repoDir = [System.Environment]::GetEnvironmentVariable("LCG_REPO", "User")
   $action = New-ScheduledTaskAction -Execute "node" -Argument "scripts/run.js <TASK-NAME>" -WorkingDirectory $repoDir
   ```

   **For Outlook Rules (PowerShell, one-time):**
   ```powershell
   $repoDir = [System.Environment]::GetEnvironmentVariable("LCG_REPO", "User")
   $action = New-ScheduledTaskAction -Execute "pwsh.exe" -Argument "-File `"$repoDir\scripts\setup-outlook-rules.ps1`"" -WorkingDirectory $repoDir
   ```

   **Triggers:**
   - Daily weekday: `New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday,Tuesday,Wednesday,Thursday,Friday -At <TIME>`
   - Weekly single day: `New-ScheduledTaskTrigger -Weekly -DaysOfWeek <DAY> -At <TIME>`
   - One-time: `New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2)`

4. **Confirm success.** After registration, show a simple confirmation:
   > "✅ Morning Triage is scheduled! It will run every weekday at 7:00 AM. Next run: [date/time]."

5. **Offer an initial test run.** After confirming registration, offer to run the automation once right now so the user can verify everything works end-to-end:

   > "Want me to do a quick test run of Morning Triage right now? This will run the same thing the scheduled task would run, so you can see the output and confirm it's working before waiting for the first scheduled run."

   If the user agrees, execute the runner command directly in the terminal:

   ```powershell
   $repoDir = [System.Environment]::GetEnvironmentVariable("LCG_REPO", "User")
   Set-Location $repoDir
   node scripts/run.js <TASK-NAME>
   ```

   **For Outlook Rules (PowerShell, one-time):**
   ```powershell
   $repoDir = [System.Environment]::GetEnvironmentVariable("LCG_REPO", "User")
   Set-Location $repoDir
   pwsh.exe -File scripts\setup-outlook-rules.ps1
   ```

   - If the run succeeds, confirm positively:
     > "✅ Test run complete! Check your vault — you should see a fresh note in the Daily/ folder. Everything is working."
   - If the run fails, explain the error in plain language and offer to troubleshoot:
     > "Hmm, that didn't go as expected. Here's what happened: [plain-English summary of the error]. Want me to take a look and try to fix it, or skip ahead and we can debug later?"
   - If the user declines the test run, that's fine — move on to the next automation:
     > "No problem — it'll run automatically at the scheduled time. Let's move on."

Repeat for each selected automation before moving to the summary.

## Step 5 — Summary

After all selected automations are configured, present a summary:

> **Here's what's set up:**
>
> | Automation | Schedule | Next Run |
> |---|---|---|
> | Morning Triage | Weekdays at 7:00 AM | Mon 2026-03-25 07:00 |
> | Milestone Review | Mondays at 8:00 AM | Mon 2026-03-25 08:00 |
>
> **What to expect:**
> - Each automation will run in the background at the scheduled time.
> - Results appear as notes in your Obsidian vault — just open Obsidian and check the Daily/ or Weekly/ folder.
> - If your computer is off or asleep at the scheduled time, the task will run the next time you're online (tasks are set to "start when available").
>
> **Managing your automations:**
> - To see all scheduled automations: ask me "list my scheduled tasks"
> - To change a schedule: ask me "change the time for Morning Triage"
> - To pause one: ask me "disable Morning Triage"
> - To remove one: ask me "remove Morning Triage"

## Tone & Interaction Guidelines

- **Never show raw script paths, environment variable names, or PowerShell commands** to the user unless they ask for technical details.
- **Use the catalog names** (Morning Triage, Milestone Review, etc.) not script filenames.
- **One question at a time.** Don't overwhelm with choices — guide the conversation sequentially.
- **If the user seems confused**, offer the starter set (Morning Triage + Milestone Review) and explain you can always add more later.
- **Celebrate small wins.** After each task is created, confirm it positively before moving to the next.
- **If something fails**, explain what happened in plain language and offer to retry or skip.
