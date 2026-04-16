---
name: powerbi-sql600-hls
description: 'SQL600 HLS executive readout — queries the SQL 600 Performance Tracking Power BI model live for on-demand ACR performance, pipeline health, modernization coverage, renewal exposure, WoW trends, and industry ranking across the 43 HLS SQL600 accounts. Produces a sharp, high-signal executive brief for Patty and leadership. Triggers: SQL600, SQL 600, SQL600 HLS, HLS SQL600, HLS performance, SQL600 readout, SQL600 executive readout, HLS executive readout, SQL600 accounts, HLS accounts, SQL600 pipeline, HLS pipeline, SQL600 ACR, HLS ACR, database compete, DBC HLS, SQL modernization HLS, HLS modernization, SQL600 renewal, HLS renewal, HLS industry ranking, SQL600 trend.'
argument-hint: 'Optionally specify: "top accounts", "renewal watch", "modernization", "trend", "full readout", or a specific account name.'
---

# SQL600 HLS Executive Readout (Power BI)

## Purpose

**On-demand executive readout for the SQL600 HLS portfolio.** Queries the SQL 600 Performance Tracking Power BI model live to produce a concise, high-signal brief covering ACR performance, pipeline health, modernization coverage, renewal risk, week-over-week movement, and industry ranking — all scoped to the 43 Healthcare accounts in the SQL600 program.

Designed for Patty (exec consumer) to pull updates at any time and get an executive-level readout automatically. Reusable across Connects evidence, 1:1 prep, and leadership updates. Always frames progress through **Database Compete (DBC)** and competitive positioning against GCP leakage.

> **⚠️ Load Order:** Read **SKILL.md first** for the full flow. Sub-files are loaded on-demand:
> - [schema-mapping.md](schema-mapping.md) — table/column mapping, relationship model, DAX filter patterns
> - [query-rules.md](query-rules.md) — all DAX queries (aggregate + detail)
> - [output-template.md](output-template.md) — vault persistence format

## When to Use

