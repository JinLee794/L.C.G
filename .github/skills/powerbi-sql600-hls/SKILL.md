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
- Industry ranking validation — report HLS's actual position among SQL600 industries without assuming a prior narrative
- Identifying GCP leakage risk accounts (no pipeline coverage)

## Freedom Level

**Medium** — Executive narrative requires judgment for emphasis and framing. DAX queries and output structure are exact. Trend interpretation and competitive framing use the DBC lens.

## Runtime Contract

| Tool | Purpose | Expected Calls |
|---|---|---|
| `powerbi-remote:ExecuteQuery` | SQL600 PBI data retrieval | **2–3** (snapshot + details + optional trend) |
| `powerbi-remote:ExecuteQuery` | AIO cross-reference queries | **1–2** (MoM trend + service breakdown + budget) |
| `oil:get_note_metadata` | Check vault note existence before write | 1 |
| `oil:create_note` / `oil:atomic_replace` | Persist readout to vault | 1 |

> **Two PBI models.** SQL600 queries use model `c848b220-eaf2-42e0-b6d2-9633a6e39b37`. AIO queries use model `726c8fed-367a-4249-b685-e4e22ca82b3d`. Always pass the correct `semanticModelId`.

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
| "full readout", "executive readout", "SQL600 HLS" (generic) | **Full** | All queries + AIO cross-reference |
| "top accounts" | **Accounts** | Portfolio Snapshot + Top Accounts |
| "renewal watch", "renewals" | **Renewal** | Portfolio Snapshot + Renewal Exposure |
| "modernization", "mod pipeline" | **Modernization** | Portfolio Snapshot + Modernization Coverage |
| "trend", "trajectory", "month over month" | **Trend** | Portfolio Snapshot + ACR Trend + WoW Delta + AIO MoM |
| "ranking", "industry rank" | **Ranking** | Industry Ranking |
| "azure deep dive", "service breakdown", "workload mix" | **AIO Deep Dive** | Portfolio Snapshot + AIO cross-reference only |
| Specific account name/TPID | **Account Drill** | Single-account detail + AIO cross-reference |

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

### Step 2.5 — AIO Cross-Reference (1–2 PBI calls against AIO model)

> **Gate condition:** Run for **Full**, **Trend**, **AIO Deep Dive**, and **Account Drill** modes.
> Skip for **Accounts**, **Renewal**, **Modernization**, **Ranking** modes.

After Step 2, query the **Azure All-in-One** (MSA_AzureConsumption_Enterprise) model to enrich SQL600 accounts with full Azure consumption data. See [query-rules.md](query-rules.md) § QA0–QA3.

**Sequence:**
1. **Build TPID list** — Collect unique TPIDs from topAccounts + renewals + gapAccounts.
2. **AIO Batch 1** — Run QA0 (DimDate probe) + QA1 (account MoM ACR) + QA3 (budget attainment) in one `ExecuteQuery` call. Use QA0's result to resolve `<MONTH_COL>` for QA1.
3. **AIO Batch 2** — Run QA2 (service pillar × account ACR breakdown). If QA2 errors, fall back to QA2-ALT (pipeline-only breakdown).

| Query | What It Returns | JSON Field |
|---|---|---|
| **QA0** | DimDate column names | *(used to template QA1/QA2)* |
| **QA1** | Account × Month ACR time series | `aioAccountMoM[]` |
| **QA2/QA2-ALT** | Account × StrategicPillar × Month ACR (or pipeline) | `aioServiceBreakdown[]` |
| **QA3** | Account-level budget attainment | `aioBudgetAttainment[]` |

**SQL600 workload tagging:** After QA2 results arrive, tag each row with `SQLRelevant: true` if the `StrategicPillar` is `"Data & AI"` or `"Infra"`, or if the `SolutionPlay` matches `"Migrate & Modernize"` or `"Infra and Database Migration to Azure"`. See [schema-mapping.md](schema-mapping.md) § SQL600-Relevant Service Mapping.

### Step 3 — Synthesize Executive Readout

Assemble the data into the narrative structure defined in [output-template.md](output-template.md). Key synthesis rules:

