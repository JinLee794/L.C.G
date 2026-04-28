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

> **\u26a0\ufe0f Max 4 DAX queries per `ExecuteQuery` call.** Exceeding this limit returns error `-32602`. All batch sizes below respect this constraint.

| Tool | Purpose | Expected Calls |
|---|---|---|
| `powerbi-remote:ExecuteQuery` | SQL600 aggregate queries — Call 1A (Q1+Q3+Q4+Q4B) | **1** |
| `powerbi-remote:ExecuteQuery` | SQL600 aggregate queries — Call 1B (Q2+Q10-DETAIL) | **1** |
| `powerbi-remote:ExecuteQuery` | SQL600 detail queries (Q5+Q6+Q8, optionally Q7/Q9) | **1** (parallel with AIO) |
| `powerbi-remote:ExecuteQuery` | AIO cross-reference (QA-BULK+QA2+QA3-ATTR, 3 queries) | **1** (parallel with Step 2) |
| `oil:get_note_metadata` | Check vault note existence before write | 1 |
| `oil:create_note` / `oil:atomic_replace` | Persist readout to vault | 1 |

> **Two PBI models.** SQL600 queries (Q1–Q10-DETAIL) use model `c848b220-eaf2-42e0-b6d2-9633a6e39b37`. AIO queries use model `726c8fed-367a-4249-b685-e4e22ca82b3d`. Always pass the correct `semanticModelId`.

### Removed from Runtime

| Tool | Why Removed |
|---|---|
| `powerbi-remote:GetSemanticModelSchema` | **NEVER call.** Schema fully mapped in [schema-mapping.md](schema-mapping.md). The SQL600 model's schema response is too large for the MCP tool — always fails with `MPC -32603` parsing error at `verifiedAnswers[0].Bindings.Values`. |
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

### Step 1 — Combined Portfolio Snapshot + Industry Ranking (2 PBI calls)

> **⚠️ Max 4 DAX queries per `ExecuteQuery` call.** The PBI remote tool enforces a hard limit of 4 `daxQueries` per call. Split Step 1's 6 queries into two calls.

**Call 1A** (4 queries):
1. **Q1 — Portfolio KPI Snapshot**: ACR (LCM), Pipeline (Committed/Uncommitted/Qualified), Qualified Opps, Total Opps, Modernization Opps, SQL TAM, SQL Cores, WoW Change, Accounts With/Without Mod Pipeline, Factory Attach %
2. **Q3 — Vertical Breakdown**: Health Payor / Provider / Pharma / MedTech with account counts, ACR, committed pipeline
3. **Q4 — ACR Monthly Trend**: FY26 month-by-month ACR for HLS SQL600 — shows trajectory
4. **Q4B — Vertical Monthly Trend**: FY26 monthly ACR by Vertical (closed months only). Store as `verticalTrend[]`.

**Call 1B** (2 queries):
5. **Q2 — Industry Ranking**: All SQL600 industries by ACR LCM — validates HLS position
6. **Q10-DETAIL — Per-Account ACR by Strategic Pillar** ⭐: Consumption ACR broken down by strategic pillar per account. **Primary source for service pillar mix and SQL-adjacent % in the report.** Store results as `sql600PillarBreakdown[]` in the data JSON.

If any query fails with auth error → stop, show auth recovery message.

### Steps 2 + 2.5 — Detail Queries + AIO Cross-Reference (parallel if AIO opted in)

> **⚠️ Parallelization.** Steps 2 and 2.5 target **different PBI models** and have **no data dependency on each other** — both only need the TPID list, which is available from Q10-DETAIL (Step 1). If the user opted in to AIO, run them as **parallel tool calls** (two `ExecuteQuery` calls issued in the same turn). If the user declined AIO, run Step 2 only.

#### Step 2 — Detail Queries (1–2 PBI calls, conditional by mode)

Based on readout mode from Step 0, execute detail queries from [query-rules.md](query-rules.md) § Q5–Q9. Use `daxQueries` array to batch up to 4 per call.

