---
agent: pbi-analyst
description: "SQL600 diagnostic: validates Power BI auth and schema for both the SQL600 and AIO models. Probes every table, column, and measure the SQL600 HLS skill depends on. Use to detect RLS blocks, renamed columns, or model refresh regressions."
model: Claude Opus 4.6 (copilot)
---
# SQL600 Diagnostic — Auth & Schema Validation

Validate that both Power BI models used by the `powerbi-sql600-hls` skill are accessible and structurally intact. This catches:

- **Auth / RLS failures** — token expired, model permissions revoked, row-level security blocking data
- **Schema drift** — columns or measures renamed, removed, or re-typed after a model refresh
- **Relationship breakage** — cross-filter paths changed or disabled

## ⛔ Tool Restrictions

**NEVER call `GetSemanticModelSchema` or `GetReportMetadata`.** The SQL600 model's schema response is too large for the MCP tool to parse — it fails with `MPC -32603: Unexpected character encountered while parsing value` at `verifiedAnswers[0].Bindings.Values`. This is a known, persistent server-side limitation. Schema is fully mapped in the skill's `schema-mapping.md`. All validation in this diagnostic uses targeted DAX queries instead.

## Models Under Test

| Model | Semantic Model ID | Purpose |
|---|---|---|
| SQL 600 Performance Tracking | `c848b220-eaf2-42e0-b6d2-9633a6e39b37` | Primary — all Q1–Q10 queries |
| MSA_AzureConsumption_Enterprise (AIO) | `726c8fed-367a-4249-b685-e4e22ca82b3d` | Cross-reference — QA-BULK, QA2, QA3-ATTR |

---

## Test 1 — SQL600 Model Auth

Run this minimal query against the SQL600 model. If it fails, no further SQL600 tests are possible.

```dax
EVALUATE TOPN(1, '1) Calendar')
```

| Result | Interpretation |
|---|---|
| Returns 1 row | ✅ Auth OK |
| Error: "credentials" / "token" / "401" | ❌ Token expired — run `az login` |
| Error: "Forbidden" / "403" | ❌ RLS or model permissions issue |
| Error: "not found" / "404" | ❌ Model ID may have changed |

## Test 2 — AIO Model Auth

Same probe against the AIO model (`726c8fed-367a-4249-b685-e4e22ca82b3d`):

```dax
EVALUATE TOPN(1, 'DimDate')
```

Same pass/fail criteria as Test 1.

---

## Test 3 — SQL600 Dimension Tables Exist

Run each probe. Report pass/fail per table.

### 3a — Calendar

```dax
EVALUATE
TOPN(3,
    SELECTCOLUMNS('1) Calendar',
        "FiscalYear", '1) Calendar'[Fiscal Year],
        "FiscalMonth", '1) Calendar'[Fiscal Month],
        "IsClosed", '1) Calendar'[IsClosed],
        "YTDFlag", '1) Calendar'[YTD Flag],
        "FiscalQuarter", '1) Calendar'[Fiscal Quarter]
    )
)
```

**Expected:** 3 rows with all columns populated. Check `FiscalYear` contains current FY (e.g., "FY26").

### 3b — Account

```dax
EVALUATE
TOPN(3,
    SELECTCOLUMNS('2) Account',
        "TPID", '2) Account'[TPID],
        "TopParent", '2) Account'[TopParent],
        "Industry", '2) Account'[Industry],
        "Vertical", '2) Account'[Vertical],
        "SQL600Account", '2) Account'[SQL600 Account],
        "Segment", '2) Account'[Segment],
        "FieldAreaShorter", '2) Account'[FieldAreaShorter],
        "FieldAreaDetail", '2) Account'[FieldAreaDetail]
    ),
    '2) Account'[SQL600 Account], DESC
)
```

**Expected:** 3 rows. At least one should have `SQL600Account = TRUE`. `Industry` should contain recognizable values (e.g., "Healthcare").

### 3c — Product

