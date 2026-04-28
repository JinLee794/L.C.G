---
agent: pbi-analyst
description: "SQL600 diagnostic: runs every query section (Q1–Q10-DETAIL) against the SQL600 Power BI model and validates results against expected shapes, ranges, and row counts. Use to catch data regression, broken measures, or stale model refreshes."
model: Claude Opus 4.6 (copilot)
---
# SQL600 Diagnostic — Data Sanity (SQL600 Model)

Execute each query section from the `powerbi-sql600-hls` skill against the SQL600 model and validate the results. This catches:

- **Stale model refresh** — data frozen at a prior date
- **Broken measures** — renamed/removed measures returning BLANK
- **Filter context issues** — wrong account count, missing verticals
- **Row count regression** — queries returning fewer rows than expected
- **Data quality** — nulls, duplicates, or out-of-range values

## ⛔ Tool Restrictions

**NEVER call `GetSemanticModelSchema` or `GetReportMetadata`.** The SQL600 model's schema response is too large for the MCP tool to parse (known `MPC -32603` error). All schema validation uses targeted DAX queries. Schema is fully mapped in the skill's `schema-mapping.md`.

## Configuration

| Setting | Value |
|---|---|
| **Semantic Model ID** | `c848b220-eaf2-42e0-b6d2-9633a6e39b37` |
| **Expected HLS Account Count** | 43 |
| **Expected Verticals** | Health Provider, Health Payor, Health Pharma, MedTech |
| **Current FY** | FY26 |

---

## Test Suite

Run all queries using `daxQueries` array batching (same as the real skill). Report results per query.

### Batch 1 — Aggregate Queries (Q1 + Q2 + Q3 + Q4 + Q4B + Q10-DETAIL)

#### T1 — Q1 Portfolio KPI Snapshot

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

**Validation:**

| Check | Expected | Fail Signal |
|---|---|---|
| Row count | Exactly 1 | Query filter broken |
| `Industry` column value | `"Healthcare"` | Scope filter wrong |
| `ACR_LCM` | > $1M (HLS portfolio is substantial) | Data not loaded or RLS |
| `TotalOpps` | > 0 | Pipeline fact empty |
| `QualifiedOpps` ≤ `TotalOpps` | Always | Measure logic error |
| `AcctsWithModPipe` + `AcctsWithoutModPipe` | ≈ 43 | Account scope drift |
| `PipelinePenetration` | 0.0–1.0 range | Percent calc broken |
| `FactoryAttach` | 0.0–1.0 range | Factory Cases table issue |
| `WoW_Change` | Non-BLANK | Last-week snapshot missing |
| `RealizedPlusBasePlusPipe` ≥ `ACR_LCM` | Always (includes baseline + pipe) | Composite measure broken |

#### T2 — Q2 Industry Ranking

```dax
EVALUATE
SUMMARIZECOLUMNS(
    '2) Account'[Industry],
    FILTER('2) Account', '2) Account'[SQL600 Account] = TRUE()),
    "AccountCount", COUNTROWS('2) Account'),
    "ACR_LCM", [ACR (Last Closed Month)],
    "PipeCommitted", [Pipeline ACR (Committed excl Blocked)]
)
ORDER BY [ACR_LCM] DESC
```

**Validation:**

| Check | Expected | Fail Signal |
|---|---|---|
| Row count | 12–14 (known industries in SQL600) | Industry dimension changed |
| "Healthcare" row present | Yes | HLS filtered out |
| All `ACR_LCM` > 0 | Typical (some industries may be tiny) | Stale data |
| Account counts sum | ≈ 251 total SQL600 | Account list changed |
| Known industry names | See schema-mapping.md § Known Filter Values | Dimension values renamed |

**Known industries to check for:**
- Healthcare, Financial Services, Government, Software Data & Platforms, Industrials & Manufacturing, Retail & Consumer Goods, Energy & Resources

#### T3 — Q3 Vertical Breakdown

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

**Validation:**

| Check | Expected | Fail Signal |
|---|---|---|
| Row count | 4 (Provider, Payor, Pharma, MedTech) | Vertical dimension changed |
| Account counts sum | 43 | HLS scope drift |
| Expected vertical values | "Health Provider" (25), "MedTech" (9), "Health Payor" (6), "Health Pharma" (3) | Values renamed |
| Each `ACR_LCM` > 0 | Yes | Vertical-level data gap |

