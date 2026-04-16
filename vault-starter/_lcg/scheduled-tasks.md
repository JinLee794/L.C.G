---
description: L.C.G scheduled task registry — declarative cron-based task definitions
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

## LCG-Morning-Corrections
- **Cron:** `15 7 * * 1-5`
- **Enabled:** true
- **Runner:** `node scripts/run.js morning-corrections`
- **Description:** Post-triage corrections pass — fixes known issues from the morning triage output.
- **Prompt:**
  > Run morning corrections for today. Load the daily note produced by
  > morning triage, check learning log for known correction patterns,
  > and apply fixes.

## LCG-Escalation-Sweep
- **Cron:** `30 16 * * 1-5`
- **Enabled:** false
- **Runner:** `node scripts/run.js morning-triage --date today`
- **Description:** End-of-day escalation sweep — check new VIP signals and unresolved urgent threads.
- **Prompt:**
  > Run end-of-day escalation sweep. Check for new executive/VIP signals
  > and unresolved urgent threads from today. Flag anything that needs
  > action before EOD.

## LCG-Vault-Hygiene
- **Cron:** `0 15 * * 5`
- **Enabled:** false
- **Runner:** `node scripts/run.js vault-hygiene`
- **Description:** Friday afternoon vault cleanup — stale notes, orphaned links, missing frontmatter.
- **Prompt:**
  > Run vault hygiene check. Scan for stale customer notes (no updates >30d),
  > orphaned wikilinks, missing required frontmatter fields, and produce a
  > cleanup report with suggested actions.
