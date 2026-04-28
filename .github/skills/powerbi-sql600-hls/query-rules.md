# Query Rules — SQL600 HLS Executive Readout

All queries inherit the mandatory HLS scope filter from [schema-mapping.md](schema-mapping.md).

**Artifact ID:** `c848b220-eaf2-42e0-b6d2-9633a6e39b37`

---

## Scope Filter Convention

All queries use one of two patterns:

1. **SUMMARIZECOLUMNS** — for measure-based aggregation (ACR/Pipeline). Apply HLS filter as a FILTER argument:
   ```dax
   FILTER('2) Account',
       '2) Account'[SQL600 Account] = TRUE()
       && '2) Account'[Industry] = "Healthcare"
   )
   ```

2. **CALCULATETABLE** — for cross-table detail queries (SQL 500 Target List, etc.) where bidirectional relationships exist:
   ```dax
   CALCULATETABLE(
       ...,
       '2) Account'[SQL600 Account] = TRUE(),
       '2) Account'[Industry] = "Healthcare"
   )
   ```

---

## PBI Query Constraints

> **⚠️ Max 4 DAX queries per `ExecuteQuery` call.** The PBI remote tool enforces a hard limit of 4 queries in the `daxQueries` array. Any call with 5+ queries fails with `-32602`. Plan batches accordingly:
> - **Step 1 Call 1A:** Q1 + Q3 + Q4 + Q4B (4 queries)
> - **Step 1 Call 1B:** Q2 + Q10-DETAIL (2 queries)
> - **Step 2:** Q5 + Q6 + Q8 (3 queries) or Q5 + Q6 + Q7 + Q8 (4 queries)
> - **Step 2.5 AIO:** QA-BULK + QA2 + QA3-ATTR (3 queries)

## Aggregate Queries (run FIRST — Step 1)

### Q1 — Portfolio KPI Snapshot

**Purpose:** Single-row KPI summary for headline metrics. Run every time.

```dax
EVALUATE
SUMMARIZECOLUMNS(
    '2) Account'[Industry],
    FILTER('2) Account',
        '2) Account'[SQL600 Account] = TRUE()
        && '2) Account'[Industry] = "Healthcare"
    ),
    "ACR_LCM", [ACR (Last Closed Month)],
    "ACR_YoY_Pct", [ACR Change Δ% - YTD YoY],
    "PipeCommitted", [Pipeline ACR (Committed excl Blocked)],
    "PipeUncommitted", [Pipeline ACR (Uncommitted)],
    "PipeQualified", [Pipeline ACR (Qualified)],
    "PipeUnqualified", [Pipeline ACR (Unqualified)],
    "QualifiedOpps", [# of Qualified Opportunities],
    "TotalOpps", [# of Opportunities],
    "ModernizationOpps", [Modernization Opportunities],
    "SQLTotalTAM", [Annualized SQL TAM],
    "SQLCores", [Total SQL Cores],
    "AcctsWithModPipe", [Accounts With Modernization Pipeline],
    "AcctsWithoutModPipe", [Accounts Without Modernization Pipeline],
    "FactoryAttach", [Factory Attach to Modernization Opportunities],
    "RealizedPlusBasePlusPipe", [Realized ACR + Baseline + Pipe],
    "RealizedPlusBasePlusPipe_LW", [Realized ACR + Baseline + Pipe (Last Week Snapshot)],
    "WoW_Change", [Realized ACR + Baseline + Pipe WoW Change $]
)
```

### Q2 — Industry Ranking

**Purpose:** ACR broken down by Azure strategic pillar for each SQL600 account. Shows WHERE consumption is happening (Data & AI, Infra, Security, Modern Work, App Innovation, etc.) — critical for identifying SQL-adjacent workloads and migration readiness.

**Artifact ID:** `726c8fed-367a-4249-b685-e4e22ca82b3d`

| Parameter | Value |
|---|---|
| Filter | Current FY, Curated view, TPID list from SQL600 |
| Sort | Account ASC, ACR DESC |

