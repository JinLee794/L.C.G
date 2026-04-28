---
name: sql600-tagging-audit
description: 'SQL600 Sales Play tagging audit — cross-references PBI SQL600 HLS account list with CRM opportunities and milestones to flag missing or incorrect msp_salesplay values and accounts with zero SQL-related pipeline. Produces an actionable exception report for governance follow-up. Triggers: SQL600 tagging, SQL600 audit, sales play audit, sales play check, SQL600 sales play, tagging audit, SQL600 exceptions, SQL600 gaps, SQL600 gap accounts, SQL workload audit, SQL modernization tagging, SQL pipeline tagging, untagged SQL opps, wrong sales play, fix sales play, SQL600 hygiene, SQL program tagging, tag check SQL.'
argument-hint: 'Optionally specify: a specific account name, "gap accounts only", "mismatched only", or "full audit".'
---

# SQL600 Sales Play Tagging Audit

## Purpose

**Cross-system audit that discovers opps and milestones on SQL600 HLS accounts that are missing or incorrectly tagged on `msp_salesplay`.** Combines PBI (SQL600 account list + pipeline workloads) with CRM (opportunity sales play + milestone workload lookup) to produce an actionable exception report.

Two alert classes:
1. **Mismatch** — Opp has SQL-related milestone workloads but `msp_salesplay` is not set to an expected SQL modernization play
2. **Gap** — SQL600 HLS account has zero open SQL-related opportunities (no pipeline coverage for the program)
3. **Win** — Opp commitment moved from `uncommitted` to `committed` since the previous audit snapshot

> **⚠️ Load Order:** Read **SKILL.md first** for the full flow. Sub-files are loaded on-demand:
> - [sql600-detection-rules.md](../_shared/sql600-detection-rules.md) — SQL workload patterns, expected sales play values, flagging logic (shared cross-role reference)
> - [output-template.md](output-template.md) — vault persistence format

## When to Use

- Periodic (weekly/bi-weekly) governance hygiene for SQL600 program tagging
- Pre-Connects or pre-review prep to ensure pipeline data quality
- Ad-hoc "which opps should be tagged to SQL600 but aren't?"
- After new opps are created on SQL600 accounts to verify tagging
- Gap account identification for accounts needing SQL pipeline

## Freedom Level

**Low** — Detection rules and workload patterns are exact. Narrative framing for the exception report is formulaic. Do not improvise severity tiers or sales play mappings — use [sql600-detection-rules.md](../_shared/sql600-detection-rules.md) exactly.

## Runtime Contract

| Tool | Purpose | Expected Calls |
|---|---|---|
| `powerbi-remote:ExecuteQuery` | Get SQL600 HLS account list + pipeline detail | **1–2** |
| `mcp_msx_list_opportunities` | Get CRM opp details with sales play | **1 per batch of accounts** (use `customerKeyword` batching) |
| `mcp_msx_get_milestones` | Get milestone workloads for flagged opps | **1–2** (batch via `opportunityIds`) |
| `oil:get_note_metadata` | Check vault note existence before write | 1 (if OIL available) |
| `oil:create_note` / `oil:atomic_replace` | Persist audit report to vault | 1 (if OIL available) |
| `create_file` | Fallback: write to `.copilot/docs/` when OIL is unavailable | 0–1 |

### Not Used

| Tool | Why Not |
|---|---|
| `powerbi-remote:GetSemanticModelSchema` | Schema mapped in parent skill's [schema-mapping.md](../powerbi-sql600-hls/schema-mapping.md) |
| `mcp_msx_crm_query` | Use higher-level `list_opportunities` and `get_milestones` instead |

## Configuration

| Setting | Value | Notes |
|---|---|---|
| **PBI Report ID** | `0551045d-b356-41d5-bda5-ff07ee97b4c1` | SQL 600 Performance Tracking |
| **PBI Semantic Model ID** | `c848b220-eaf2-42e0-b6d2-9633a6e39b37` | Same model as sql600-hls readout |
| **HLS Scope Filter** | `'2) Account'[SQL600 Account] = TRUE() && '2) Account'[Industry] = "Healthcare"` | Always active |
| **Vault Output Path** | `Daily/SQL600-HLS/sql600-tagging-audit-<YYYY-MM-DD>.md` | See [output-template.md](output-template.md) |

---

## Flow

> **⚠️ DISPATCH RULE — ALWAYS DELEGATE TO `pbi-analyst`.**
> This skill requires PBI queries. If not already running inside `pbi-analyst`, immediately call `runSubagent` with `agentName: "pbi-analyst"` and pass the full user request + today's date.

### Step 0 — Determine Audit Mode

| User says | Mode | Scope |
|---|---|---|
| "full audit", "SQL600 tagging" (generic) | **Full** | All checks |
| "gap accounts", "missing SQL opps" | **Gap Only** | Only gap account detection |
| "mismatched", "wrong sales play", "tagging check" | **Mismatch Only** | Only sales play mismatch detection |
| Specific account name | **Account Drill** | Single account deep dive |

Default to **Full** if ambiguous.

