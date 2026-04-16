---
name: deal-forecast-prep
description: 'Pre-forecast-call data assembly: pipeline snapshot, commit vs. upside vs. best-case breakdown, week-over-week delta, and exception flags. Designed for GMs preparing weekly/monthly forecast reviews. Triggers: forecast prep, pipeline snapshot, commit list, forecast call prep, forecast review, pipeline summary, weekly forecast, commit upside best case.'
argument-hint: 'Optionally specify a time horizon (this-quarter, next-quarter) or account scope'
---

# Forecast Preparation

## Purpose

Assemble a forecast-ready pipeline snapshot with commit/upside/best-case categorization, week-over-week movement, and exception flags. Output is structured for rapid review during forecast calls.

## When to Use

- Pre-forecast-call preparation (weekly or monthly)
- Pipeline snapshot for leadership updates
- User asks "forecast prep", "commit list", or "pipeline snapshot"

## Role Configuration

Before executing, read `_lcg/role.md` from the vault to determine:

- **quarterly-quota**: Used to compute pipeline coverage ratio
- **coverage-target-multiple**: Used to flag coverage gaps (default 3×)
- **last-refreshed**: If older than 7 days, refresh targets from CRM and update the vault file
- **team-model / method**: Determines scope for multi-seller forecast aggregation

If `_lcg/role.md` does not exist, proceed without coverage calculations and note it.

## Runtime Contract

### Required MCP Tools

| Tool | Purpose |
|------|---------|
| `msx-crm:crm_whoami` | Resolve authenticated user identity |
| `msx-crm:get_my_active_opportunities` | Pull the full active pipeline |

### Optional MCP Tools

| Tool | Purpose |
|------|---------|
| `msx-crm:list_opportunities` | Scope to specific accounts |
| `oil:read_note_section` | Read prior forecast snapshot for delta comparison |
| `oil:create_note` / `oil:atomic_replace` | Persist output to vault |

## Flow

### Step 0: Read Role Config & Refresh Targets

Read `_lcg/role.md` from the vault. If `last-refreshed` is older than 7 days or "never":
1. Attempt to pull quota/target data from CRM via pipeline metrics or territory data.
2. If available, update `_lcg/role.md` via `oil:atomic_replace` with refreshed values and today as `last-refreshed`.
3. If CRM quota data is not available, proceed with existing values and flag the gap.

### Step 1: Pull Current Pipeline

```
msx-crm:get_my_active_opportunities({ maxResults: 200 })
```

### Step 2: Categorize Opportunities

Classify each opportunity into forecast categories based on stage and win probability:

| Category | Criteria |
|----------|----------|
| **Commit** | Stage 4+ OR win probability ≥ 80% |
| **Upside** | Stage 3 with win probability 50–79% |
| **Best Case** | Stage 2–3 with win probability 20–49% |
| **Pipeline** | Stage 1–2 with win probability < 20% |

### Step 3: Compute Forecast Metrics

- Total pipeline value by category
- Close-date distribution (closing this month, next month, this quarter)
- Average deal size and win probability per category
- Top 5 deals by value

### Step 4: Compare to Prior Snapshot (if available)

Read the most recent `Weekly/*-portfolio-review.md` or `Weekly/*-forecast.md` from vault. Compute deltas:
- New opportunities added
- Opportunities that advanced stage
- Opportunities that slipped close date
- Opportunities lost or removed

### Step 5: Flag Forecast Risks

| Risk | Condition |
|------|-----------|
| **Concentration risk** | Single deal > 30% of commit category |
| **Close-date cluster** | >3 deals closing same week |
| **Stage regression** | Any deal moved backward in stage |
| **Coverage gap** | Weighted pipeline < {coverage-target-multiple}× quota (from `_lcg/role.md`; default 3×) |
| **Stale commit** | Commit-category deal with no activity in 14 days |

### Step 6: Format and Persist

Write to vault at `Weekly/<today>-forecast.md`.

## Output Format

```markdown
# Forecast Snapshot — <date>

## Pipeline Summary
| Category | Count | Value | Weighted | Δ vs Last Week |
|----------|-------|-------|----------|----------------|
| Commit | n | $X | $Y | +/- $Z |
| Upside | n | $X | $Y | +/- $Z |
| Best Case | n | $X | $Y | +/- $Z |
| Pipeline | n | $X | $Y | +/- $Z |
| **Total** | **n** | **$X** | **$Y** | **+/- $Z** |

## Top Deals
- [*] **<Opportunity>** · $<value> · Stage {n} · 📅 close **<date>** · <category>
  - ⏭️ **Next:** close plan action
  - [link](recordUrl)

## Movement This Week
### Stage Advances
- [u] **<Opportunity>** · Stage {old} → {new} · $<value>

### Close Date Shifts
- [d] **<Opportunity>** · was **<old date>** → now **<new date>** · $<value>

### New Pipeline
- [i] **<Opportunity>** · Stage {n} · $<value> · added <date>

### Lost / Removed
- [-] **<Opportunity>** · was Stage {n} · $<value> · reason

## Forecast Risks
- [f] **<risk type>** — description
  - 💡 mitigation or action needed

## Run Metadata
- Run date: <today>
- Opportunities analyzed: <count>
- Prior snapshot: <date or "none">
```

## Guardrails

- Read-only. Never execute CRM writes.
- Never send mail or post to Teams.
- If no prior snapshot exists, skip delta comparison and note it.