```dax
EVALUATE
SUMMARIZECOLUMNS(
    'DimCustomer'[TPID],
    'DimCustomer'[TPAccountName],
    'DimDate'[<MONTH_COL>],
    'F_AzureConsumptionPipe'[StrategicPillar],
    TREATAS({<TPID_LIST>}, 'DimCustomer'[TPID]),
    FILTER('DimDate', 'DimDate'[IsAzureClosedAndCurrentOpen] = "Y"),
    'DimViewType'[ViewType] = "Curated",
    "ACR", 'M_ACR'[$ ACR]
)
ORDER BY 'DimCustomer'[TPAccountName] ASC, [ACR] DESC
```

> **Note:** If RANKX produces all 1s (known behavior in some DAX contexts), sort by ACR_LCM DESC and assign ordinal position in the narrative instead.

### Q3 — Vertical Breakdown

**Purpose:** Performance by Health Payor / Provider / Pharma / MedTech. Run every time.

```dax
EVALUATE
SUMMARIZECOLUMNS(
    '2) Account'[Vertical],
    FILTER('2) Account',
        '2) Account'[SQL600 Account] = TRUE()
        && '2) Account'[Industry] = "Healthcare"
    ),
    "AccountCount", COUNTROWS('2) Account'),
    "ACR_LCM", [ACR (Last Closed Month)],
    "PipeCommitted", [Pipeline ACR (Committed excl Blocked)],
    "PipeUncommitted", [Pipeline ACR (Uncommitted)],
    "ModOpps", [Modernization Opportunities]
)
ORDER BY [ACR_LCM] DESC
```

### Q4 — ACR Monthly Trend (FY26)

**Purpose:** Month-over-month ACR trajectory for HLS SQL600. Shows momentum. Run every time. Includes the current open month as a partial (MTD) data point.

```dax
EVALUATE
SUMMARIZECOLUMNS(
    '1) Calendar'[Fiscal Month],
    '1) Calendar'[IsClosed],
    FILTER('2) Account',
        '2) Account'[SQL600 Account] = TRUE()
        && '2) Account'[Industry] = "Healthcare"
    ),
    FILTER('1) Calendar',
        '1) Calendar'[Fiscal Year] = "FY26"
        && ('1) Calendar'[IsClosed] = TRUE() || '1) Calendar'[YTD Flag] = "YTD")
    ),
    "ACR", [ACR]
)
ORDER BY '1) Calendar'[Fiscal Month] ASC
```

> **Why `[ACR]` instead of `[ACR (Total By Closed Month)]`?** The latter returns BLANK for the current open month. `[ACR]` includes the current open month's MTD value. `IsClosed` is projected so the report generator can visually distinguish the partial month (dashed line, hollow dot).

### Q4B — Vertical Monthly ACR Trend (FY26)

**Purpose:** Monthly ACR by Vertical for HLS SQL600. Used by `generate-sql600-report.js` to provide baseline data for vertical trend charts. Run every time alongside Q4.

```dax
EVALUATE
SUMMARIZECOLUMNS(
    '2) Account'[Vertical],
    '1) Calendar'[Fiscal Month],
    '1) Calendar'[IsClosed],
    FILTER('2) Account',
        '2) Account'[SQL600 Account] = TRUE()
        && '2) Account'[Industry] = "Healthcare"
    ),
    FILTER('1) Calendar',
        '1) Calendar'[Fiscal Year] = "FY26"
        && '1) Calendar'[IsClosed] = TRUE()
    ),
    "ACR", [ACR]
)
ORDER BY '2) Account'[Vertical] ASC, '1) Calendar'[Fiscal Month] ASC
```

> **Only closed months.** Unlike Q4 which includes the open MTD month for the trajectory chart, Q4B restricts to closed months so the annualized growth calculation uses complete data points.

---

## Detail Queries (Step 2 — conditional by readout mode)

### Q5 — Top 15 Accounts by ACR

**Purpose:** Account-level detail sorted by ACR. Always include in Full and Accounts modes.

| Parameter | Value |
|---|---|
| Sort | ACR (Last Closed Month) DESC |
| Limit | Top 15 |

