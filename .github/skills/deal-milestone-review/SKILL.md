---
name: deal-milestone-review
description: 'Weekly/bi-weekly CRM milestone health review for M1 managers. Resolves the running user, discovers direct reports, pulls active milestones per report, and produces a consolidated status brief with flags for at-risk, overdue, uncommitted, and high-value clusters. Triggers: milestone review, milestone health, weekly milestones, team milestones, direct report milestones, M1 review, milestone governance, crm milestone check.'
argument-hint: 'Optionally specify a manager name or alias; defaults to the authenticated CRM user'
---

# CRM Milestone Review

## Purpose

Produce a consolidated milestone health report for an M1 manager and their direct reports. Designed to run weekly or bi-weekly on a schedule, or interactively via `/deal-milestone-review`.

## When to Use

- Weekly/bi-weekly scheduled milestone governance
- Ad-hoc team milestone health check
- Pre-meeting prep for pipeline or milestone reviews
- Identifying overdue, at-risk, or uncommitted milestones across a team

## Runtime Contract

### Required MCP Tools

| Tool | Purpose |
|------|---------|
| `msx-crm:crm_whoami` | Resolve authenticated user identity |
| `msx-crm:crm_query` | Look up manager → direct reports via `systemusers` |
| `msx-crm:get_milestones` | Pull milestones per owner |

### Optional MCP Tools

| Tool | Purpose |
|------|---------|
| `oil:create_note` / `oil:atomic_replace` | Persist output to vault |

## Flow

### Step 1: Resolve the Manager

```
msx-crm:crm_whoami → { UserId, fullname }
```

If a manager name/alias was provided as input, resolve via:
```
msx-crm:crm_query({
  entitySet: "systemusers",
  filter: "contains(fullname,'<name>')",
  select: "systemuserid,fullname,internalemailaddress",
  top: 5
})
```

Otherwise use the WhoAmI UserId as the manager.

### Step 2: Discover Direct Reports

Query `systemusers` where `_parentsystemuserid_value` equals the manager's `systemuserid`:

```
msx-crm:crm_query({
  entitySet: "systemusers",
  filter: "_parentsystemuserid_value eq '<manager-systemuserid>'",
  select: "systemuserid,fullname,internalemailaddress",
  top: 50
})
```

If zero results, fall back: warn that no direct reports were found and offer to run for the manager's own milestones only.

### Step 3: Pull Milestones per Report

For each direct report (and the manager themselves):

```
msx-crm:get_milestones({
  ownerId: "<systemuserid>",
  statusFilter: "active"
})
```

Collect all milestones into a unified dataset tagged with the owner's name.

### Step 4: Analyze and Flag

Apply these flags to each milestone:

| Flag | Condition |
|------|-----------|
| **OVERDUE** | `msp_milestonedate` < today AND status is On Track |
| **DUE THIS WEEK** | `msp_milestonedate` within 7 days of today |
| **AT RISK** | Status = At Risk |
| **UNCOMMITTED** | Commitment = Uncommitted AND monthly use ≥ $5,000 |
| **HIGH VALUE** | Monthly use ≥ $50,000 |

### Step 5: Format Output

Group milestones by direct report, sorted by due date ascending within each group. See [Output Format](#output-format) below.

### Step 6: Persist (if scheduled)

Write to vault at `Weekly/<today>-milestone-review.md`:
- If file exists → `oil:atomic_replace`
- If file does not exist → `oil:create_note`

## Output Format

```markdown
# Milestone Review — <date>

## Summary
- **Manager:** <name>
- **Direct reports scanned:** <count>
- **Active milestones:** <total>
- **Flagged:** <overdue> overdue · <at-risk> at risk · <uncommitted-high> uncommitted (≥$5K)

## Flags

### OVERDUE
- [f] **<Milestone>** · `<msp_engagementmilestoneid>` · 👤 **<Owner>** · 📅 was due **<date>** · $<monthly>/mo
  - ⚠️ <days> days past due
  - [link](recordUrl)

### AT RISK
- [!] **<Milestone>** · `<msp_engagementmilestoneid>` · 👤 **<Owner>** · 📅 due **<date>** · $<monthly>/mo
  - [link](recordUrl)

### DUE THIS WEEK
- [*] **<Milestone>** · `<msp_engagementmilestoneid>` · 👤 **<Owner>** · 📅 due **<date>** · $<monthly>/mo · <commitment>
  - [link](recordUrl)

## By Direct Report

### <Report Name>
| Milestone | ID | Status | Due | Workload | Monthly | Commitment |
|-----------|-----|--------|-----|----------|---------|------------|
| [name](recordUrl) | msp_engagementmilestoneid | On Track | date | workload | $X | Committed |

### <Report Name 2>
...

## Run Metadata
- Run date: <today>
- Manager ID: <systemuserid>
- Reports queried: <list>
- Empty sections omitted: <list>
```

## Guardrails

- **Read-only.** Never execute CRM writes from this workflow.
- **Never send email or post to Teams.**
- **Always include `msp_engagementmilestoneid`** on every milestone row — in flag bullets, summary tables, and any other milestone reference. This ID is critical for downstream CRM lookups and staged operations.
- If a direct report has zero active milestones, include them with "No active milestones" rather than omitting.
- If the `_parentsystemuserid_value` lookup returns no results, state this clearly and fall back to manager-only milestones.

## Scheduling

This skill is designed for scheduled execution. See:
- **Shell**: [scripts/milestone-review.sh](../../../scripts/milestone-review.sh)
- **PowerShell**: [scripts/milestone-review.ps1](../../../scripts/milestone-review.ps1)
- **Prompt**: [.github/prompts/deal-milestone-review.prompt.md](../../prompts/deal-milestone-review.prompt.md)

Recommended cadence: **weekly (Monday)** or **bi-weekly**.
