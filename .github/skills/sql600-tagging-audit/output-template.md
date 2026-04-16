# Output Template — SQL600 Sales Play Tagging Audit

> **Freedom Level: Low** — Use this template exactly. Do not reorder sections or omit frontmatter fields. Empty sections should show "None detected."

## Vault Path

**Primary (OIL available):**
```
Daily/SQL600-HLS/sql600-tagging-audit-<YYYY-MM-DD>.md
```
Use `oil:create_note` for new notes, `oil:atomic_replace` if the note already exists for the same date.

**Fallback (OIL unavailable):**
```
.copilot/docs/sql600-tagging-audit-<YYYY-MM-DD>.md
```
Use `create_file` to write to the workspace. The file can be manually moved to the vault later.

## Frontmatter Schema

```yaml
---
tags: [sql600, hls, tagging-audit, hygiene]
generated: <YYYY-MM-DD>
source: pbi+crm
model: SQL 600 Performance Tracking
scope: "SQL600 HLS (Healthcare)"
audit_mode: "<Full|MismatchOnly|GapOnly|AccountDrill>"
total_accounts_scanned: <int>
critical_count: <int>
warning_count: <int>
gap_account_count: <int>
clean_count: <int>
---
```

## Body Template

```markdown
# SQL600 Sales Play Tagging Audit — <Month Day, Year>

**Scope:** <total_accounts_scanned> SQL600 HLS accounts scanned
**Results:** 🔴 <critical_count> Critical · 🟡 <warning_count> Warning · ⚪ <gap_account_count> Gap Accounts · ✅ <clean_count> Clean

---

## 🔴 Critical — Wrong or Missing Sales Play

Opportunities with Tier 1 SQL workloads and incorrect/missing `msp_salesplay`.

| Account | Opportunity | Current Sales Play | Expected Play | Workload | Owner |
|---|---|---|---|---|---|
| **<TopParent>** | [<OppName>](<OpportunityLink>) | <current_play or ❌ MISSING> | Migrate and Modernize Your Estate | <MilestoneWorkload> | <Owner> |

> **Action:** Update `msp_salesplay` to "Migrate and Modernize Your Estate" (861980067) on each flagged opportunity.

---

## 🟡 Warning — Adjacent Sales Play

Opportunities with SQL workloads tagged to a related but non-ideal sales play. Review and confirm or update.

| Account | Opportunity | Current Sales Play | Workload | Stage | Monthly Pipeline |
|---|---|---|---|---|---|
| **<TopParent>** | [<OppName>](<OpportunityLink>) | <current_play> | <MilestoneWorkload> | <Stage> | <MonthlyUse> |

---

## ⚪ Gap Accounts — No SQL Pipeline

SQL600 HLS accounts with on-prem SQL footprint (`SQL Cores > 0`) but no active SQL-related opportunities. These represent GCP leakage risk.

| Account | Vertical | Field Area | SQL Cores | ACR (LCM) | Committed Pipeline |
|---|---|---|---|---|---|
| **<TopParent>** | <Vertical> | <FieldAreaShorter> | <SQLCores> | <ACR_LCM> | <PipeCommitted or $0> |

> **Action:** Engage account team to identify SQL modernization opportunities and create pipeline.

---

## ✅ Clean — Correctly Tagged

<clean_count> opportunities with SQL workloads and correct sales play.

<If Account Drill mode, list them. Otherwise just the count.>

---

## Audit Methodology

- **PBI Source:** SQL 600 Performance Tracking (`c848b220-eaf2-42e0-b6d2-9633a6e39b37`)
- **CRM Cross-ref:** `msp_salesplay` on opportunity entity, `_msp_workloadlkid_value` on milestone entity
- **SQL Workload Detection:** Tier 1 = workload starts with "Data: SQL"; Tier 2 = MySQL/PostgreSQL; Tier 3 = Modernization Flag
- **Expected Sales Play:** "Migrate and Modernize Your Estate" (861980067) or "Build and Modernize AI Apps" (861980037)
```

## Section Rules

| Section | When Empty |
|---|---|
| 🔴 Critical | Show "None detected. All SQL-workload opps have correct sales play." |
| 🟡 Warning | Show "None detected." |
| ⚪ Gap Accounts | Show "None detected. All SQL600 HLS accounts have SQL pipeline coverage." |
| ✅ Clean | Always show count. Only list details in Account Drill mode. |

## Formatting Rules

- Account names are **bolded** on first mention in each table
- Opportunity names are linked to CRM via `OpportunityLink`
- Dollar values use compact format ($12.8M, $454K)
- SQL Cores use comma separators (12,345)
- Sort Critical and Warning by ACR (LCM) descending (biggest accounts first)
- Sort Gap Accounts by SQL Cores descending (biggest footprint = biggest risk)