```dax
EVALUATE
TOPN(15,
    SUMMARIZECOLUMNS(
        '2) Account'[TPID],
        '2) Account'[TopParent],
        '2) Account'[Vertical],
        '2) Account'[Segment],
        '2) Account'[FieldAreaShorter],
        '2) Account'[FieldAreaDetail],
        FILTER('2) Account',
            '2) Account'[SQL600 Account] = TRUE()
            && '2) Account'[Industry] = "Healthcare"
        ),
        "ACR_LCM", [ACR (Last Closed Month)],
        "PipeCommitted", [Pipeline ACR (Committed excl Blocked)],
        "PipeUncommitted", [Pipeline ACR (Uncommitted)],
        "QualifiedOpps", [# of Qualified Opportunities],
        "TotalOpps", [# of Opportunities]
    ),
    [ACR_LCM], DESC
)
```

### Q6 — Renewal Exposure

**Purpose:** SQL600 HLS accounts with renewal quarters, SQL cores, Arc enablement. Critical for Q3/Q4 window. Include in Full and Renewal modes.

| Parameter | Value |
|---|---|
| Filter | SQL600 HLS via Account table (bidirectional to SQL 500 Target List) |
| Sort | Total SQL Cores DESC |
| Limit | All HLS accounts in SQL 500 Target List |

```dax
EVALUATE
CALCULATETABLE(
    ADDCOLUMNS(
        'SQL 500 Target List',
        "ACR_LCM", [ACR (Last Closed Month)],
        "PipeCommitted", [Pipeline ACR (Committed excl Blocked)]
    ),
    '2) Account'[SQL600 Account] = TRUE(),
    '2) Account'[Industry] = "Healthcare"
)
ORDER BY 'SQL 500 Target List'[Total SQL Cores] DESC
```

### Q7 — Modernization Pipeline Detail

**Purpose:** Modernization-flagged opportunities with factory case status. Include in Full and Modernization modes.

| Parameter | Value |
|---|---|
| Filter | HLS SQL600 + Modernization Workload Flag = 1 |
| Sort | PipelineACR DESC |
| Limit | Top 20 |

```dax
EVALUATE
TOPN(20,
    SUMMARIZECOLUMNS(
        '2) Account'[TPID],
        '2) Account'[TopParent],
        '✽ Pipeline'[OpportunityID],
        '✽ Pipeline'[OpportunityName],
        '✽ Pipeline'[OpportunityLink],
        '✽ Pipeline'[SalesStageShort],
        '✽ Pipeline'[OpportunityOwner],
        '✽ Pipeline'[MilestoneWorkload],
        '✽ Pipeline'[QualifiedFlag],
        '✽ Pipeline'[MilestoneCommitment],
        FILTER('2) Account',
            '2) Account'[SQL600 Account] = TRUE()
            && '2) Account'[Industry] = "Healthcare"
        ),
        FILTER('✽ Pipeline', '✽ Pipeline'[Modernization Workload Flag] = 1),
        "PipeACR", [Pipeline ACR (Qualified)]
    ),
    [PipeACR], DESC
)
```

### Q8 — Gap Accounts (Zero Committed Pipeline)

**Purpose:** HLS SQL600 accounts with NO committed pipeline — GCP leakage risk signal. Include in Full mode.

| Parameter | Value |
|---|---|
| Filter | HLS SQL600 accounts where Pipeline ACR (Committed excl Blocked) is BLANK or 0 |
| Sort | ACR LCM DESC |

```dax
EVALUATE
FILTER(
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
        "PipeUncommitted", [Pipeline ACR (Uncommitted)],
        "SQLCores", [Total SQL Cores]
    ),
    ISBLANK([PipeCommitted]) || [PipeCommitted] = 0
)
```

### Q9 — Top Opportunities (Detail Drill)

**Purpose:** Opportunity-level detail for deep dives. Include in Full and Account Drill modes.

| Parameter | Value |
|---|---|
| Sort | Pipeline ACR (Qualified) DESC |
| Limit | Top 20 |
| Optional filter | Specific TPID for account drill |