| Query | Gate Condition | What It Returns |
|---|---|---|
| **Q5 — Top 15 Accounts** | Always (Full, Accounts) | TPID, TopParent, Vertical, Segment, FieldAreaShorter, ACR LCM, Pipeline |
| **Q6 — Renewal Exposure** | Full, Renewal | SQL500 Target List accounts with renewal quarters, SQL Cores, Arc status |
| **Q7 — Modernization Pipeline** | Full, Modernization | Accounts with mod pipeline, factory attach, qualified mod pipe without factory |
| **Q8 — Gap Accounts** | Full | Accounts in SQL600 HLS with zero committed pipeline (GCP leakage risk) |
| **Q9 — Top Opportunities** | Full, Account Drill | Opportunity detail with stage, owner, commitment, pipeline ACR |

#### Step 2.5 — AIO Cross-Reference (1 PBI call against AIO model) — OPTIONAL

> **Gate condition:** Eligible for **Full**, **Trend**, **AIO Deep Dive**, and **Account Drill** modes.
> Skip for **Accounts**, **Renewal**, **Modernization**, **Ranking** modes.
>
> **User opt-in required.** Before running AIO queries, ask the user:
>
> > "Include Azure All-in-One (AIO) cross-reference? Note: this model has RLS and security restrictions that may return incomplete data for some accounts. The SQL600 report will still render correctly without it — Q10-DETAIL already covers service pillar mix. Include AIO? (y/n)"
>
> If the user declines (or does not respond), **skip Step 2.5 entirely** and proceed to Step 3. The report renders all core sections without AIO data.

Query the **Azure All-in-One** (MSA_AzureConsumption_Enterprise) model to enrich SQL600 accounts with full Azure consumption data and propensity signals. See [query-rules.md](query-rules.md) § QA-BULK + QA2 + QA3-ATTR.

> **⚠️ Per-account pillar ACR is already covered by Q10-DETAIL** (Step 1). AIO QA2 is now **optional enrichment** — it can provide sub-pillar granularity and solution play detail, but is NOT required for the service pillar mix chart. If QA2 returns empty, duplicated, or pipeline-only data, the report still renders correctly using Q10-DETAIL data in `sql600PillarBreakdown`.

**Sequence:**
1. **Build TPID list from Q10-DETAIL** — Extract unique TPIDs from `sql600PillarBreakdown[]` (Q10-DETAIL results from Step 1). This covers all 43 HLS SQL600 accounts — no need to wait for Q5/Q6/Q8. Record the count (expected: ~43).
2. **Single AIO call** — Send QA-BULK + QA2 + QA3-ATTR in one `ExecuteQuery` call using `daxQueries` array (3 queries — within the 4-query limit). `MonthStartDate` is hardcoded (cached in schema-mapping.md) — no schema probe needed.
3. **Fallback** — If QA2 errors inside the batch, retry with QA-BULK + QA3-ATTR (drop QA2 only, 2 queries). Do NOT fall back to QA2-PIPE — pipeline-only pillar data is misleading (tiny values, incomplete coverage). Q10-DETAIL provides the pillar breakdown.
4. **Save + normalize + merge** — This step is **mandatory** when generating an HTML report (Step 4). Save the raw PBI response, normalize, and merge immediately:
   ```bash
   # Save raw AIO response to temp file (agent writes the JSON)
   # Then normalize and merge into the SQL600 data file:
   node scripts/helpers/normalize-aio.js <aio-raw-file> --merge <sql600-data-file> --quarters 4 --top 30
   ```
   The `--quarters 4` flag keeps only the last 4 quarters of MoM data. The `--top 30` flag keeps only the top 30 accounts by total ACR, filtering all arrays (MoM, budget, breakdown, attributes) to that set. This keeps the exec report focused.

   > **⚠️ Do NOT manually read the raw PBI response.** The `normalize-aio.js` script accepts the raw MCP `ExecuteQuery` response directly (including the `{ executionResult: { Tables: [...] } }` shape). Save the response to a file and pipe it through the script — never read it line-by-line in chat.

   Do NOT defer this to later. The merge must happen **before** `enrich-sql600-accounts.js` and `generate-sql600-report.js` run.
