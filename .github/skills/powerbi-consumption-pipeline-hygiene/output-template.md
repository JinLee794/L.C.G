# Output Template — Consumption Pipeline Hygiene Note

> **Freedom Level: Low** — Use this template exactly. Do not improvise heading names, reorder sections, or omit frontmatter fields. Sections with zero results should be included with a "None detected" note, not omitted (except CRITICAL which is omitted when count is 0).

## Vault Path

```
Daily/ACR Portfolio/consumption-hygiene-<YYYY-MM-DD>.md
```

Use `oil:create_note` for new notes, `oil:atomic_replace` if the note already exists for the same date.

## Frontmatter Schema

```yaml
---
tags: [consumption, hygiene, pipeline, acr]
generated: <YYYY-MM-DD>
source: pbi
fiscal_year: "<CURRENT_FY>"
scope_filter: "<Segment|TPID|ATU|RLS default> = <value>"
total_acr: "<formatted $>"
account_count: <int>
top_account: "<name>"
critical_count: <int>
high_count: <int>
medium_count: <int>
total_exceptions: <int>
total_value_at_risk: "<formatted $>"
mom_declining: <int>
yoy_declining: <int>
concentration_flags: <int>
uncovered_accounts: <int>
stale_opps_60d: <int>
past_due_milestones: <int>
help_needed_milestones: <int>
milestoneless_opps: <int>
total_pipeline_opps: <int>
flagged_accounts:
  - <account name>
top_owners: [<alias>, <alias>, <alias>]
draft_count: <int>
mbs_included: false
---
```

### Field Rules

| Field | Type | Rule |
|---|---|---|
| `scope_filter` | string | Records the active scope. `"RLS default"` if no explicit filter. Examples: `"Segment = Strategic"`, `"TPID = 12345, 67890"`. |
| `total_acr` | string | Always quoted. Format: `"$12.9M"`, `"$454.8K"`. Never raw number. |
| `total_value_at_risk` | string | Always quoted. Sum of ACR for all accounts appearing in any exception. `"—"` if not computed. |
| `top_account` | string | Account name with highest ACR. |
| `flagged_accounts` | array | Every account from any exception query. Powers repeat-offender dashboard. |
| `top_owners` | array | Inline YAML. Top 3 owners by exception count. |
| `draft_count` | int | 0 unless Step 7 ran. |
| `mbs_included` | boolean | Always `false` for this model. |

### What does NOT go in frontmatter

- Account-level detail (ACR values, TPIDs, verticals) → body tables only
- Pipeline detail → body tables only
- Health check detail → body tables only
- Reserved/unused fields → omit entirely

## Revenue Formatting

| Range | Format | Example |
|---|---|---|
| < $1M | `$750K` | `$454.8K` |
| $1M–$999M | `$1.70M` | `$42.5M` |
| ≥ $1B | `$1.70B` | `$2.07B` |

## Body Template