```dax
EVALUATE
TOPN(20,
    SUMMARIZECOLUMNS(
        '2) Account'[TPID],
        '2) Account'[TopParent],
        '✽ Pipeline'[OpportunityID],
        '✽ Pipeline'[OpportunityName],
        '✽ Pipeline'[OpportunityLink],
        '✽ Pipeline'[SalesStageShort],
        '✽ Pipeline'[OpportunityOwner],
        '✽ Pipeline'[DaysInSalesStage],
        '✽ Pipeline'[MilestoneCommitment],
        '✽ Pipeline'[QualifiedFlag],
        FILTER('2) Account',
            '2) Account'[SQL600 Account] = TRUE()
            && '2) Account'[Industry] = "Healthcare"
        ),
        "PipeACR_Qualified", [Pipeline ACR (Qualified)],
        "PipeACR_Committed", [Pipeline ACR (Committed excl Blocked)],
        "PipeACR_Uncommitted", [Pipeline ACR (Uncommitted)]
    ),
    [PipeACR_Qualified], DESC
)
```

#### Account Drill Variant

When user specifies a specific account (TPID), add to the FILTER:

```dax
-- Add to the FILTER on '2) Account':
&& '2) Account'[TPID] = <TPID>
```

### Q10 — ACR by Strategic Pillar (aggregate, optional)

**Purpose:** ACR breakdown by service/workload category across all HLS SQL600 accounts (aggregate — no per-account detail). Useful for portfolio-level service mix understanding.

| Parameter | Value |
|---|---|
| Filter | HLS SQL600 + FY26 |
| Sort | ACR DESC |

```dax
EVALUATE
SUMMARIZECOLUMNS(
    '3) Product'[StrategicPillar],
    FILTER('2) Account',
        '2) Account'[SQL600 Account] = TRUE()
        && '2) Account'[Industry] = "Healthcare"
    ),
    FILTER('1) Calendar', '1) Calendar'[Fiscal Year] = "FY26"),
    "ACR", [ACR (Total By Closed Month)]
)
ORDER BY [ACR] DESC
```

### Q10-DETAIL — Per-Account ACR by Strategic Pillar ⭐ PRIMARY

**Purpose:** Consumption ACR broken down by Azure strategic pillar **per account**. This is the **primary and most reliable** source for the service pillar mix / SQL-adjacent % in the report. Uses the SQL600 model's own `ACR` fact table and `'3) Product'[StrategicPillar]` dimension — a direct, verified relationship that avoids the cross-model scoping issues in the AIO model.

> **⚠️ Always use Q10-DETAIL over AIO QA2 for per-account pillar data.** The AIO model's `F_AzureConsumptionPipe[StrategicPillar]` + `M_ACR[$ ACR]` combination is fragile — `$ ACR` may not scope correctly by the pipeline table's `StrategicPillar` column (observed 4/28: duplication across pillar rows). The SQL600 model has a direct FK from the `ACR` fact to `'3) Product'[SubStrategicPillar]` → `StrategicPillar`, making this query inherently reliable.

| Parameter | Value |
|---|---|
| Model | SQL600 (`c848b220-eaf2-42e0-b6d2-9633a6e39b37`) — **same model as Q1–Q9** |
| Filter | HLS SQL600 + FY26 |
| Sort | Account ASC, ACR DESC |
| Expected rows | ~100–250 (43 accounts × ~3–6 pillars each) |

```dax
EVALUATE
SUMMARIZECOLUMNS(
    '2) Account'[TPID],
    '2) Account'[TopParent],
    '3) Product'[StrategicPillar],
    FILTER('2) Account',
        '2) Account'[SQL600 Account] = TRUE()
        && '2) Account'[Industry] = "Healthcare"
    ),
    FILTER('1) Calendar', '1) Calendar'[Fiscal Year] = "FY26"),
    "ACR", [ACR (Total By Closed Month)]
)
ORDER BY '2) Account'[TopParent] ASC, [ACR] DESC
```

> **Validation:** Per-account pillar totals should be in the same order of magnitude as QA-BULK monthly ACR × number of closed months (YTD). Expect diverse SQL-adjacent ratios (16%–61%) across accounts.

