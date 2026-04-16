---
name: deal-portfolio-review
description: 'Weekly/bi-weekly CRM portfolio health review. Pulls active opportunities by owner or territory, flags stage staleness, close-date drift, and missing fields. Produces a consolidated status brief grouped by account or stage. Triggers: portfolio review, opportunity health, territory review, opportunity exceptions, CRM portfolio check, portfolio by account, portfolio by stage. DO NOT USE FOR: pipeline hygiene or exception detection (use powerbi-billed-pipeline-hygiene or powerbi-consumption-pipeline-hygiene), forecast call assembly or commit/upside breakdown (use deal-forecast-prep), pipeline coverage analysis (use powerbi-billed-pipeline-hygiene or powerbi-consumption-pipeline-hygiene), seller 1:1 prep (use deal-coaching-brief).'
argument-hint: 'Optionally scope by account TPID, territory name, or seller alias; defaults to the authenticated CRM user'
---

# CRM Portfolio Review

## Purpose

Produce a consolidated portfolio health report across active opportunities. Designed to run weekly or bi-weekly on a schedule, or interactively via `/deal-portfolio-review`.

## When to Use

- Weekly/bi-weekly pipeline governance
- Ad-hoc portfolio health check
- Pre-forecast-call pipeline snapshot
- Identifying stale, at-risk, or under-documented opportunities

## Role Configuration

Before executing, read `_lcg/role.md` from the vault to determine:

- **team-model**: How to scope the portfolio (territory, seller-list, direct-reports, or self)
- **Team Discovery → method**: Which discovery path to use
- **Territory / Seller List**: Specific accounts or sellers to include
- **Forecast Targets → quarterly-quota / coverage-target-multiple**: Used to compute pipeline coverage gaps
- **Forecast Targets → last-refreshed**: If older than 7 days, refresh targets from CRM before computing coverage and update `last-refreshed` in the vault file.

If `_lcg/role.md` does not exist, fall back to the authenticated CRM user's own portfolio (method = self).

## Runtime Contract

### Required MCP Tools

| Tool | Purpose |
|------|---------|
| `msx-crm:crm_whoami` | Resolve authenticated user identity |
| `msx-crm:get_my_active_opportunities` | Pull active opportunities for the user |
| `msx-crm:list_opportunities` | Pull opportunities by account (when scoped) |

### Optional MCP Tools

| Tool | Purpose |
|------|---------|
| `msx-crm:get_milestones` | Drill into milestone detail when opportunity-level data is insufficient |
| `oil:create_note` / `oil:atomic_replace` | Persist output to vault |

## Flow

### Step 0: Read Role Config

Read `_lcg/role.md` from the vault. Extract:
- `method` (territory | seller-list | direct-reports | self)
- `accounts` list (if territory)
- `sellers` list (if seller-list)
- `quarterly-quota` and `coverage-target-multiple`
- `last-refreshed` date

If `last-refreshed` is older than 7 days (or "never"), plan to refresh forecast targets from CRM after pulling opportunities.

### Step 1: Resolve Identity

```
msx-crm:crm_whoami → { UserId, fullname }
```

Then resolve scope based on `_lcg/role.md` method:

- **territory**: Resolve each account in the accounts list via `msx-crm:list_accounts_by_tpid` or `msx-crm:crm_query`.
- **seller-list**: Resolve each seller via `msx-crm:crm_query` on `systemusers`.
- **direct-reports**: Query `systemusers` where `_parentsystemuserid_value eq '<UserId>'`.
- **self** (or no role config): Use the WhoAmI UserId only.

If a scope parameter was explicitly provided in the prompt invocation, it overrides role config.

### Step 2: Pull Active Opportunities

Based on resolved scope:

- **self**: `msx-crm:get_my_active_opportunities({ maxResults: 100 })`
- **territory (by account)**: `msx-crm:list_opportunities({ accountId: "<id>" })` for each account
- **seller-list**: `msx-crm:list_opportunities({ ownerId: "<seller-id>" })` for each seller
- **direct-reports**: `msx-crm:list_opportunities({ ownerId: "<report-id>" })` for each report, plus self

### Step 3: Compute Pipeline Metrics