```dax
EVALUATE
TOPN(5,
    SELECTCOLUMNS('3) Product',
        "StrategicPillar", '3) Product'[StrategicPillar],
        "SubStrategicPillar", '3) Product'[SubStrategicPillar],
        "Workload", '3) Product'[Workload],
        "SolutionPlay", '3) Product'[SolutionPlay]
    )
)
```

**Expected:** 5 rows with diverse `StrategicPillar` values (e.g., "Data & AI", "Infra", "Security").

### 3d — SQL 500 Target List

```dax
EVALUATE
TOPN(3,
    SELECTCOLUMNS('SQL 500 Target List',
        "TPID", 'SQL 500 Target List'[TPID],
        "TopParent", 'SQL 500 Target List'[Top Parent],
        "Category", 'SQL 500 Target List'[SQL 500 category],
        "RenewalQ", 'SQL 500 Target List'[SQL Renewal Quarter],
        "SQLCores", 'SQL 500 Target List'[Total SQL Cores],
        "ArcEnabled", 'SQL 500 Target List'[SQL Arc Enabled?]
    ),
    'SQL 500 Target List'[Total SQL Cores], DESC
)
```

**Expected:** 3 rows. `Category` values should be one of: `SQL Renewals`, `Top SQL Cores (Excl. renewals)`, `Other / Field Nominated`.

---

## Test 4 — SQL600 Fact Tables & Relationships

### 4a — ACR Fact → Account → Calendar join

```dax
EVALUATE
TOPN(5,
    SUMMARIZECOLUMNS(
        '2) Account'[TPID],
        '2) Account'[TopParent],
        '1) Calendar'[Fiscal Month],
        FILTER('2) Account',
            '2) Account'[SQL600 Account] = TRUE()
            && '2) Account'[Industry] = "Healthcare"
        ),
        FILTER('1) Calendar', '1) Calendar'[IsClosed] = TRUE()),
        "ACR", [ACR]
    ),
    [ACR], DESC
)
```

**Expected:** 5 rows with non-zero ACR values. This validates the Account → ACR → Calendar filter chain.
**RLS check:** If 0 rows returned but auth passed in Test 1, you likely have RLS blocking HLS data.

### 4b — Pipeline Fact → Account join

```dax
EVALUATE
TOPN(5,
    SUMMARIZECOLUMNS(
        '2) Account'[TPID],
        '2) Account'[TopParent],
        '✽ Pipeline'[OpportunityName],
        '✽ Pipeline'[SalesStageShort],
        FILTER('2) Account',
            '2) Account'[SQL600 Account] = TRUE()
            && '2) Account'[Industry] = "Healthcare"
        ),
        "PipeACR", [Pipeline ACR (Qualified)]
    ),
    [PipeACR], DESC
)
```

**Expected:** 5 rows with pipeline data. Validates Account → Pipeline filter path.

### 4c — Product → ACR Fact join (pillar breakdown)

```dax
EVALUATE
TOPN(5,
    SUMMARIZECOLUMNS(
        '3) Product'[StrategicPillar],
        FILTER('2) Account',
            '2) Account'[SQL600 Account] = TRUE()
            && '2) Account'[Industry] = "Healthcare"
        ),
        FILTER('1) Calendar', '1) Calendar'[Fiscal Year] = "FY26"),
        "ACR", [ACR (Total By Closed Month)]
    ),
    [ACR], DESC
)
```

**Expected:** Multiple pillars (3–6) with diverse ACR values. Validates Product → ACR cross-filter.

---

## Test 5 — SQL600 Key Measures Exist

Run a single SUMMARIZECOLUMNS with all measures the skill depends on. Any `BLANK()` result here could indicate a renamed or removed measure.