> **Output mapping:** Store Q10-DETAIL results in the data JSON as `sql600PillarBreakdown[]`. Each row maps to:
> ```json
> { "TPID": 641450, "Account": "ABBOTT LABORATORIES", "StrategicPillar": "Data & AI", "ACR": 1234567 }
> ```
> `generate-sql600-report.js` prefers `sql600PillarBreakdown` over `aioServiceBreakdown` when both are present.

> **Batch with Q2 in Call 1B:** Q10-DETAIL uses the same SQL600 model as Q1–Q9. Pair it with Q2 in Step 1 Call 1B (2 queries). Do not combine with Call 1A which already has 4 queries.

---

## Azure All-in-One (AIO) Cross-Reference Queries (Step 2.5)

These queries target the **MSA_AzureConsumption_Enterprise** model (`726c8fed-367a-4249-b685-e4e22ca82b3d`). They enrich the SQL600 readout with account-level month-over-month ACR and service/workload breakdowns from the full Azure consumption view.

> **⚠️ Different model ID.** All AIO queries use `semanticModelId: "726c8fed-367a-4249-b685-e4e22ca82b3d"` — NOT the SQL600 model. Pass the correct model ID to each `powerbi-remote:ExecuteQuery` call.

> **⚠️ Base filters.** All AIO queries MUST include:
> - `'DimViewType'[ViewType] = "Curated"`
> - Date scope via `'DimDate'[IsAzureClosedAndCurrentOpen] = "Y"` (YTD) or `'DimDate'[FY_Rel] = "FY"` (full FY)

> **⚠️ Rate-limit mitigation.** The AIO model is heavily shared and rate-limits aggressively. All AIO data MUST be retrieved in a **single `ExecuteQuery` call** using the `daxQueries` array (QA-BULK + QA2). Never split into sequential calls.

### Cached AIO Schema

The DimDate month-grain column is stable across model refreshes. **Use the cached value below — do NOT probe the schema at runtime.**

| Column | Cached Value | Verified |
|---|---|---|
| `<MONTH_COL>` | `MonthStartDate` | 2026-04 |

> **One-time re-verification:** If QA-BULK errors with "column not found", run the schema probe below once to rediscover:
> ```dax
> EVALUATE TOPN(1, 'DimDate')
> ```
> Update the cached value in this table. Prefer columns producing readable labels (text > DateTime):
> `FiscalYearMonth` > `CalendarYearMonth` > `MonthStartDate` > `FiscalMonth`.

### TPID List Construction

Build the TPID list from **Q10-DETAIL results** (available after Step 1 — no need to wait for Step 2):

```
Collect all unique TPIDs from:
  - sql600PillarBreakdown[].TPID (Q10-DETAIL results from Step 1)

This covers all 43 HLS SQL600 accounts. Deduplicate.
Format as: {629368, 8012737, 1627751, ...}
```

> **Why Q10-DETAIL instead of Q5+Q6+Q8?** Q10-DETAIL projects every HLS SQL600 account (43 accounts × multiple pillars), giving the complete TPID set after Step 1. This unblocks AIO queries to run **in parallel** with Step 2 detail queries (Q5–Q9), saving one full PBI round-trip.

### QA-BULK — Account Monthly ACR + Budget Attainment (AIO)

**Purpose:** Single bulk query replacing the former QA1 (MoM trend) and QA3 (budget attainment). Retrieves account × month ACR with budget measures included at every row. Client-side deduplicates budget columns (which repeat per month) by taking any row per TPID.

**Artifact ID:** `726c8fed-367a-4249-b685-e4e22ca82b3d`

| Parameter | Value |
|---|---|
| Filter | YTD closed months + current open, Curated view, TPID list from SQL600 |
| Sort | Account ASC, Month ASC |
| Row limit | TPID count × ~12 months (last 4 quarters). Older data adds noise without executive value |