#### T4 — Q4 ACR Monthly Trend

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

**Validation:**

| Check | Expected | Fail Signal |
|---|---|---|
| Row count | 8–12 (Jul '25 through current month) | Calendar filter issue |
| At least 1 row with `IsClosed = FALSE` | Yes (current open month) | YTD flag broken |
| All closed-month `ACR` > 0 | Yes | Data gap in ACR fact |
| Months in chronological order | Yes | Sort not applied |
| Open month ACR ≤ most recent closed month ACR | Typical (partial month) | MTD data issue |
| No duplicate months | Yes | Calendar grain broken |

#### T5 — Q4B Vertical Monthly Trend

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

**Validation:**

| Check | Expected | Fail Signal |
|---|---|---|
| Row count | 4 verticals × 7–11 closed months = 28–44 rows | Cross-filter or calendar issue |
| All 4 verticals present | Health Provider, Payor, Pharma, MedTech | Missing vertical data |
| Only `IsClosed = TRUE` rows | Yes (Q4B restricts to closed) | Calendar filter not applied |
| Per-vertical monthly sum ≈ Q4 total | Yes (within rounding) | Vertical breakdown inconsistent |

#### T6 — Q10-DETAIL Per-Account Pillar Breakdown

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

**Validation:**

| Check | Expected | Fail Signal |
|---|---|---|
| Row count | 100–250 (43 accounts × 3–6 pillars each) | Too few = accounts missing; too many = spurious pillars |
| Unique TPIDs | ≈ 43 | Not all HLS accounts have ACR data |
| Distinct `StrategicPillar` values | 3–8 (e.g., Data & AI, Infra, Security, Modern Work, App Innovation) | Product dimension changed |
| Per-account pillar totals reasonable | Order of magnitude $100K–$10M per account per year | Values suspiciously uniform = duplication bug |
| **Duplication check** | Each (TPID, StrategicPillar) pair appears at most once | Duplicate rows = join grain issue |
| Sum of all ACR ≈ Q1's ACR_LCM × closed months | Same ballpark | Data source mismatch |

---

### Batch 2 — Detail Queries (Q5 + Q6 + Q7 + Q8 + Q9)

#### T7 — Q5 Top 15 Accounts

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
        "AnnualizedGrowthPlusPipe", [Annualized ACR Growth + Pipeline],
        "QualifiedOpps", [# of Qualified Opportunities],
        "TotalOpps", [# of Opportunities]
    ),
    [ACR_LCM], DESC
)
```

**Validation:**

| Check | Expected | Fail Signal |
|---|---|---|
| Row count | 15 (or fewer if < 15 accounts have ACR) | TOPN or filter issue |
| All `Vertical` values in expected set | Provider/Payor/Pharma/MedTech | Vertical values changed |
| Sorted by `ACR_LCM` DESC | Yes | Sort not applied |
| No duplicate TPIDs | Yes | Grain issue |
| Top account ACR_LCM | > $500K typically | Data scale check |

#### T8 — Q6 Renewal Exposure

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

**Validation:**

| Check | Expected | Fail Signal |
|---|---|---|
| Row count | > 0 (not all 43 are in SQL 500 Target List) | Bidirectional relationship broken |
| `SQL 500 category` values | Known set (Renewals, Top SQL Cores, Other/Field) | Category renamed |
| `SQL Renewal Quarter` values | `FY26-Q3`, `FY26-Q4`, or null | Renewal quarters not updated |
| `Total SQL Cores` | > 0 for most rows | SQL Cores column missing |
| `ACR_LCM` populated for most rows | Yes (bidirectional filter propagating) | Cross-filter broken |

#### T9 — Q7 Modernization Pipeline

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

**Validation:**

| Check | Expected | Fail Signal |
|---|---|---|
| Row count | > 0 (some mod pipeline should exist) | Modernization Workload Flag column missing or all 0 |
| `MilestoneWorkload` populated | Yes | Workload Bridge relationship broken |
| `OpportunityLink` format | CRM URL pattern | Link column empty |
| `QualifiedFlag` values | Recognizable (e.g., "Yes"/"No" or "Qualified"/"Unqualified") | Flag values changed |

#### T10 — Q8 Gap Accounts

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

**Validation:**

| Check | Expected | Fail Signal |
|---|---|---|
| Row count | 0–20 (some accounts always have zero committed pipe) | If all 43 → pipeline fact is empty |
| All `PipeCommitted` = 0 or BLANK | Yes (that's the filter) | Filter not working |
| Accounts are subset of HLS SQL600 | Yes | Scope filter leak |
| `ACR_LCM` > 0 for some | Typical (consuming but no pipeline) | Expected pattern |

#### T11 — Q9 Top Opportunities

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

**Validation:**

| Check | Expected | Fail Signal |
|---|---|---|
| Row count | 10–20 | Pipeline fact has data |
| `SalesStageShort` values | Recognizable stage names | Stage column renamed |
| `DaysInSalesStage` | ≥ 0 integers | Column type changed |
| `OpportunityOwner` populated | For most rows | Owner column empty |
| Sorted by `PipeACR_Qualified` DESC | Yes | Sort not applied |

---

## Cross-Query Consistency Checks

After all queries return, validate consistency across query results:

| Check | Sources | Expected | Fail Signal |
|---|---|---|---|
| Vertical account count (Q3) sums to 43 | T3 | 25 + 9 + 6 + 3 = 43 | Account classification changed |
| Q1 `AcctsWithModPipe` + `AcctsWithoutModPipe` ≈ 43 | T1 | Sum ≈ 43 | Mod pipe measure scope drift |
| Q5 top account ACR ≤ Q1 portfolio ACR | T1, T7 | Always | Aggregation error |
| Q8 gap count + Q1 `AcctsWithModPipe` ≤ 43 | T1, T10 | Always (different concepts but bounded) | Scope mismatch |
| Q4 most recent closed-month ACR ≈ Q1 `ACR_LCM` | T1, T4 | Within 5% | LCM date mismatch |
| Q10-DETAIL unique accounts ≈ 43 | T6 | 40–43 (some may have zero ACR) | Pillar join filtering accounts |
| Q4B vertical monthly sums ≈ Q4 monthly totals | T4, T5 | Within rounding | Vertical breakdown inconsistent |

---

## Output Format

```
## SQL600 Diagnostic — Data Sanity
Date: <today>
Model: SQL 600 Performance Tracking (c848b220-eaf2-42e0-b6d2-9633a6e39b37)

### Query Results Summary
| Test | Query | Rows | Status | Notes |
|---|---|---|---|---|
| T1 | Q1 — Portfolio KPI | <n> | ✅/⚠️/❌ | |
| T2 | Q2 — Industry Ranking | <n> | ✅/⚠️/❌ | |
| T3 | Q3 — Vertical Breakdown | <n> | ✅/⚠️/❌ | |
| T4 | Q4 — ACR Monthly Trend | <n> | ✅/⚠️/❌ | |
| T5 | Q4B — Vertical Monthly | <n> | ✅/⚠️/❌ | |
| T6 | Q10-DETAIL — Pillar | <n> | ✅/⚠️/❌ | |
| T7 | Q5 — Top 15 Accounts | <n> | ✅/⚠️/❌ | |
| T8 | Q6 — Renewal Exposure | <n> | ✅/⚠️/❌ | |
| T9 | Q7 — Mod Pipeline | <n> | ✅/⚠️/❌ | |
| T10 | Q8 — Gap Accounts | <n> | ✅/⚠️/❌ | |
| T11 | Q9 — Top Opps | <n> | ✅/⚠️/❌ | |

### Cross-Query Consistency
| Check | Expected | Actual | Status |
|---|---|---|---|
| Vertical account sum = 43 | 43 | <n> | ✅/❌ |
| Mod pipe accounts sum ≈ 43 | ~43 | <n> | ✅/❌ |
| Q4 LCM ≈ Q1 ACR_LCM | <$> | <$> | ✅/❌ |
| Q10-DETAIL unique accounts | ~43 | <n> | ✅/❌ |
...

### Detailed Failures
<for each ❌ or ⚠️, explain what was expected vs. what was returned>

### Recommendations
- <action items based on failures>
```