5. **Validate coverage** — After `normalize-aio.js` prints its summary, check:
   - **Account coverage**: Compare returned unique TPIDs against the TPID list from step 1. If < 50% of TPIDs returned data, note "AIO coverage limited to N of M accounts — some TPIDs may not exist in the AIO model" in the output.
   - **Budget data**: If all `BudgetAttainPct` values are 0 or null, note "Budget attainment data unavailable in current AIO refresh" — the generator handles this gracefully (shows "No data" instead of false red flags).
   - **Service breakdown**: If `pillarOutputRows` is 0 despite QA2 running, note "AIO service pillar breakdown unavailable." The generator omits the pillar bar chart section when data is empty.
   - **Account attributes**: If `aioAccountAttributes` is empty, note "Account propensity attributes unavailable." The report and LLM steps handle missing attributes gracefully.

| Query | What It Returns | JSON Field |
|---|---|---|
| **QA-BULK** | Account × Month ACR + budget attainment (merged QA1+QA3) | `aioAccountMoM[]` + `aioBudgetAttainment[]` (client-side split) |
| **QA2/QA2-ALT** | Account × StrategicPillar × Month ACR (or pipeline) | `aioServiceBreakdown[]` |
| **QA3-ATTR** | Account propensity flags (OpenAI, PTU, migration, ESI, GHCP) | `aioAccountAttributes[]` |

> **⚠️ CRITICAL — Do not skip the merge.** The most common AIO data gap is the agent running the queries successfully but failing to save the raw response and run `normalize-aio.js --merge`. The HTML report cannot render AIO sections without the merged arrays. If you ran the AIO queries, you MUST persist the response and merge before proceeding.

**SQL600 workload tagging:** After QA2 results arrive, tag each row with `SQLRelevant: true` if the `StrategicPillar` is `"Data & AI"` or `"Infra"`, or if the `SolutionPlay` matches `"Migrate & Modernize"` or `"Infra and Database Migration to Azure"`. See [schema-mapping.md](schema-mapping.md) § SQL600-Relevant Service Mapping.

### Step 3 — Synthesize Executive Readout

Assemble the data into the narrative structure defined in [output-template.md](output-template.md). The readout follows a **cover page → detail drill** pattern: the Executive Summary gives the full picture in two minutes, then detail sections provide the evidence.

#### Executive Summary (cover page)

Write the Executive Summary **first** — it is the primary deliverable. A reader who stops after the summary should still understand:
- Where HLS stands (ACR, rank, growth trajectory)
- Pipeline health and concentration risk
- Renewal exposure and the accounts that matter most
- The key execution lever (factory attach / mod pipeline)
- Whether momentum is sustainable

Derive every claim from this readout's data. Do NOT reuse prior-run framings. Recompute positions and comparisons each time.

#### Detail section synthesis rules

1. **Headline** — ACR LCM + MoM direction + annualized growth + WoW delta + pipeline penetration. One-line DBC narrative comparing HLS to SQL600 average.
2. **KPI Snapshot** — Compact inline callouts (not a table). Group related metrics on one line with `·` separators.
3. **Industry ranking** — State HLS's actual rank. Report position neutrally. No injected tone or recycled framings.
4. **Correlate supporting signals** — When a metric stands out, look across sections for 1–2 correlated data points. Surface as observation, not causal claim.
5. **DBC framing** — Frame pipeline and modernization through Database Compete lens.
6. **GCP competitive** — Call out gap accounts (no pipeline) as GCP leakage risk.
7. **Renewal urgency** — Flag Q3/Q4 renewal accounts with SQL Cores, pipeline coverage, and **status badges** (🔴 AT RISK / ⚠️ NO PIPE / ✅ covered).
8. **WoW delta** — Show week-over-week movement with $ and direction.
9. **Top accounts** — Streamlined table (omit TPID column) with concrete recommended SQL modernization next step per account (pre-computed by `generate-next-steps.js`).
10. **AI-forward modernization insight** — Portfolio-level insight connecting modernization to downstream AI enablement (pre-computed by `generate-next-steps.js`).
11. **Azure consumption deep dive (AIO)** — When AIO data is available, present:
    - **Account MoM heatmap**: ACR progression across months, MoM direction, declining trajectory flags
    - **Service pillar mix**: ACR split by strategic pillar, SQL-adjacent % highlighted
    - **Budget attainment overlay**: Flag accounts below 80% attainment with SQL600 pipeline context
    - **Cross-model correlation**: Where SQL600 shows zero pipeline but AIO shows active ACR, note the disconnect