```dax
EVALUATE
SUMMARIZECOLUMNS(
    'DimCustomer'[TPID],
    'DimCustomer'[TPAccountName],
    'DimDate'[MonthStartDate],
    TREATAS({<TPID_LIST>}, 'DimCustomer'[TPID]),
    FILTER('DimDate',
        'DimDate'[IsAzureClosedAndCurrentOpen] = "Y"
        && 'DimDate'[MonthStartDate] >= DATE(2024, 7, 1)
    ),
    TREATAS({"Curated"}, 'DimViewType'[ViewType]),
    "ACR", 'M_ACR'[$ ACR],
    "ACR_LCM", 'M_ACR'[$ ACR Last Closed Month],
    "BudgetAttainPct", 'M_ACRBudget'[% ACR Budget Attain (YTD)]
)
ORDER BY 'DimCustomer'[TPAccountName] ASC, 'DimDate'[MonthStartDate] ASC
```

> **DAX corrections (verified 2026-04-28):**
> - `DimViewType` filter uses `TREATAS` — bare boolean equality is invalid as a SUMMARIZECOLUMNS filter argument.
> - Budget attainment measure lives in `'M_ACRBudget'` — NOT `'M_ACR'`.
> - Date filter includes `MonthStartDate >= DATE(2024, 7, 1)` to avoid historical null rows that blow the maxRows cap.

> **Client-side extraction** (handled by `normalize-aio.js`):
> - **MoM trend** (`aioAccountMoM`): Use TPID + TPAccountName + MonthStartDate + ACR columns directly.
> - **Budget attainment** (`aioBudgetAttainment`): Group by TPID, take the row with the latest MonthStartDate. Extract ACR_LCM + BudgetAttainPct. Compute ACR_YTD as `SUM(ACR)` across all months for that TPID.

### QA2 — Account × Service Pillar ACR Breakdown (AIO) — SECONDARY

**Purpose:** Consumption ACR broken down by Azure strategic pillar for each SQL600 account. Shows WHERE consumption is happening (Data & AI, Infra, etc.) — critical for identifying SQL-adjacent workloads and migration readiness.

> **⚠️ Q10-DETAIL is the preferred source.** Use Q10-DETAIL from the SQL600 model for per-account pillar data. QA2 is retained as a secondary enrichment source (provides sub-pillar granularity and solution play detail that Q10-DETAIL does not). If Q10-DETAIL data is available, QA2 is optional.
>
> **Known issue (4/28):** `M_ACR[$ ACR]` may not scope correctly by `F_AzureConsumptionPipe[StrategicPillar]` — producing duplicated total-account ACR across every pillar row. When this happens, the data looks correct in column count but every pillar shows the same ACR value (equal to total account ACR). If detected, discard QA2 results and rely on Q10-DETAIL.
>
> **Why it worked on 4/20 but not 4/28:** The AIO model (`MSA_AzureConsumption_Enterprise`) undergoes periodic schema refreshes. The cross-filter relationship between the consumption measure and the pipeline fact's `StrategicPillar` column may not be stable across refreshes.

**Artifact ID:** `726c8fed-367a-4249-b685-e4e22ca82b3d`

| Parameter | Value |
|---|---|
| Filter | YTD closed months + current open, Curated view, TPID list from SQL600 |
| Sort | Account ASC, ACR DESC |

```dax
EVALUATE
SUMMARIZECOLUMNS(
    'DimCustomer'[TPID],
    'DimCustomer'[TPAccountName],
    'F_AzureConsumptionPipe'[StrategicPillar],
    TREATAS({<TPID_LIST>}, 'DimCustomer'[TPID]),
    FILTER('DimDate',
        'DimDate'[IsAzureClosedAndCurrentOpen] = "Y"
        && 'DimDate'[MonthStartDate] >= DATE(2024, 7, 1)
    ),
    TREATAS({"Curated"}, 'DimViewType'[ViewType]),
    "ACR", 'M_ACR'[$ ACR]
)
ORDER BY 'DimCustomer'[TPAccountName] ASC, [ACR] DESC
```

> **Validation:** After results arrive, check that per-account pillar totals are in the same order of magnitude as QA-BULK monthly ACR × number of months. If pillar totals are < 10% of expected consumption, the model may have changed — fall back to QA2-PIPE.