```dax
EVALUATE
SUMMARIZECOLUMNS(
    '2) Account'[Industry],
    FILTER('2) Account',
        '2) Account'[SQL600 Account] = TRUE()
        && '2) Account'[Industry] = "Healthcare"
    ),
    "m_ACR", [ACR],
    "m_ACR_LCM", [ACR (Last Closed Month)],
    "m_ACR_TotalByClosed", [ACR (Total By Closed Month)],
    "m_ACR_YoY", [ACR Change Δ% - YTD YoY],
    "m_AnnualGrowth", [Annualized ACR Growth (since June 2025)],
    "m_AnnualGrowthPipe", [Annualized ACR Growth + Pipeline],
    "m_PipeCommitted", [Pipeline ACR (Committed excl Blocked)],
    "m_PipeUncommitted", [Pipeline ACR (Uncommitted)],
    "m_PipeQualified", [Pipeline ACR (Qualified)],
    "m_PipeUnqualified", [Pipeline ACR (Unqualified)],
    "m_QualOpps", [# of Qualified Opportunities],
    "m_TotalOpps", [# of Opportunities],
    "m_ModOpps", [Modernization Opportunities],
    "m_PipePen", [SQL 600 Pipeline Penetration %],
    "m_SQLTam", [Annualized SQL TAM],
    "m_SQLCores", [Total SQL Cores],
    "m_AcctsWithMod", [Accounts With Modernization Pipeline],
    "m_AcctsWithoutMod", [Accounts Without Modernization Pipeline],
    "m_FactoryAttach", [Factory Attach to Modernization Opportunities],
    "m_RealizedBasePipe", [Realized ACR + Baseline + Pipe],
    "m_RealizedBasePipe_LW", [Realized ACR + Baseline + Pipe (Last Week Snapshot)],
    "m_WoW", [Realized ACR + Baseline + Pipe WoW Change $]
)
```

**Validation rules per measure:**

| Measure | Expected | Fail Signal |
|---|---|---|
| `m_ACR` | > 0 | Data not flowing |
| `m_ACR_LCM` | > 0, ≤ `m_ACR` | Last-closed-month filter broken |
| `m_ACR_YoY` | Non-BLANK decimal | YoY calculation broken |
| `m_AnnualGrowth` | Non-BLANK | Growth baseline (June 2025) missing |
| `m_PipeCommitted` | Non-BLANK (can be 0 or negative) | Pipeline fact empty |
| `m_QualOpps` | ≥ 0 integer | Opp counting broken |
| `m_ModOpps` | ≥ 0 integer | Modernization flag column missing |
| `m_PipePen` | 0–1 range | Penetration calc broken |
| `m_SQLTam` | > 0 | SQL TAM table missing/disconnected |
| `m_SQLCores` | > 0 | SQL Cores table missing/disconnected |
| `m_FactoryAttach` | 0–1 range | Factory Cases table disconnected |
| `m_WoW` | Non-BLANK | Last-week snapshot table missing |

Report each measure as ✅ (non-BLANK, in expected range) or ❌ (BLANK or out of range).

---

## Test 6 — AIO Model Schema (if Test 2 passed)

### 6a — DimCustomer columns

```dax
EVALUATE
TOPN(3,
    SELECTCOLUMNS('DimCustomer',
        "TPID", 'DimCustomer'[TPID],
        "TPAccountName", 'DimCustomer'[TPAccountName]
    )
)
```

### 6b — DimDate month column (cached as `MonthStartDate`)

```dax
EVALUATE
TOPN(3,
    SELECTCOLUMNS('DimDate',
        "MonthStartDate", 'DimDate'[MonthStartDate],
        "IsClosedOpen", 'DimDate'[IsAzureClosedAndCurrentOpen],
        "FY_Rel", 'DimDate'[FY_Rel]
    )
)
```

**Expected:** `MonthStartDate` returns datetime values. If this errors with "column not found", the cached column name has changed — update `schema-mapping.md`.

### 6c — DimViewType

```dax
EVALUATE
SELECTCOLUMNS('DimViewType', "ViewType", 'DimViewType'[ViewType])
```

**Expected:** Should include `"Curated"` as a value.

### 6d — AIO Measures

```dax
EVALUATE
SUMMARIZECOLUMNS(
    FILTER('DimDate', 'DimDate'[IsAzureClosedAndCurrentOpen] = "Y"),
    TREATAS({"Curated"}, 'DimViewType'[ViewType]),
    "m_ACR", 'M_ACR'[$ ACR],
    "m_ACR_LCM", 'M_ACR'[$ ACR Last Closed Month],
    "m_BudgetAttain", 'M_ACRBudget'[% ACR Budget Attain (YTD)]
)
```