1. **Lead with the headline number** — ACR LCM + MoM trajectory direction (↑/↓/→)
2. **Industry ranking** — State HLS's actual rank and how it compares to the SQL600 average on pipeline penetration and annualized growth. Report the position neutrally (ahead of / in line with / behind the average). Do NOT inject tone or reuse prior framings ("laggard", "correcting the narrative", "finally outperforming"). Let the numbers carry the message.
3. **Correlate supporting signals** — When a metric stands out (high/low rank, large WoW move, sharp MoM change, gap-account concentration), look across sections for 1–2 correlated data points that reinforce or complicate the picture (e.g., committed pipe vs. renewal exposure, mod pipeline coverage vs. factory attach, top-account concentration vs. gap accounts). Surface the correlation as an observation, not a causal claim.
4. **DBC framing** — Frame pipeline and modernization through Database Compete lens
4. **GCP competitive** — Call out gap accounts (no pipeline) as GCP leakage risk
5. **Renewal urgency** — Flag Q3/Q4 renewal accounts with SQL Cores and current pipeline coverage
6. **WoW delta** — Show Realized ACR + Baseline + Pipe week-over-week movement with $ and direction
7. **Top accounts** — Highlight 5–7 accounts by ACR, growth trajectory, or risk, and include a concrete recommended SQL modernization next step for each (pre-computed by `generate-next-steps.js` using GitHub Models API)
8. **AI-forward modernization insight** — Surface a portfolio-level insight connecting modernization execution to downstream AI enablement readiness (pre-computed by `generate-next-steps.js`)
9. **Azure consumption deep dive (AIO)** — When AIO data is available, present:
   - **Account MoM heatmap**: Show ACR progression across months for top accounts. Highlight MoM direction (↑/↓/→) and flag accounts with declining trajectories
   - **Service pillar mix**: For each account, show the ACR split by Azure strategic pillar (Data & AI, Infra, etc.). **Highlight SQL600-relevant pillars** (Data & AI, Infra) to show what percentage of each account's Azure spend is on SQL-adjacent services
   - **Budget attainment overlay**: Flag accounts below 80% budget attainment — these need pipeline acceleration
   - **Cross-model correlation**: Where the SQL600 model shows zero committed pipeline but AIO shows active ACR, note the disconnect (account is consuming but not investing in modernization pipeline)

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
3. Enrich with MSX `AccountId` (required for clickable deep links):
   `node scripts/helpers/enrich-sql600-accounts.js /tmp/sql600-data-<YYYY-MM-DD>.json`
4. Generate LLM-backed recommended next steps and AI-enablement outlook (parallel, uses GitHub Models API):
   `node scripts/helpers/generate-next-steps.js /tmp/sql600-data-<YYYY-MM-DD>.json`
   - Uses `gpt-4.1-mini` by default (cheap/fast). Override with `--model <name>`.
   - Runs account-level prompts in parallel (`--concurrency 8` default).
   - Adds `NextStep` to each account row and `_aiInsight.modernizationOutlook` to the JSON.
   - Use `--dry-run` to preview without API calls.
5. Run: `node scripts/helpers/generate-sql600-report.js /tmp/sql600-data-<YYYY-MM-DD>.json`
6. Output lands in the resolved artifact directory per `shared-patterns.instructions.md` § Artifact Output Directory (default filename: `sql600-hls-readout-<YYYY-MM-DD>.html`)
7. Open in browser for preview; printable to PDF via Cmd+P

> **AIO data in JSON:** If Step 2.5 ran, the JSON file should include `aioAccountMoM`, `aioServiceBreakdown`, and `aioBudgetAttainment` arrays. The HTML generator renders these as an "Azure Consumption Deep Dive" section with a MoM heatmap, service pillar breakdown, and budget attainment overlay. If the AIO arrays are missing or empty, the section is omitted gracefully.

**JSON input schema** for `generate-sql600-report.js`:
```json
{
  "generated": "YYYY-MM-DD",
  "snapshot": { "ACR_LCM": number, "ACR_YoY_Pct": "string", "AnnualizedGrowth": number, "PipeCommitted": number, "PipeUncommitted": number, "PipeQualified": number, "QualifiedOpps": number, "TotalOpps": number, "ModernizationOpps": number, "PipelinePenetration": "string", "SQLTotalTAM": number, "SQLCores": number, "AcctsWithModPipe": number, "AcctsWithoutModPipe": number, "FactoryAttach": "string", "WoW_Change": number, "AccountCount": number },
  "ranking": [{ "Industry": "string", "ACR_LCM": number, "AccountCount": number }],
  "verticals": [{ "Vertical": "string", "AccountCount": number, "ACR_LCM": number, "PipeCommitted": number, "PipeUncommitted": number, "AnnualizedGrowth": number, "ModOpps": number }],
  "trend": [{ "FiscalMonth": "YYYY-MM-DD", "FiscalQuarter": "string", "ACR": number }],
  "topAccounts": [{ "TopParent": "string", "TPID": number, "AccountId": "guid", "Vertical": "string", "Segment": "string", "ACR_LCM": number, "PipeCommitted": number|null, "PipeUncommitted": number|null, "AnnualizedGrowth": number, "QualifiedOpps": number|null, "TotalOpps": number|null, "SQLCores": number|null, "NextStep": "string (from generate-next-steps.js)" }],
  "renewals": [{ "TopParent": "string", "TPID": number, "AccountId": "guid", "Category": "string", "RenewalQuarter": "string|null", "SQLCores": number, "ArcEnabled": "Yes|No", "ACR_LCM": number|null, "PipeCommitted": number|null, "NextStep": "string (from generate-next-steps.js)" }],
  "gapAccounts": [{ "TopParent": "string", "TPID": number, "AccountId": "guid", "Vertical": "string", "ACR_LCM": number|null, "PipeUncommitted": number|null, "SQLCores": number|null, "NextStep": "string (from generate-next-steps.js)" }],
  "_aiInsight": { "modernizationOutlook": "string (from generate-next-steps.js)" },
  "aioAccountMoM": [{ "TPID": number, "Account": "string", "FiscalMonth": "string", "ACR": number }],
  "aioServiceBreakdown": [{ "TPID": number, "Account": "string", "StrategicPillar": "string", "SolutionPlay": "string|null", "ACR": number|null, "PipelineACR": number|null, "SQLRelevant": boolean }],
  "aioBudgetAttainment": [{ "TPID": number, "Account": "string", "ACR_YTD": number, "ACR_LCM": number, "BudgetAttainPct": number|null }]
}
```