#### QA2-PIPE — Pipeline-Only Pillar Breakdown (Fallback)

If QA2 returns empty results or errors, fall back to pipeline-only data. **Note:** This produces forward-looking pipeline values, not actual consumption — the service mix percentages will reflect pipeline composition, not Azure spend.

```dax
EVALUATE
SUMMARIZECOLUMNS(
    'DimCustomer'[TPID],
    'DimCustomer'[TPAccountName],
    'F_AzureConsumptionPipe'[StrategicPillar],
    'F_AzureConsumptionPipe'[SolutionPlay],
    TREATAS({<TPID_LIST>}, 'DimCustomer'[TPID]),
    TREATAS({"FY"}, 'DimDate'[FY_Rel]),
    TREATAS({"Curated"}, 'DimViewType'[ViewType]),
    FILTER(
        ALL('F_AzureConsumptionPipe'[MilestoneStatus]),
        'F_AzureConsumptionPipe'[MilestoneStatus] IN {"In Progress", "Not Started", "Blocked"}
    ),
    "PipelineACR", 'M_ACRPipe'[$ Consumption Pipeline All]
)
ORDER BY 'DimCustomer'[TPAccountName] ASC, [PipelineACR] DESC
```

> **DAX note:** The `MilestoneStatus IN {...}` predicate must be wrapped in `FILTER(ALL(...), ...)` — bare `IN` expressions are invalid as SUMMARIZECOLUMNS filter arguments.

### QA3-ATTR — Account Attributes / Propensity Signals (AIO)

**Purpose:** Pulls propensity flags and program eligibility signals from `AzureCustomerAttributes` for each SQL600 account. These signals enrich LLM-generated next-step recommendations and render as attribute badges in the HTML report.

> **Important:** `AzureCustomerAttributes` does NOT have a `TPAccountName` column. Filter by TPID only. Account names are resolved via TPID join to existing SQL600 data.

**Artifact ID:** `726c8fed-367a-4249-b685-e4e22ca82b3d`

| Parameter | Value |
|---|---|
| Filter | TPID list from SQL600 |
| Sort | TPID ASC |
| Expected rows | ~30–50 (only accounts present in the AIO model) |

```dax
EVALUATE
CALCULATETABLE(
    SELECTCOLUMNS(
        'AzureCustomerAttributes',
        "TPID", 'AzureCustomerAttributes'[TPID],
        "ESI_Tier", 'AzureCustomerAttributes'[ESI_Tier],
        "HasOpenAI", 'AzureCustomerAttributes'[HasOpenAI],
        "HasOpenAI_Pipe", 'AzureCustomerAttributes'[HasOpenAI_Pipe],
        "PTU_Target", 'AzureCustomerAttributes'[PTU_Target_Customer],
        "NetNewMigrationTarget", 'AzureCustomerAttributes'[NetNewMigrationTarget],
        "LXP_Category", 'AzureCustomerAttributes'[LXP_Category],
        "TrancheGrowthTarget", 'AzureCustomerAttributes'[TrancheGrowthTargetAccounts],
        "500K_100K_Target", 'AzureCustomerAttributes'[500K_100K_Targets],
        "GHCP_200Plus", 'AzureCustomerAttributes'[GHCPFY26200Plus],
        "GHCP_200Less", 'AzureCustomerAttributes'[GHCPFY26200Less]
    ),
    'AzureCustomerAttributes'[TPID] IN {<TPID_LIST>}
)
```

> **Output mapping:** Store QA3-ATTR results in the data JSON as `aioAccountAttributes[]`. Each row maps to:
> ```json
> { "TPID": 641450, "ESI_Tier": "Tier 1", "HasOpenAI": "Y", "HasOpenAI_Pipe": "N", "PTU_Target": "Y", "NetNewMigrationTarget": "Y", "LXP_Category": "Advanced", "TrancheGrowthTarget": "Y", "500K_100K_Target": "500K", "GHCP_200Plus": "Y", "GHCP_200Less": null }
> ```
>
> **Consumer chain:** `normalize-aio.js` extracts the array → merged into the data JSON → `generate-next-steps.js` uses attributes as LLM context per account → `generate-sql600-report.js` renders attribute badges in the expandable detail rows.

