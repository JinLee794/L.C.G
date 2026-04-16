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
    "AnnualizedGrowth", [Annualized ACR Growth (since June 2025)],
    "AnnualizedGrowthPlusPipe", [Annualized ACR Growth + Pipeline],
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
    "AnnualizedGrowth", [Annualized ACR Growth (since June 2025)],
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
        "AnnualizedGrowth", [Annualized ACR Growth (since June 2025)],
        "AnnualizedGrowthPlusPipe", [Annualized ACR Growth + Pipeline]
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