**Expected:** Single row, all non-BLANK. If `m_BudgetAttain` is BLANK or near-zero, budget targets may not be loaded in current AIO refresh.

### 6e — AIO Pipeline StrategicPillar (fragile column)

```dax
EVALUATE
TOPN(5,
    SELECTCOLUMNS('F_AzureConsumptionPipe',
        "StrategicPillar", 'F_AzureConsumptionPipe'[StrategicPillar],
        "SolutionPlay", 'F_AzureConsumptionPipe'[SolutionPlay]
    )
)
```

**Expected:** Diverse pillar values. If only 1 distinct value or column not found → QA2 will fail.

### 6f — AzureCustomerAttributes

```dax
EVALUATE
TOPN(3,
    SELECTCOLUMNS('AzureCustomerAttributes',
        "TPID", 'AzureCustomerAttributes'[TPID],
        "ESI_Tier", 'AzureCustomerAttributes'[ESI_Tier],
        "HasOpenAI", 'AzureCustomerAttributes'[HasOpenAI],
        "PTU_Target", 'AzureCustomerAttributes'[PTU_Target_Customer],
        "NetNewMigrationTarget", 'AzureCustomerAttributes'[NetNewMigrationTarget]
    )
)
```

**Expected:** 3 rows with mixed attribute values. If table not found → QA3-ATTR will fail.

---

## Test 7 — HLS Account Count (RLS Validation)

This is the most important RLS check — it validates you can see all 43 HLS SQL600 accounts.

```dax
EVALUATE
SUMMARIZECOLUMNS(
    "HLS_SQL600_Count",
    COUNTROWS(
        FILTER('2) Account',
            '2) Account'[SQL600 Account] = TRUE()
            && '2) Account'[Industry] = "Healthcare"
        )
    ),
    "Total_SQL600_Count",
    COUNTROWS(
        FILTER('2) Account',
            '2) Account'[SQL600 Account] = TRUE()
        )
    )
)
```

| Result | Interpretation |
|---|---|
| HLS = 43, Total = ~251 | ✅ Full access, no RLS restrictions |
| HLS = 43, Total < 251 | ⚠️ Partial RLS — you see HLS but not all industries |
| HLS < 43, Total < 251 | ❌ RLS is filtering HLS accounts — data will be incomplete |
| HLS = 0 | ❌ Complete RLS block on Healthcare industry |

---

## Output Format

Present results as a diagnostic report card:

```
## SQL600 Diagnostic — Auth & Schema
Date: <today>

### Auth
| Model | Status |
|---|---|
| SQL600 | ✅ / ❌ <error> |
| AIO    | ✅ / ❌ <error> |

### RLS Coverage
| Check | Expected | Actual | Status |
|---|---|---|---|
| HLS SQL600 Accounts | 43 | <n> | ✅ / ⚠️ / ❌ |
| Total SQL600 Accounts | ~251 | <n> | ✅ / ⚠️ |

### Schema — SQL600 Model
| Table/Column | Status | Notes |
|---|---|---|
| 1) Calendar | ✅ / ❌ | |
| 2) Account | ✅ / ❌ | |
| 3) Product | ✅ / ❌ | |
| SQL 500 Target List | ✅ / ❌ | |
| ACR → Account → Calendar join | ✅ / ❌ | |
| Pipeline → Account join | ✅ / ❌ | |
| Product → ACR join (pillar) | ✅ / ❌ | |

### Measures — SQL600 Model
| Measure | Value | Status |
|---|---|---|
| <measure_name> | <value or BLANK> | ✅ / ❌ |
...

### Schema — AIO Model
| Table/Column | Status | Notes |
|---|---|---|
...

### Measures — AIO Model
| Measure | Value | Status |
|---|---|---|
...

### Summary
- <total> tests run, <pass> passed, <fail> failed
- Critical failures: <list or "none">
- Recommendations: <action items>
```
