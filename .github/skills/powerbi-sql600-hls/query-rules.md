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
    "AnnualizedGrowth", [Annualized ACR Growth (since June 2025) (FY26)],
    "AnnualizedGrowthPlusPipe", [Annualized ACR Growth + Pipeline (FY26)],
    "PipeCommitted", [Pipeline ACR (Committed excl Blocked)],
    "PipeUncommitted", [Pipeline ACR (Uncommitted)],
    "PipeQualified", [Pipeline ACR (Qualified)],
    "PipeUnqualified", [Pipeline ACR (Unqualified)],
    "QualifiedOpps", [# of Qualified Opportunities],
    "TotalOpps", [# of Opportunities],
    "ModernizationOpps", [Modernization Opportunities],
    "PipelinePenetration", [SQL 600 Pipeline Penetration %],
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

**Purpose:** ACR ranking of all SQL600 industries. Validates HLS position (#2 narrative). Run every time.

```dax
EVALUATE
ADDCOLUMNS(
    SUMMARIZECOLUMNS(
        '2) Account'[Industry],
        FILTER('2) Account', '2) Account'[SQL600 Account] = TRUE()),
        "AccountCount", COUNTROWS('2) Account'),
        "ACR_LCM", [ACR (Last Closed Month)],
        "PipeCommitted", [Pipeline ACR (Committed excl Blocked)]
    ),
    "IndustryRank", RANKX(
        SUMMARIZECOLUMNS(
            '2) Account'[Industry],
            FILTER('2) Account', '2) Account'[SQL600 Account] = TRUE()),
            "ACR_LCM_inner", [ACR (Last Closed Month)]
        ),
        [ACR_LCM],
        ,
        DESC,
        DENSE
    )
)
ORDER BY [ACR_LCM] DESC
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
    "AnnualizedGrowth", [Annualized ACR Growth (since June 2025) (FY26)],
    "ModOpps", [Modernization Opportunities]
)
ORDER BY [ACR_LCM] DESC
```

### Q4 — ACR Monthly Trend (FY26)

**Purpose:** Month-over-month ACR trajectory for HLS SQL600. Shows momentum. Run every time.

```dax
EVALUATE
SUMMARIZECOLUMNS(
    '1) Calendar'[Fiscal Month],
    FILTER('2) Account',
        '2) Account'[SQL600 Account] = TRUE()
        && '2) Account'[Industry] = "Healthcare"
    ),
    FILTER('1) Calendar', '1) Calendar'[Fiscal Year] = "FY26"),
    "ACR", [ACR (Total By Closed Month)]
)
ORDER BY '1) Calendar'[Fiscal Month] ASC
```

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
        "AnnualizedGrowth", [Annualized ACR Growth (since June 2025) (FY26)],
        "AnnualizedGrowthPlusPipe", [Annualized ACR Growth + Pipeline (FY26)]
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

### Q10 — ACR by Strategic Pillar (optional)

**Purpose:** ACR breakdown by service/workload category. Useful for understanding WHAT Azure services HLS is consuming.

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

---

## Azure All-in-One (AIO) Cross-Reference Queries (Step 2.5)

These queries target the **MSA_AzureConsumption_Enterprise** model (`726c8fed-367a-4249-b685-e4e22ca82b3d`). They enrich the SQL600 readout with account-level month-over-month ACR and service/workload breakdowns from the full Azure consumption view.

> **⚠️ Different model ID.** All AIO queries use `semanticModelId: "726c8fed-367a-4249-b685-e4e22ca82b3d"` — NOT the SQL600 model. Pass the correct model ID to each `powerbi-remote:ExecuteQuery` call.

> **⚠️ Base filters.** All AIO queries MUST include:
> - `'DimViewType'[ViewType] = "Curated"`
> - Date scope via `'DimDate'[IsAzureClosedAndCurrentOpen] = "Y"` (YTD) or `'DimDate'[FY_Rel] = "FY"` (full FY)

### TPID List Construction

Before running AIO queries, build the TPID list from SQL600 results:

```
Collect all unique TPIDs from:
  - topAccounts[].TPID (Q5 results)
  - renewals[].TPID (Q6 results)
  - gapAccounts[].TPID (Q8 results)

Deduplicate. Format as: {629368, 8012737, 1627751, ...}
```

### QA0 — DimDate Schema Probe (run once)

**Purpose:** Discover the month-grain column name in the AIO model's DimDate table. Required before QA1.

**Artifact ID:** `726c8fed-367a-4249-b685-e4e22ca82b3d`

```dax
EVALUATE
TOPN(1, 'DimDate')
```

Inspect the returned columns for a fiscal-month-grain column. Look for (in preference order):
1. `FiscalYearMonth` — e.g. `"Mar 2026"` or `"FY26-Mar"`
2. `MonthStartDate` — e.g. `2026-03-01T00:00:00`
3. `CalendarYearMonth` — e.g. `"2026-03"`
4. `FiscalMonth` — DateTime
5. Any column with "Month" in the name at a monthly grain

Cache the discovered column as `<MONTH_COL>` for QA1 and QA2. If multiple month-grain columns exist, prefer the one that produces readable labels (text > DateTime).

### QA1 — Account-Level Monthly ACR Trend (AIO)

**Purpose:** Month-over-month ACR per SQL600 account from the full Azure consumption view. Shows consumption trajectory at the account × month grain.

**Artifact ID:** `726c8fed-367a-4249-b685-e4e22ca82b3d`

| Parameter | Value |
|---|---|
| Filter | YTD closed months + current open, Curated view, TPID list from SQL600 |
| Sort | Account ASC, Month ASC |
| Row limit | TPID count × 12 months (typically < 500 rows) |

```dax
EVALUATE
SUMMARIZECOLUMNS(
    'DimCustomer'[TPID],
    'DimCustomer'[TPAccountName],
    'DimDate'[<MONTH_COL>],
    TREATAS({<TPID_LIST>}, 'DimCustomer'[TPID]),
    FILTER('DimDate', 'DimDate'[IsAzureClosedAndCurrentOpen] = "Y"),
    'DimViewType'[ViewType] = "Curated",
    "ACR", 'M_ACR'[$ ACR]
)
ORDER BY 'DimCustomer'[TPAccountName] ASC, 'DimDate'[<MONTH_COL>] ASC
```

> **Column substitution:** Replace `<MONTH_COL>` with the column discovered in QA0. Replace `<TPID_LIST>` with the deduplicated list from all SQL600 account results.

### QA2 — Account × Service Pillar ACR Breakdown (AIO)

**Purpose:** ACR broken down by Azure strategic pillar for each SQL600 account. Shows WHERE consumption is happening (Data & AI, Infra, etc.) — critical for identifying SQL-adjacent workloads and migration readiness.

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

> **Note:** This query joins ACR actuals with the pipeline pillar dimension. If the model does not cross-filter ACR facts to `F_AzureConsumptionPipe` dimensions, use the ACR fact's own pillar column instead. Verify on first run. If this query returns empty or errors, fall back to QA2-ALT.

#### QA2-ALT — Pillar Breakdown via Pipeline Only

If QA2 fails because ACR facts and pipeline facts don't share a pillar dimension:

```dax
EVALUATE
SUMMARIZECOLUMNS(
    'DimCustomer'[TPID],
    'DimCustomer'[TPAccountName],
    'F_AzureConsumptionPipe'[StrategicPillar],
    'F_AzureConsumptionPipe'[SolutionPlay],
    TREATAS({<TPID_LIST>}, 'DimCustomer'[TPID]),
    'DimDate'[FY_Rel] = "FY",
    'DimViewType'[ViewType] = "Curated",
    'F_AzureConsumptionPipe'[MilestoneStatus] IN {"In Progress", "Not Started", "Blocked"},
    "PipelineACR", 'M_ACRPipe'[$ Consumption Pipeline All]
)
ORDER BY 'DimCustomer'[TPAccountName] ASC, [PipelineACR] DESC
```

### QA3 — Budget Attainment per Account (AIO)

**Purpose:** Budget attainment overlay for SQL600 accounts. Shows which accounts are ahead/behind target — informs prioritization alongside the SQL600 pipeline view.

**Artifact ID:** `726c8fed-367a-4249-b685-e4e22ca82b3d`

| Parameter | Value |
|---|---|
| Filter | YTD, Curated view, TPID list from SQL600 |
| Sort | ACR YTD DESC |

```dax
EVALUATE
SUMMARIZECOLUMNS(
    'DimCustomer'[TPID],
    'DimCustomer'[TPAccountName],
    TREATAS({<TPID_LIST>}, 'DimCustomer'[TPID]),
    FILTER('DimDate', 'DimDate'[IsAzureClosedAndCurrentOpen] = "Y"),
    'DimViewType'[ViewType] = "Curated",
    "ACR_YTD", 'M_ACR'[$ ACR],
    "ACR_LCM", 'M_ACR'[$ ACR Last Closed Month],
    "BudgetAttainPct", 'M_ACR'[% ACR Budget Attain (YTD)]
)
ORDER BY [ACR_YTD] DESC
```

### AIO Query Batching

All AIO queries target the same semantic model. Batch into **1–2 calls**:

| Batch | Queries | Notes |
|---|---|---|
| AIO Batch 1 | QA0 + QA1 + QA3 | Schema probe + MoM trend + budget attainment |
| AIO Batch 2 | QA2 (or QA2-ALT) | Service breakdown (may need fallback) |

If QA0 reveals the month column and all queries can be templated in advance, combine into a single `daxQueries` array call.
