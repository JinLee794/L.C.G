# Output Template — Pipeline Hygiene Note

> **Freedom Level: Low** — Use this template exactly. Do not improvise heading names, reorder sections, or omit frontmatter fields. Sections with zero results should be included with a "None detected" note, not omitted (except CRITICAL which is omitted when count is 0).

## Vault Path

```
Daily/Pipeline Hygiene/pipeline-hygiene-<YYYY-MM-DD>.md
```

Use `oil:create_note` for new notes, `oil:atomic_replace` if the note already exists for the same date.

## Frontmatter Schema

```yaml
---
tags: [pipeline, hygiene, forecast]
generated: <YYYY-MM-DD>
source: pbi
scope: "<CQ-1 label> (CQ-1), <CQ label> (CQ), <CQ+1 label> (CQ+1)"
scope_filter: "<Industry|Sales Unit|TPID|none> = <value>"
total_opps_scoped: <int>
critical_count: <int>
high_count: <int>
medium_count: <int>
total_exceptions: <int>
total_value_at_risk: "<formatted $>"
total_pipeline: "<formatted $>"
weighted_pipeline: "<formatted $>"
flagged_accounts:
  - <account name>
top_owners: [<alias>, <alias>, <alias>]
draft_count: <int>
---
```

### Field Rules

| Field | Type | Rule |
|---|---|---|
| `scope_filter` | string | Records the active scope. `"none"` if unscoped. Examples: `"Industry = Healthcare"`, `"TPID = 12345, 67890"`. |
| `total_value_at_risk` | string | Always quoted. Format: `"$12.9B"`, `"$454.8K"`. Never raw number. |
| `total_pipeline` | string | Always quoted. Same compact format. |
| `weighted_pipeline` | string | Always quoted. `"—"` if not computed. |
| `flagged_accounts` | array | Every account from any exception query. Powers repeat-offender dashboard. |
| `top_owners` | array | Inline YAML. Top 3 by exception count. |
| `draft_count` | int | 0 unless Step 5 ran. |

### What does NOT go in frontmatter

- Exception detail (opp names, CRM URLs, values, stages) → body tables only
- Roster match lists → dashboard computes at render time
- Reserved/unused fields → omit entirely

## Body Template

```markdown
# Pipeline Hygiene — <Month Day, Year>

**Scope:** <scope string> · <scope filter description or "No scope filter applied">
> ⚠️ <config warning if no scope configured, omit if scoped>

---

## Pipeline Snapshot

| Metric | Value |
|---|---|
| **Total Open Opps** | <total formatted with commas> |
| **Total Pipeline** | <total_pipeline> |
| Stale > 30d | <count> (<pct>%) |
| Stale > 60d | <count> (<pct>%) |
| Past-Due Close Date | <count> |
| Close ≤ 14d | <count> |
| Missing Required Fields | <count> |
| High Value ≥ $500K | <count> |
| Stage Inflation Signals | <count> |

### Pipeline by Quarter & Stage

| Quarter | Stage | Opps | Pipeline |
|---|---|---|---|
| **<CQ-1 label>** | 1-Listen & Consult | <n> | <$> |
| | 2-Inspire & Design | <n> | <$> |
| | 3-Empower & Achieve | <n> | <$> |
| **<CQ label>** | 1-Listen & Consult | <n> | <$> |
| | 2-Inspire & Design | <n> | <$> |
| | 3-Empower & Achieve | <n> | <$> |
| **<CQ+1 label>** | 1-Listen & Consult | <n> | <$> |
| | 2-Inspire & Design | <n> | <$> |
| | 3-Empower & Achieve | <n> | <$> |

---

## Exception Summary

| Severity | Count | Value at Risk |
|---|---|---|
| 🔴 CRITICAL | <critical_count> | <$> |
| 🟡 HIGH | <high_count> | <$> |
| 🟠 MEDIUM | <medium_count> | (field hygiene) |

---

## 🔴 CRITICAL (omit entirely if critical_count = 0)

| Opportunity | Account | Owner | Stage | Revenue | Close Date | Flag |
|---|---|---|---|---|---|---|
| [<opp name>](<crm_url>) | <account> | <owner> | <stage> | <revenue> | <close date> | 🔴 <reason> |

---

## 🟡 HIGH — Stage Inflation & At-Risk Deals (4e)

Stage 3+ deals with at-risk or uncommitted forecast:

| Opportunity | Account | Owner | Stage | Forecast | Revenue | Days in Stage |
|---|---|---|---|---|---|---|
| [<opp name>](<crm_url>) | <account> | <owner> | <stage code> | <forecast rec> | **<revenue>** | <days>d |

> 💡 **<insight summary>** — highlight the biggest pattern.

---

## 🟡 HIGH — Close-Date Drift (4b)

| Opportunity | Account | Owner | Close Date | Days Until Close | Stage | Revenue |
|---|---|---|---|---|---|---|
| [<opp name>](<crm_url>) | <account> | <owner> | <close date> | <days> | <stage> | <revenue> |

(If none: "No high-value close-date drift detected this period.")

---

## 🟠 MEDIUM — Missing Required Fields (4c, Top 10 by Value)

| Opportunity | Account | Owner | Revenue | Missing |
|---|---|---|---|---|
| [<opp name>](<crm_url>) | <account> | <owner> | <revenue> | <missing fields> |

---

## ⚠️ Zombie Pipeline Alert (4a)

<1-2 sentence summary of staleness pattern. Note if top entries are zero-value co-sell remnants vs. active deals.>

---

## 💰 High-Value Concentration (4d, Top 10)

<Note whether concentration flag was triggered (any single opp > 30% of pipeline).>

| Opportunity | Account | Owner | Revenue | Share | Stage |
|---|---|---|---|---|---|
| [<opp name>](<crm_url>) | <account> | <owner> | <revenue> | <share%> | <stage code> |

---

## Recommended Actions

1. **<action 1>** — <detail>
2. **<action 2>** — <detail>
3. **<action 3>** — <detail>

---

## Owner Summary

| Owner | Deals Flagged | Total Value | Top Issue |
|---|---|---|---|
| <owner> | <count> | <$> | <issue> |
```

## Revenue Formatting

| Range | Format | Example |
|---|---|---|
| < $1M | `$750K` | `$454.8K` |
| $1M–$999M | `$1.70M` | `$42.5M` |
| ≥ $1B | `$1.70B` | `$2.07B` |