### Step 4 — Present & Persist

1. Present the formatted readout to the user per [output-template.md](output-template.md)
2. Persist to vault using standard sequence:
   - `oil:get_note_metadata` → check if today's note exists
   - If exists → `oil:atomic_replace` with `mtime_ms`
   - If not → `oil:create_note`

#### HTML Dashboard Output (optional)

When the user says "html report", "dashboard", "rich report", or "exec report":

1. Collect all PBI query results into a single JSON object matching the schema below
2. Write JSON to `.copilot/docs/sql600-data-<YYYY-MM-DD>.json`
3. **AIO merge** — If Step 2.5 ran, the AIO data should already be merged (Step 2.5 §4). If not, run it now:
   `node scripts/helpers/normalize-aio.js .copilot/docs/aio-raw-<YYYY-MM-DD>.json --merge .copilot/docs/sql600-data-<YYYY-MM-DD>.json --quarters 4 --top 30 --check`
   The `--check` flag validates TPID coverage against the SQL600 data and prints warnings for missing TPIDs, empty budget data, and pillar granularity. All three AIO array counts must be > 0.
4. Enrich with MSX `AccountId` (required for clickable deep links):
   `node scripts/helpers/enrich-sql600-accounts.js .copilot/docs/sql600-data-<YYYY-MM-DD>.json`
5. Generate LLM-backed recommended next steps and AI-enablement outlook (parallel, uses GitHub Models API):
   `node scripts/helpers/generate-next-steps.js .copilot/docs/sql600-data-<YYYY-MM-DD>.json`
   - Uses `gpt-4.1-mini` by default (cheap/fast). Override with `--model <name>`.
   - Runs account-level prompts in parallel (`--concurrency 8` default).
   - Adds `NextStep` to each account row and `_aiInsight.modernizationOutlook` to the JSON.
   - Use `--dry-run` to preview without API calls.
6. Run: `node scripts/helpers/generate-sql600-report.js .copilot/docs/sql600-data-<YYYY-MM-DD>.json`
7. Output lands in the resolved artifact directory per `shared-patterns.instructions.md` § Artifact Output Directory (default filename: `sql600-hls-readout-<YYYY-MM-DD>.html`)
8. Open in browser for preview; printable to PDF via Cmd+P

> **Theme picker baked in.** Every generated report includes an inline palette switcher at the bottom of the page with 12 themes (default purple, red/orange/yellow/green/blue/indigo/violet, gold, pink, rainbow, light) plus a 🎉 PARTY MODE 🎉 button that flashes, cycles colors, rains confetti, and shakes the header. Selection persists per-browser via `localStorage` (`sql600-palette`). Switcher is hidden in print and respects `prefers-reduced-motion`. The header gradient and corner glow re-theme with the chosen palette via `--header-gradient` / `--header-glow` CSS variables.

> **AIO data in JSON:** If Step 2.5 ran, the JSON file should include `aioAccountMoM`, `aioServiceBreakdown`, and `aioBudgetAttainment` arrays. The HTML generator renders these as an "Azure Consumption Deep Dive" section with a MoM heatmap, service pillar breakdown, and budget attainment overlay. If the AIO arrays are missing or empty, the section is omitted gracefully.

**JSON input schema** for `generate-sql600-report.js`:

> **Note on computed fields:** `AnnualizedGrowth` and `PipelinePenetration` are no longer sourced from PBI (measures removed from model as of Apr 2026). `AnnualizedGrowth` is computed by the report generator from AIO `aioAccountMoM` data using `(latestClosedACR − June2025ACR) × 12`. `PipelinePenetration` is computed as `AcctsWithModPipe / AccountCount`. Both fields are `null` in the PBI query results and populated during report generation.