### AIO Query Batching — Single Call

All AIO data MUST be retrieved in **1 `ExecuteQuery` call** using `daxQueries` array (3 queries — within the 4-query limit):

```
daxQueries: [
  QA-BULK,    // account × month ACR + budget attainment (~150–500 rows)
  QA2,        // account × pillar consumption ACR breakdown (~30–250 rows)
  QA3-ATTR    // account attributes / propensity signals (~30–50 rows)
]
```

If QA2 returns empty or errors, retry with QA2-PIPE + QA3-ATTR in a follow-up call.

| Old Approach | Calls | New Approach | Calls |
|---|---|---|---|
| QA0 (schema probe) → QA1 + QA3 → QA2 | 3–4 | QA-BULK + QA2 + QA3-ATTR in single array | **1** |

**Post-processing:** Pipe the raw PBI response through `normalize-aio.js` to split into report-ready arrays:

```bash
node scripts/helpers/normalize-aio.js .copilot/docs/aio-raw-<date>.json \
  --merge .copilot/docs/sql600-data-<date>.json
```

This produces `aioAccountMoM`, `aioBudgetAttainment`, and `aioServiceBreakdown` arrays expected by `generate-sql600-report.js`. See [helpers README](../../../scripts/helpers/README.md) for details.

> **If rate-limited:** Wait 30 seconds, then send QA-BULK alone (1 call). The pillar breakdown is lower priority and can be omitted — note "AIO service breakdown unavailable (rate limited)" in the output.

### AIO Coverage Validation

After `normalize-aio.js` runs, validate the output against the TPID list you sent:

| Check | How | Action if Failed |
|---|---|---|
| **Merge succeeded** | Verify `aioAccountMoM`, `aioBudgetAttainment`, `aioServiceBreakdown`, `aioAccountAttributes` keys exist in the data JSON and have length > 0 | Re-run `normalize-aio.js --merge`. If the raw AIO file wasn't saved, the AIO call response is lost — re-run Step 2.5. |
| **TPID coverage** | Compare `normalize-aio` "N accounts" count against your TPID list size | If < 50%, note "AIO coverage limited — N of M TPIDs matched." This is a model-level gap (some SQL600 TPIDs don't exist in AIO's `DimCustomer`), not a query error. |
| **Budget data** | Check if all `BudgetAttainPct` values are ≤ 0.01 | If so, note "Budget targets not loaded in current AIO refresh." The HTML generator's `budgetSignal()` function handles this by showing "No data" for accounts with <1% attainment and >$1M ACR YTD. |
| **Pillar granularity** | Check `StrategicPillar` values — are they parent-level ("Data & AI") or sub-level ("Azure SQL Core")? | Either works. The HTML generator's `normalizePillar()` maps sub-pillars to parent categories for clean bar charts. No action needed, but note which granularity you received. |
| **Attributes coverage** | Check `aioAccountAttributes` length. Not all SQL600 TPIDs exist in `AzureCustomerAttributes` | If 0 rows returned, note "Account attributes unavailable." The report and LLM steps handle missing attributes gracefully. |

> **Known AIO model quirks:**
> - **TPID universe mismatch**: The AIO model (`MSA_AzureConsumption_Enterprise`) has a different customer universe than the SQL600 model. Not all SQL600 HLS TPIDs exist in AIO. Typical coverage is 30-70% depending on account mix. This is expected — not an error.
> - **Budget refresh lag**: Budget attainment data (`M_ACRBudget`) depends on a separate budget load process that sometimes lags the ACR data by days or weeks. When budget targets aren't loaded, `BudgetAttainPct` returns 0 for all accounts.
> - **Pillar granularity varies**: The `StrategicPillar` column on `F_AzureConsumptionPipe` sometimes returns parent-level names ("Data & AI", "Infra") and sometimes sub-pillar names ("Azure SQL Core", "Rest of Infra", "Azure OpenAI"). This depends on the AIO model's current dimension hierarchy. The generator handles both via `normalizePillar()`.