> **`AccountId` is REQUIRED** on every account-level row in `topAccounts`, `renewals`, and `gapAccounts`. The HTML generator builds MSX deep links as `main.aspx?etn=account&id=<AccountId>&pagetype=entityrecord` — this is the only URL shape MSX reliably routes to a specific record. TPID/name-based quick-find URLs silently land on the user's "My Active Accounts" home view and are intentionally NOT emitted.
>
> PBI does not project `AccountId`. The enrichment helper [`scripts/helpers/enrich-sql600-accounts.js`](../../../scripts/helpers/enrich-sql600-accounts.js) resolves each `TopParent` → MSX top-parent account GUID via a curated map (maintained from Dynamics queries with `_parentaccountid_value eq null`). Run it before `generate-sql600-report.js`. If any row is unmapped, the helper prints it to stdout — add the new top-parent to the map before regenerating. TPID is still useful for display and must be preserved when flattening PBI results.

**Narrative override.** When a markdown readout file matching the date exists at `.copilot/docs/sql600-hls-readout-<date>.md` or `$OBSIDIAN_VAULT_PATH/Daily/SQL600-HLS/sql600-hls-readout-<date>.md`, the generator auto-discovers it and extracts the blockquote narratives under each `##` section (Headline, ACR Trajectory, Vertical Breakdown, Industry Ranking, Top Accounts, Renewal Watch, Modernization, GCP Leakage) plus the Key Takeaways bullet list. These replace the hardcoded prose in the HTML. Pass `--narrative <path>` to override auto-discovery.

---

## Decision Logic

| Situation | Action |
|---|---|
| User asks for "SQL600" without "HLS" qualifier | Check if they mean all SQL600 or HLS specifically. If context suggests HLS (e.g., mentions Patty, DBC, healthcare), proceed with HLS scope. Otherwise ask. |
| ACR trend is declining MoM | Flag prominently. Include "⚠️ Declining trajectory" in headline. Check if pipeline coverage compensates. |
| HLS industry rank changes from prior readout | Report the new rank accurately and note the delta from the previous position. Do not editorialize — state the direction and let the reader interpret. |
| Specific account has zero pipeline and high SQL cores | Tag as "🔴 GCP LEAKAGE RISK" — high SQL footprint with no modernization pipeline = competitive vulnerability. |
| Renewal in current quarter with no committed pipeline | Tag as "🔴 RENEWAL AT RISK" — immediate action needed. |
| Factory attach rate is below 15% | Flag as modernization execution gap — factory resources not being leveraged. |
| WoW change is significantly negative (> $1M decline) | Flag as "⚠️ Week-over-week decline" with $ amount. |
| AIO shows declining MoM ACR for a top account | Flag in the heatmap with ↓ arrow. Cross-reference with SQL600 pipeline — if committed pipeline is thin, double-flag. |
| AIO budget attainment < 80% for an account | Flag as "⚠️ Below target" in the budget overlay. Correlate with pipeline coverage. |
| AIO service breakdown shows < 20% Data & AI for SQL600 account | Note: "SQL-adjacent spend is low relative to total Azure spend — modernization upside exists." |
| SQL600 shows zero committed pipe but AIO shows active ACR | Note disconnect: "Account consuming Azure actively but not investing in SQL modernization pipeline." |
| AIO model auth fails but SQL600 succeeds | Proceed with SQL600-only readout. Note "AIO cross-reference unavailable — run `az login` to refresh PBI auth for the AIO model." |

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