From the opportunity set, compute:
- **Total pipeline**: sum of estimated revenue across all active opportunities
- **Weighted pipeline**: sum of (estimated revenue × win probability) per opportunity
- **Stage distribution**: count and value by stage (1–5)
- **Close-date distribution**: opportunities closing this week, this month, this quarter
- **Pipeline coverage**: weighted pipeline ÷ quarterly-quota (from `_lcg/role.md`). Flag if below `coverage-target-multiple`.

If `last-refreshed` was stale and new targets are available from CRM, update `_lcg/role.md` via `oil:atomic_replace` with the refreshed quota and today's date as `last-refreshed`.

### Step 4: Flag Exceptions

Apply these flags to each opportunity:

| Flag | Condition |
|------|-----------|
| **STAGE STALE** | Opportunity in current stage for >30 days with no recent activity |
| **CLOSE DATE PAST DUE** | `estimatedclosedate` < today AND still active |
| **CLOSE DATE IMMINENT** | `estimatedclosedate` within 14 days |
| **MISSING FIELDS** | `msp_salesplay` is null OR `description` empty OR `estimatedvalue` = 0 |
| **LOW WIN PROBABILITY** | Stage 2+ but win probability < 20% |
| **HIGH VALUE** | Estimated revenue ≥ $500K |

### Step 5: Format Output

Group opportunities by account, sorted by close date ascending within each group. See [Output Format](#output-format) below.

### Step 6: Persist (if scheduled)

Write to vault at `Weekly/<today>-portfolio-review.md`:
- If file exists → `oil:atomic_replace`
- If file does not exist → `oil:create_note`

## Output Format

```markdown
# Portfolio Review — <date>

## Summary
- **Owner:** <name>
- **Active opportunities:** <total>
- **Total pipeline:** $<sum>
- **Weighted pipeline:** $<weighted sum>
- **Flagged:** <stale> stale · <past-due> past close date · <missing> missing fields

## Pipeline Snapshot
| Stage | Count | Value | Weighted |
|-------|-------|-------|----------|
| Stage 1 | n | $X | $Y |
| Stage 2 | n | $X | $Y |
| Stage 3 | n | $X | $Y |
| Stage 4 | n | $X | $Y |
| Stage 5 | n | $X | $Y |

## Exceptions

### STAGE STALE
- [f] **<Opportunity>** · Stage {n} for {days}d · 👤 **<Owner>** · 📅 close **<date>** · $<value>
  - ⚠️ No activity since <last activity date>
  - [link](recordUrl)

### CLOSE DATE PAST DUE
- [!] **<Opportunity>** · Stage {n} · 👤 **<Owner>** · 📅 was due **<date>** · $<value>
  - ⚠️ <days> days past close date
  - [link](recordUrl)

### CLOSE DATE IMMINENT
- [*] **<Opportunity>** · Stage {n} · 👤 **<Owner>** · 📅 close **<date>** · $<value> · <win probability>%
  - ⏭️ **Next:** close plan action
  - [link](recordUrl)

### MISSING FIELDS
- [k] **<Opportunity>** · missing: <field list>
  - [link](recordUrl)

## By Account

### <Account Name>
| Opportunity | Stage | Close Date | Value | Win % | Status |
|-------------|-------|------------|-------|-------|--------|
| [name](recordUrl) | 2 | date | $X | 60% | On Track |

### <Account Name 2>
...

## Milestone Drill-Down

> Need milestone-level detail for any of these opportunities? Just ask — e.g., "drill into milestones for [opportunity name]" — and L.C.G will pull the full milestone view.

## Run Metadata
- Run date: <today>
- Owner ID: <systemuserid>
- Scope: self | territory | seller-list | direct-reports
- Role config: `_lcg/role.md` (method: <method>)
- Opportunities queried: <count>
- Forecast targets: quota=$<quota>, coverage=<ratio>× (refreshed: <date>)
- Empty sections omitted: <list>
```

## Guardrails

- Read-only. Never execute CRM writes from this workflow.
- Never send mail or post to Teams.
- If scoped account lookup fails, fall back to user's full portfolio and note the degradation.
- If an account has zero active opportunities, include it with "No active opportunities" rather than omitting.