```json
{
  "generated": "YYYY-MM-DD",
  "snapshot": { "ACR_LCM": number, "ACR_YoY_Pct": "string", "AnnualizedGrowth": "number|null (computed from AIO)", "PipeCommitted": number, "PipeUncommitted": number, "PipeQualified": number, "QualifiedOpps": number, "TotalOpps": number, "ModernizationOpps": number, "PipelinePenetration": "number|null (computed)", "SQLTotalTAM": number, "SQLCores": number, "AcctsWithModPipe": number, "AcctsWithoutModPipe": number, "FactoryAttach": "string", "WoW_Change": number, "AccountCount": number },
  "ranking": [{ "Industry": "string", "ACR_LCM": number, "AccountCount": number }],
  "verticals": [{ "Vertical": "string", "AccountCount": number, "ACR_LCM": number, "PipeCommitted": number, "PipeUncommitted": number, "AnnualizedGrowth": "number|null (computed from AIO)", "ModOpps": number }],
  "trend": [{ "FiscalMonth": "YYYY-MM-DD", "FiscalQuarter": "string", "ACR": number, "IsClosed": boolean }],
  "verticalTrend": [{ "Vertical": "string", "FiscalMonth": "YYYY-MM-DD", "ACR": number }],
  "topAccounts": [{ "TopParent": "string", "TPID": number, "AccountId": "guid", "Vertical": "string", "Segment": "string", "ACR_LCM": number, "PipeCommitted": "number|null", "PipeUncommitted": "number|null", "AnnualizedGrowth": "number|null (computed from AIO)", "QualifiedOpps": "number|null", "TotalOpps": "number|null", "SQLCores": "number|null", "NextStep": "string (from generate-next-steps.js)" }],
  "renewals": [{ "TopParent": "string", "TPID": number, "AccountId": "guid", "Category": "string", "RenewalQuarter": "string|null", "SQLCores": number, "ArcEnabled": "Yes|No", "ACR_LCM": number|null, "PipeCommitted": number|null, "NextStep": "string (from generate-next-steps.js)" }],
  "gapAccounts": [{ "TopParent": "string", "TPID": number, "AccountId": "guid", "Vertical": "string", "ACR_LCM": number|null, "PipeUncommitted": number|null, "SQLCores": number|null, "NextStep": "string (from generate-next-steps.js)" }],
  "_aiInsight": { "modernizationOutlook": "string (from generate-next-steps.js)" },
  "aioAccountMoM": [{ "TPID": number, "Account": "string", "FiscalMonth": "string", "ACR": number }],
  "aioServiceBreakdown": [{ "TPID": number, "Account": "string", "StrategicPillar": "string", "SolutionPlay": "string|null", "PipelineACR": number|null, "SQLRelevant": boolean }],
  "aioBudgetAttainment": [{ "TPID": number, "Account": "string", "ACR_YTD": number, "ACR_LCM": number, "BudgetAttainPct": number|null }],
  "aioAccountAttributes": [{ "TPID": number, "ESI_Tier": "string|null", "HasOpenAI": "Y|N|null", "HasOpenAI_Pipe": "Y|N|null", "PTU_Target": "Y|N|null", "NetNewMigrationTarget": "Y|N|null", "LXP_Category": "string|null", "TrancheGrowthTarget": "Y|N|null", "500K_100K_Target": "string|null", "GHCP_200Plus": "Y|N|null", "GHCP_200Less": "Y|N|null" }]
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
| Account has `HasOpenAI = Y` but `HasOpenAI_Pipe = N` | Flag in detail: "Uses Azure OpenAI with no pipeline — AI expansion opportunity." Include in LLM context for next-step generation. |
| Account has `PTU_Target = Y` | Flag in detail: "PTU target account." Surfaces sizing engagement in recommended next steps. |
| Account has `NetNewMigrationTarget = Y` | Flag in detail: "Migration target." Strengthens migration-focused next-step recommendations. |
| Account has `500K_100K_Target` set | Flag in detail: "High-value target." Prioritize in recommendations. |
| Account has GHCP flags set | Flag in detail: "GHCP incentive eligible." Actionable for seller follow-up. |

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