### Step 1 — Get SQL600 HLS Accounts + Pipeline from PBI (1–2 PBI calls)

#### Q1 — SQL600 HLS Account List with Pipeline Summary

Get all 43 HLS accounts with their pipeline status and SQL workload flags:

```dax
EVALUATE
SUMMARIZECOLUMNS(
    '2) Account'[TPID],
    '2) Account'[TopParent],
    '2) Account'[Vertical],
    '2) Account'[FieldAreaShorter],
    FILTER('2) Account',
        '2) Account'[SQL600 Account] = TRUE()
        && '2) Account'[Industry] = "Healthcare"
    ),
    "ACR_LCM", [ACR (Last Closed Month)],
    "PipeCommitted", [Pipeline ACR (Committed excl Blocked)],
    "SQLCores", [Total SQL Cores],
    "ModOpps", [Modernization Opportunities],
    "AcctHasModPipe", IF([Accounts With Modernization Pipeline] > 0, 1, 0)
)
ORDER BY [ACR_LCM] DESC
```

#### Q2 — Pipeline Detail with Opportunity IDs and Workloads

Get opp-level pipeline detail including workload flags:

```dax
EVALUATE
SUMMARIZECOLUMNS(
    '2) Account'[TPID],
    '2) Account'[TopParent],
    '✽ Pipeline'[OpportunityID],
    '✽ Pipeline'[OpportunityName],
    '✽ Pipeline'[OpportunityLink],
    '✽ Pipeline'[SalesStageShort],
    '✽ Pipeline'[OpportunityOwner],
    '✽ Pipeline'[MilestoneWorkload],
    '✽ Pipeline'[Modernization Workload Flag],
    '✽ Pipeline'[MilestoneCommitment],
    '✽ Pipeline'[StrategicPillar],
    FILTER('2) Account',
        '2) Account'[SQL600 Account] = TRUE()
        && '2) Account'[Industry] = "Healthcare"
    ),
    "PipeACR", [Pipeline ACR (Qualified)]
)
ORDER BY '2) Account'[TopParent] ASC
```

### Step 2 — Identify SQL-Relevant Opportunities from PBI Data

From Step 1 Q2 results, filter for opportunities that have **SQL-related milestone workloads**. See [sql600-detection-rules.md](../_shared/sql600-detection-rules.md) § SQL Workload Patterns for the exact match list.

Build a list of unique `OpportunityID` values that have at least one SQL workload milestone.

### Step 3 — Cross-Reference with CRM Sales Play

For each SQL-relevant opportunity identified in Step 2, query CRM to get the current `msp_salesplay`:

- Use `mcp_msx_list_opportunities` with `opportunityIds` array for batch lookup
- Extract `msp_salesplay` formatted value for each opp

Compare each opp's `msp_salesplay` against the expected values in [sql600-detection-rules.md](../_shared/sql600-detection-rules.md) § Expected Sales Play Mapping.

### Step 4 — Detect Gap Accounts

From Step 1 Q1 results, identify SQL600 HLS accounts where:
- `ModOpps` = 0 AND `AcctHasModPipe` = 0 (no modernization pipeline at all)
- OR the account has `SQLCores` > 0 but no SQL-workload opportunities (cross-ref with Q2)

These are **gap accounts** — SQL600 members with on-prem SQL footprint but no SQL-related pipeline.

### Step 5 — Classify and Prioritize Exceptions

Apply severity tiers from [sql600-detection-rules.md](../_shared/sql600-detection-rules.md) § Severity Classification:

| Severity | Condition |
|---|---|
| 🔴 **Critical** | SQL workload opp with `msp_salesplay` = null or completely unrelated play |
| 🟡 **Warning** | SQL workload opp with adjacent but non-ideal play (e.g., "Innovate with AI" for a SQL MI modernization) |
| ⚪ **Gap** | SQL600 account with zero SQL-related opps, especially if `SQLCores` > 0 |
| ✅ **Clean** | SQL workload opp with correct expected play |

### Step 5b — Capture Wins (Uncommitted -> Committed)

Detect opportunity-level commitment transitions by comparing the current classified snapshot with the prior run:

- Input: current `classify-sql-pipeline.js` output + previous classified snapshot (`--previous`)
- Win condition: prior commitment state = `uncommitted` and current state = `committed`
- Output: account + opportunity-level win table in the audit note

If normalized inbox data is available, correlate wins with potential winwire evidence:

- Input: `normalize-mail.js` output (`--mail`)
- Signal terms: `winwire`, `win wire`, `closed won`, `deal won`
- Correlation: account/opportunity token overlap in message subject/snippet

### Step 6 — Present & Persist

1. Present the formatted exception report per [output-template.md](output-template.md)
2. **Persist — OIL-first with local fallback:**
   - **If OIL MCP server is available:** Use standard vault write sequence:
     - `oil:get_note_metadata` for `Daily/SQL600-HLS/sql600-tagging-audit-<YYYY-MM-DD>.md`
     - If exists → `oil:atomic_replace` with `mtime_ms`
     - If not → `oil:create_note`
   - **If OIL MCP server is NOT available:** Write to `.copilot/docs/sql600-tagging-audit-<YYYY-MM-DD>.md` via `create_file` (tier 3 fallback per `shared-patterns.instructions.md` § Artifact Output Directory).