- On-demand executive readout for SQL600 HLS portfolio
- Pre-meeting prep for DBC reviews, Connects, or leadership updates
- Monthly/weekly trend checks on HLS SQL600 ACR trajectory
- Renewal window risk assessment (FY26 Q3/Q4 critical window)
- Modernization pipeline coverage gaps and factory attach rate
- Industry ranking validation (HLS is #2 in SQL600 — corrects SE&O narrative)
- Identifying GCP leakage risk accounts (no pipeline coverage)

## Freedom Level

**Medium** — Executive narrative requires judgment for emphasis and framing. DAX queries and output structure are exact. Trend interpretation and competitive framing use the DBC lens.

## Runtime Contract

| Tool | Purpose | Expected Calls |
|---|---|---|
| `powerbi-remote:ExecuteQuery` | All PBI data retrieval | **2–3** (snapshot + details + optional trend) |
| `oil:get_note_metadata` | Check vault note existence before write | 1 |
| `oil:create_note` / `oil:atomic_replace` | Persist readout to vault | 1 |

### Removed from Runtime

| Tool | Why Removed |
|---|---|
| `powerbi-remote:GetSemanticModelSchema` | Schema fully mapped in [schema-mapping.md](schema-mapping.md). Never call. |
| `powerbi-remote:GetReportMetadata` | Report ID hardcoded. Auth verified by first `ExecuteQuery`. |

## Configuration

| Setting | Value | Notes |
|---|---|---|
| **Report ID** | `0551045d-b356-41d5-bda5-ff07ee97b4c1` | SQL 600 Performance Tracking in Business Precision |
| **Semantic Model ID** | `c848b220-eaf2-42e0-b6d2-9633a6e39b37` | SQL 600 Performance Tracking |
| **HLS Scope Filter** | `'2) Account'[SQL600 Account] = TRUE() && '2) Account'[Industry] = "Healthcare"` | Always active — hardcoded scope |
| **HLS Account Count** | 43 (of 251 total SQL600) | 17% of SQL600 portfolio |
| **Vault Output Path** | `Daily/SQL600-HLS/sql600-hls-readout-<YYYY-MM-DD>.md` | See [output-template.md](output-template.md) |

### Key People

| Person | Role | Relevance |
|---|---|---|
| **Patty** | Exec consumer | Primary audience — on-demand self-serve readouts |
| **Dandy Weyn** | Business SME | Knows the right questions to shape readout content |
| **Judson** | Account list owner | Owns static SQL600 HLS account list; gets weekly alerts from Carlton |
| **Carlton** | Weekly alerts | Sends weekly SQL600 alerts to Judson |

---

## Flow

> **⚠️ DISPATCH RULE — ALWAYS DELEGATE TO `pbi-analyst`.**
> This skill MUST be executed by the `pbi-analyst` subagent. If not already running inside `pbi-analyst`, immediately call `runSubagent` with `agentName: "pbi-analyst"` and pass the full user request + today's date.

### Step 0 — Scope Resolution (implicit)

Scope is **always hardcoded** to SQL600 HLS:
- `'2) Account'[SQL600 Account] = TRUE()`
- `'2) Account'[Industry] = "Healthcare"`

No user disambiguation needed. If the user provides a specific account name or TPID, add it as an **additional** filter on top of HLS scope — never remove the HLS scope.

Determine which **readout mode** the user wants:

| User says | Mode | Queries to run |
|---|---|---|
| "full readout", "executive readout", "SQL600 HLS" (generic) | **Full** | All queries |
| "top accounts" | **Accounts** | Portfolio Snapshot + Top Accounts |
| "renewal watch", "renewals" | **Renewal** | Portfolio Snapshot + Renewal Exposure |
| "modernization", "mod pipeline" | **Modernization** | Portfolio Snapshot + Modernization Coverage |
| "trend", "trajectory", "month over month" | **Trend** | Portfolio Snapshot + ACR Trend + WoW Delta |
| "ranking", "industry rank" | **Ranking** | Industry Ranking |
| Specific account name/TPID | **Account Drill** | Single-account detail |

Default to **Full** if ambiguous.

### Step 1 — Combined Portfolio Snapshot + Industry Ranking (1 PBI call)

Execute 4 queries in one `ExecuteQuery` call using `daxQueries` array. See [query-rules.md](query-rules.md) § Q1–Q4.

1. **Q1 — Portfolio KPI Snapshot**: ACR (LCM), Pipeline (Committed/Uncommitted/Qualified), Qualified Opps, Total Opps, Modernization Opps, Pipeline Penetration %, SQL TAM, SQL Cores, Annualized Growth, WoW Change, Accounts With/Without Mod Pipeline, Factory Attach %
2. **Q2 — Industry Ranking**: All SQL600 industries by ACR LCM — validates HLS position
3. **Q3 — Vertical Breakdown**: Health Payor / Provider / Pharma / MedTech with account counts, ACR, committed pipeline
4. **Q4 — ACR Monthly Trend**: FY26 month-by-month ACR for HLS SQL600 — shows trajectory

If any query fails with auth error → stop, show auth recovery message.

### Step 2 — Detail Queries (1–2 PBI calls, conditional by mode)

Based on readout mode from Step 0, execute detail queries from [query-rules.md](query-rules.md) § Q5–Q9. Use `daxQueries` array to batch up to 4 per call.

| Query | Gate Condition | What It Returns |
|---|---|---|
| **Q5 — Top 15 Accounts** | Always (Full, Accounts) | TPID, TopParent, Vertical, Segment, FieldAreaShorter, ACR LCM, Pipeline, Annualized Growth |
| **Q6 — Renewal Exposure** | Full, Renewal | SQL500 Target List accounts with renewal quarters, SQL Cores, Arc status |
| **Q7 — Modernization Pipeline** | Full, Modernization | Accounts with mod pipeline, factory attach, qualified mod pipe without factory |
| **Q8 — Gap Accounts** | Full | Accounts in SQL600 HLS with zero committed pipeline (GCP leakage risk) |
| **Q9 — Top Opportunities** | Full, Account Drill | Opportunity detail with stage, owner, commitment, pipeline ACR |

### Step 3 — Synthesize Executive Readout

Assemble the data into the narrative structure defined in [output-template.md](output-template.md). Key synthesis rules:

1. **Lead with the headline number** — ACR LCM + MoM trajectory direction (↑/↓/→)
2. **Industry ranking** — State HLS position explicitly. If #2+, highlight the "corrected narrative" angle (HLS is NOT a laggard)
3. **DBC framing** — Frame pipeline and modernization through Database Compete lens
4. **GCP competitive** — Call out gap accounts (no pipeline) as GCP leakage risk
5. **Renewal urgency** — Flag Q3/Q4 renewal accounts with SQL Cores and current pipeline coverage
6. **WoW delta** — Show Realized ACR + Baseline + Pipe week-over-week movement with $ and direction
7. **Top accounts** — Highlight 5–7 accounts by ACR, growth trajectory, or risk

### Step 4 — Present & Persist

1. Present the formatted readout to the user per [output-template.md](output-template.md)
2. Persist to vault using standard sequence:
   - `oil:get_note_metadata` → check if today's note exists
   - If exists → `oil:atomic_replace` with `mtime_ms`
   - If not → `oil:create_note`

#### HTML Dashboard Output (optional)

When the user says "html report", "dashboard", "rich report", or "exec report":

1. Collect all PBI query results into a single JSON object matching the schema below
2. Write JSON to `/tmp/sql600-data-<YYYY-MM-DD>.json`
3. Run: `node scripts/helpers/generate-sql600-report.js /tmp/sql600-data-<YYYY-MM-DD>.json`
4. Output lands in `.copilot/docs/sql600-hls-readout-<YYYY-MM-DD>.html`
5. Open in browser for preview; printable to PDF via Cmd+P

**JSON input schema** for `generate-sql600-report.js`:
```json
{
  "generated": "YYYY-MM-DD",
  "snapshot": { "ACR_LCM": number, "ACR_YoY_Pct": "string", "AnnualizedGrowth": number, "PipeCommitted": number, "PipeUncommitted": number, "PipeQualified": number, "QualifiedOpps": number, "TotalOpps": number, "ModernizationOpps": number, "PipelinePenetration": "string", "SQLTotalTAM": number, "SQLCores": number, "AcctsWithModPipe": number, "AcctsWithoutModPipe": number, "FactoryAttach": "string", "WoW_Change": number, "AccountCount": number },
  "ranking": [{ "Industry": "string", "ACR_LCM": number, "AccountCount": number }],
  "verticals": [{ "Vertical": "string", "AccountCount": number, "ACR_LCM": number, "PipeCommitted": number, "PipeUncommitted": number, "AnnualizedGrowth": number, "ModOpps": number }],
  "trend": [{ "FiscalMonth": "YYYY-MM-DD", "FiscalQuarter": "string", "ACR": number }],
  "topAccounts": [{ "TopParent": "string", "Vertical": "string", "Segment": "string", "ACR_LCM": number, "PipeCommitted": number|null, "PipeUncommitted": number|null, "AnnualizedGrowth": number, "QualifiedOpps": number|null, "TotalOpps": number|null, "SQLCores": number|null }],
  "renewals": [{ "TopParent": "string", "Category": "string", "RenewalQuarter": "string|null", "SQLCores": number, "ArcEnabled": "Yes|No", "ACR_LCM": number|null, "PipeCommitted": number|null }],
  "gapAccounts": [{ "TopParent": "string", "Vertical": "string", "ACR_LCM": number|null, "PipeUncommitted": number|null, "SQLCores": number|null }]
}
```

---

## Decision Logic

| Situation | Action |
|---|---|
| User asks for "SQL600" without "HLS" qualifier | Check if they mean all SQL600 or HLS specifically. If context suggests HLS (e.g., mentions Patty, DBC, healthcare), proceed with HLS scope. Otherwise ask. |
| ACR trend is declining MoM | Flag prominently. Include "⚠️ Declining trajectory" in headline. Check if pipeline coverage compensates. |
| HLS industry rank drops below #2 | Still report accurately but note the delta from prior position. The narrative correction angle remains valid if HLS was previously underreported. |
| Specific account has zero pipeline and high SQL cores | Tag as "🔴 GCP LEAKAGE RISK" — high SQL footprint with no modernization pipeline = competitive vulnerability. |
| Renewal in current quarter with no committed pipeline | Tag as "🔴 RENEWAL AT RISK" — immediate action needed. |
| Factory attach rate is below 15% | Flag as modernization execution gap — factory resources not being leveraged. |
| WoW change is significantly negative (> $1M decline) | Flag as "⚠️ Week-over-week decline" with $ amount. |

## Output Schema

See [output-template.md](output-template.md) for full vault note format.

**Console output** (shown to user) follows the same structure but without frontmatter — just the formatted readout body.

## Guardrails

- **Read-only** — never write to PBI or CRM from this skill
- **Always HLS-scoped** — never run unscoped queries against the full SQL600 model
- **Max rows**: 50 per detail query. Top accounts capped at 15 unless user requests more
- **Dollar formatting**: Always whole numbers, $ prefix, comma separators. Use compact format ($12.8M, $454K) for KPI cards
- **Period-over-period**: Always show direction arrow (↑↓→) alongside delta values
- **DBC lens**: Frame competitive insights through Database Compete narrative, not generic Azure growth
- **Fun factor**: Occasional easter eggs in readout tone — memorable, not robotic. Keep it sharp and engaging