```markdown
# Consumption Pipeline Hygiene — <Month Day, Year>

**Scope:** <seller alias> · <role> · <fiscal year>
**Filter:** <scope filter description or "RLS default — no explicit filter">
> ⚠️ ACR is **1P only** — Marketplace Billed Sales (MBS) not included.

---

## Consumption Snapshot

| Metric | Value |
|---|---|
| **Total Managed Accounts** | <account_count> |
| **Total ACR** | <total_acr> |
| **Top Account** | <top_account> (<top_acr>) |
| MoM Declining (>5%) | <mom_declining> accounts |
| YoY Declining (>5%) | <yoy_declining> accounts |
| Concentration Flags (>20%) | <concentration_flags> accounts |
| High-ACR w/o Pipeline (>$500K) | <uncovered_accounts> accounts |
| Stale Opps (>60d in stage) | <stale_opps_60d> |
| Past-Due Milestones | <past_due_milestones> |
| Help-Needed Milestones | <help_needed_milestones> |
| Opps w/o Milestones | <milestoneless_opps> |

---

## Exception Summary

| Severity | Count | Value at Risk |
|---|---|---|
| 🔴 CRITICAL | <critical_count> | <$> |
| 🟡 HIGH | <high_count> | <$> |
| 🟠 MEDIUM | <medium_count> | <$> |

---

## 🔴 CRITICAL (omit entirely if critical_count = 0)

| Account | TPID | ACR | MoM Δ% | YoY Δ% | Pipeline ACR | Flag |
|---|---|---|---|---|---|---|
| <account> | <tpid> | <acr> | <mom%> | <yoy%> | <pipeline or "—"> | 🔴 <reason> |

---

## 🟡 HIGH — Declining Consumption (4a/4b)

Accounts with significant MoM or YoY ACR decline:

| Account | TPID | ACR | MoM Δ% | YoY Δ% | Last Closed Month | Monthly Avg |
|---|---|---|---|---|---|---|
| <account> | <tpid> | <acr> | <mom%> | <yoy%> | <last_closed> | <monthly_avg> |

> 💡 **<insight summary>** — highlight the biggest decline pattern.

(If none: "No significant MoM or YoY declines detected this period.")

---

## 🟡 HIGH — Stale Opportunities (>60d)

Opportunities stuck in the same sales stage for over 60 days:

| Opportunity | Account | Stage | Days in Stage | Owner | Pipeline ACR | Link |
|---|---|---|---|---|---|---|
| <opp_name> | <account> | <stage> | <days>d | <owner> | <pipeline_acr> | [🔗](<opp_link>) |

> ⚠️ Opportunities >90 days are flagged with 🔴. Cross-reference with ACR decline (4a/4b) for compounded risk.

(If none: "No opportunities stuck >60 days in current stage.")

---

## 🟡 HIGH — Past-Due Milestones

Milestones that have passed their estimated completion date:

| Milestone | Opportunity | Status | Commitment | Est. Month | Owner | Pipeline ACR | Link |
|---|---|---|---|---|---|---|---|
| <milestone> | <opp_name> | <status> | <commitment> | <est_month> | <owner> | <pipeline_acr> | [🔗](<ms_link>) |

> 💡 Past-due milestones on accounts with declining ACR indicate execution gaps contributing to revenue loss.

(If none: "No past-due milestones in portfolio.")

---

## 🟡 HIGH — Concentration Risk

| Account | TPID | ACR | Portfolio Share | Segment |
|---|---|---|---|---|
| <account> | <tpid> | <acr> | <share%> | <segment> |

> 💡 **<insight>** — note whether concentration is structural (one mega-customer) or actionable.

(If none: "No single account exceeds 20% of portfolio ACR.")

---

## 🟠 MEDIUM — Pipeline Coverage Gaps

High-ACR accounts with no active pipeline:

| Account | TPID | ACR | Pipeline ACR | Milestones | Segment |
|---|---|---|---|---|---|
| <account> | <tpid> | <acr> | $0 | 0 | <segment> |

> 💡 Not all uncovered accounts need pipeline — stable consumption without growth intent is valid. Flag for human review.

(If none: "All high-ACR accounts have active pipeline coverage.")

---

## 🟠 MEDIUM — Help-Needed Milestones

Milestones where the owner has explicitly flagged a blocker:

| Milestone | Opportunity | Owner | Help Needed | Status | Pipeline ACR | Link |
|---|---|---|---|---|---|---|
| <milestone> | <opp_name> | <owner> | <help_text> | <status> | <pipeline_acr> | [🔗](<ms_link>) |

> 💡 These are the most actionable items — sellers have explicitly asked for support.

(If none: "No help-needed milestones flagged.")

---

## 🟠 MEDIUM — Milestone-Less Opportunities

Opportunities carrying pipeline dollars with no milestones attached:

| Opportunity | Account | Stage | Owner | Pipeline ACR | Link |
|---|---|---|---|---|---|
| <opp_name> | <account> | <stage> | <owner> | <pipeline_acr> | [🔗](<opp_link>) |

> 💡 No milestones = no tracked execution plan. New opps may be acceptable; long-standing ones with significant pipeline are a risk.

(If none: "All pipeline opportunities have milestones attached.")

---

## Recommended Actions

1. **<action 1>** — <detail>
2. **<action 2>** — <detail>
3. **<action 3>** — <detail>

---

## Owner Summary

| Owner | Items Flagged | Total Value | Top Issue |
|---|---|---|---|
| <owner> | <count> | <$> | <issue> |

---

## Portfolio Table (Top <N> by ACR)

| # | Account | TPID | ATU | Segment | Vertical | ACR |
|---|---|---|---|---|---|---|
| 1 | <account> | <tpid> | <atu> | <segment> | <vertical> | <acr> |
| 2 | ... | ... | ... | ... | ... | ... |

---

## Outlook Drafts Created (omit if Step 7 not executed)

| # | Subject | To | Items Covered | Draft Link |
|---|---|---|---|---|
| 1 | <subject> | <name> (<alias>) | <items> | [Open in Outlook](<webLink>) |

---

## Strategic Pillar Breakdown (omit if Step 9 pillar not executed)

| Super Strategic Pillar | Strategic Pillar | ACR |
|---|---|---|
| <super_pillar> | <pillar> | <acr> |

---

## Monthly ACR Trend (omit if Step 9 trend not executed)

| Fiscal Month | Fiscal Quarter | ACR |
|---|---|---|
| <month> | <quarter> | <acr> |

---

## Pipeline Summary (omit if Step 9 pipeline not executed)

| Account | TPID | Committed | Uncommitted | Qualified | Unqualified | Milestones |
|---|---|---|---|---|---|---|
| <account> | <tpid> | <committed> | <uncommitted> | <qualified> | <unqualified> | <milestones> |

---

## Opportunity Detail (omit if Step 9 opp detail not executed)

| Opportunity | Account | Stage | Days in Stage | Owner | Committed | Qualified | Milestones |
|---|---|---|---|---|---|---|---|
| [<opp name>](<opp_link>) | <account> | <stage> | <days>d | <owner> | <committed> | <qualified> | <milestones> |

> ⚠️ Flag opportunities with Days in Stage > 60.

---

## Milestone Detail (omit if Step 9 milestone detail not executed)

| Milestone | Opportunity | Status | Commitment | Past Due | Est. Month | Workload | Owner | Pipeline ACR |
|---|---|---|---|---|---|---|---|---|
| [<milestone>](<link>) | <opp_name> | <status> | <commitment> | <past_due> | <est_month> | <workload> | <owner> | <pipeline_acr> |

> ⚠️ Flag past-due and help-needed milestones.

---

## Next Steps

> Consumption hygiene reviewed. Run `powerbi-billed-pipeline-hygiene` for billed pipeline exceptions (stage inflation, missing fields, close-date drift) or `crm-portfolio-review` for CRM-level drill-down.
```