---

## Decision Logic

| Situation | Action |
|---|---|
| Opp has multiple workloads (SQL + non-SQL) | Still flag if SQL workload is present and salesplay doesn't match |
| Opp is in "Realize Value" or completed stage | Include but mark as `(completed)` — lower severity, still important for tracking |
| Account has non-SQL opps only | Report as gap account if SQLCores > 0 |
| Sales play is "Migrate and Modernize Your Estate" | ✅ Clean for any SQL workload |
| Sales play is "Innovate with Azure AI Apps and Agents" but opp has SQL MI workload | 🟡 Warning — should likely be "Migrate and Modernize" |
| Sales play is null/empty | 🔴 Critical — must be set |
| User requests single account drill | Run full pipeline for that account only — skip gap account detection |

## Helper Script Pipeline

**Use these scripts to keep agent context lean.** PBI + CRM queries return large payloads that saturate context. The scripts do the classification and cross-referencing offline, returning only the compact exception report.

### Pipeline Flow

```
PBI Q1+Q2 → .copilot/docs/sql600-pipeline-<DATE>.json
            ↓
classify-sql-pipeline.js → .copilot/docs/sql600-classified-<DATE>.json
            ↓                    (compact: just SQL opps + gap accounts)
CRM batch → .copilot/docs/sql600-crm-<DATE>.json
            ↓
audit-sales-play.js → .copilot/docs/sql600-audit-<DATE>.json  (or --format md → vault-ready)
```

### Step-by-Step with Scripts

```bash
DATE=$(date +%F)

# 1. Save PBI results to temp file (agent writes JSON from ExecuteQuery)
#    Shape: { "accounts": [...Q1...], "pipeline": [...Q2...] }
#    → Agent saves this after PBI queries

# 2. Classify SQL workloads (Tier 1/2/3) + identify gap accounts
node scripts/helpers/classify-sql-pipeline.js .copilot/docs/sql600-pipeline-$DATE.json \
  > .copilot/docs/sql600-classified-$DATE.json

# 3. Agent reads classified summary (small!) and does targeted CRM lookups
#    for unique opp IDs in .summary.uniqueOppIds
#    → Agent saves CRM results to .copilot/docs/sql600-crm-$DATE.json

# 4. Cross-reference sales plays and generate audit report
node scripts/helpers/audit-sales-play.js \
  --pipeline .copilot/docs/sql600-classified-$DATE.json \
  --previous .copilot/docs/sql600-classified-$PREV_DATE.json \
  --crm .copilot/docs/sql600-crm-$DATE.json \
  --mail .copilot/docs/mail-normalized-$DATE.json \
  --format md \
  --output .copilot/docs/sql600-audit-$DATE.md

# 5. Agent reads compact audit output and persists:
#    - If OIL MCP available → oil:create_note / oil:atomic_replace to Daily/SQL600-HLS/
#    - If OIL MCP unavailable → create_file to .copilot/docs/
```

### What Each Script Does

| Script | Input | Output | Agent Context Saved |
|---|---|---|---|
| `classify-sql-pipeline.js` | Raw PBI JSON (~100KB+) | Classified opps + gap accounts + summary.uniqueOppIds | Reads only `summary` block (~20 lines) to know which CRM lookups to do |
| `audit-sales-play.js` | Classified JSON + CRM JSON (+ optional previous + normalized mail) | Exception report (JSON or Markdown) with wins | Reads final report (~50–100 lines) instead of raw CRM data (1MB+) |

### Agent Instructions for Script Use

1. **After PBI queries:** Write `{ "accounts": [...], "pipeline": [...] }` to `.copilot/docs/sql600-pipeline-<DATE>.json` using `echo` or heredoc
2. **Run classifier:** Execute `classify-sql-pipeline.js` and **read only `.summary`** from the output — this gives `uniqueOppIds` for CRM lookups + gap account count
3. **CRM lookups:** Use `uniqueOppIds` to batch-fetch opportunities via `mcp_msx_list_opportunities`. Save results to `.copilot/docs/sql600-crm-<DATE>.json`
4. **Run auditor:** Execute `audit-sales-play.js` with `--format md`. Read the markdown output and persist to vault
  - Include `--previous` to detect uncommitted -> committed wins
  - Include `--mail` to correlate wins with winwire inbox evidence
5. **Present:** Show the user the critical/warning/gap summary from the output

> **Key benefit:** PBI payloads (~130+ rows) and CRM payloads (~hundreds of opps) never enter agent context. Agent only sees the ~50-line summary + exceptions.

## Guardrails

- **Read-only** — never write to PBI or CRM from this skill. Exceptions are surfaced for human action
- **Always HLS-scoped** — never run unscoped queries
- **CRM batch size** — max 10 opportunity IDs per `list_opportunities` call
- **No auto-correction** — flag issues, never auto-update `msp_salesplay`. Stage for human review
- **Idempotent** — running twice on the same day replaces the same vault note
