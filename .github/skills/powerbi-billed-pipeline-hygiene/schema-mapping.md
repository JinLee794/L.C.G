# Schema Mapping — MSBilledPipelineCurated

Semantic model `07d916d7-43b6-4d8d-bfa7-5374ffd9c355`. Schema fully resolved — **never call `GetSemanticModelSchema`**. If a column error occurs, update this file manually.

---

## Tables & Key Columns

### Opportunity (dimension)

| Column | Type | Notes |
|---|---|---|
| `Opportunity Name` | Text | |
| `Opportunity ID` | Text | Unique key |
| `CRM Account Name` | Text | |
| `Opportunity Owner` | Text | Microsoft alias |
| `Opportunity Owner Manager` | Text | |
| `MSX Status` | Text | `Open`, `Won`, `Lost`, `N/A` |
| `Sales Stage` | Text | e.g. `1-Listen & Consult` |
| `Sales Stage Code` | Int64 | 1–5 |
| `Days In Sales Stage` | Int64 | |
| `Days in Stage Tranche` | Text | e.g. `120+` |
| `Expected Revenue` | Double | USD |
| `Opportunity Close Date` | DateTime | |
| `Opportunity Due Date` | DateTime | |
| `Opportunity Due Quarter` | Text | e.g. `FY26-Q4` |
| `Forecast Recommendation` | Text | `Committed`, `Committed At Risk`, `UnCommitted`, `UnCommitted Upside` |
| `Forecast Comments` | Text | Free-text |
| `Forecast Comments Modified Date` | DateTime | |
| `Opportunity Modified Date` | DateTime | |
| `Sales Play Solution Area` | Text | |
| `CRM URL` | Text | Deep link to MSX record |
| `Opportunity Age` | Int64 | Days |
| `Opportunity Type` | Text | |
| `Primary Solution Area` | Text | |
| `dimopportunitykey` | Int64 | FK for CROSSFILTER (lowercase 'd') |

### Account (dimension)

| Column | Type | Notes |
|---|---|---|
| `Top Parent` | Text | Account name |
| `TPID` | Text | Account identifier for roster filtering |
| `Area` | Text | Geography |
| `Sales Unit` | Text | e.g. `USA - Healthcare` |
| `Industry` | Text | **Primary vertical scoping column.** HLS = `"Healthcare"` (NOT "Health and Life Sciences"). |

### Calendar (dimension)

| Column | Type | Notes |
|---|---|---|
| `Relative Quarter` | Text | `CQ-1`, `CQ`, `CQ+1`, etc. |
| `Fiscal Quarter` | Text | `FY26-Q2`, `FY26-Q3`, etc. |
| `Fiscal Date` | DateTime | |

### Pipeline (fact)

| Column | Type | Notes |
|---|---|---|
| `DimAccountGeographyHierarchyKey` | Int64 | FK → Account |
| `Dimopportunitykey` | Int64 | FK → Opportunity (capital 'D') |

### Missing Columns (not in model)

| Expected | Workaround |
|---|---|
| Win Probability (%) | Use `Sales Stage Code` proxy or `Forecast Recommendation` |
| Monthly Use | Omit; use `Forecast Comments` as proxy |
| Description | Use `Forecast Comments` as proxy |

---

## Relationship Model

```
Pipeline (fact)
  ├─→ Account (dimension)      via DimAccountGeographyHierarchyKey  [Account→Pipeline, unidirectional]
  └─→ Opportunity (dimension)  via Dimopportunitykey                [Opportunity→Pipeline, unidirectional]

Calendar (dimension) — connects via date keys
```

**Key constraints:**
- Account and Opportunity have **NO direct relationship**. They connect only through Pipeline.
- `RELATED('Account'[...])` inside Opportunity context **will fail**. Never use it.
- Filter propagation: Account→Pipeline ✅ but Pipeline→Opportunity ❌ (unidirectional).
- `Pipeline[OpportunityKey]` does **NOT exist**. The actual FK is `Pipeline[Dimopportunitykey]`.

---

## Scope Filter Patterns

### Known Filter Values

| Column | Value | Vertical | Notes |
|---|---|---|---|
| `'Account'[Industry]` | `Healthcare` | HLS | **Primary HLS filter.** NOT "Health and Life Sciences". |
| `'Account'[Industry]` | `Financial Services` | FSI | |
| `'Account'[Industry]` | `Telecommunications, Media & Gaming` | TMG | |
| `'Account'[Industry]` | `Retail & Consumer Goods` | RCG | |
| `'Account'[Industry]` | `Manufacturing` | MFG | |
| `'Account'[Industry]` | `Energy` | Energy | |
| `'Account'[Industry]` | `Education` | EDU | |
| `'Account'[Industry]` | `Government` | GOV | |
| `'Account'[Industry]` | `Cross-Industry` | Cross | |
| `'Account'[Sales Unit]` | `USA - Healthcare` | HLS | Less precise than Industry. |

> **Discover all values:** `EVALUATE DISTINCT('Account'[Industry])` or `EVALUATE DISTINCT('Account'[Sales Unit])`

### The Core Filtering Problem

Account and Opportunity are both dimensions on the Pipeline fact table. Filters propagate **inward** (dimension→fact) but NOT **across** (dimension→fact→dimension). This means:

- **SUMMARIZECOLUMNS with Account `TREATAS`**: Auto-exist does NOT cross-filter Account→Pipeline→Opportunity. The Account filter is silently ignored — queries return the full unscoped pipeline. **Empirically confirmed April 8, 2026.**
- **SUMMARIZECOLUMNS with Account in `groupBy` + `TREATAS`**: Also fails. Adding `'Account'[Industry]` to groupBy causes fan-out through the bridge AND still does not filter Opportunity rows.

> **⚠️ SUMMARIZECOLUMNS cannot enforce Account scope in this model.** Do not use Account columns in SUMMARIZECOLUMNS queries — neither as TREATAS filters nor as groupBy dimensions. Both fail.

### The Solution: CALCULATETABLE + CROSSFILTER

All scoped queries — both aggregates and detail queries — must use `CALCULATETABLE` with inline `CROSSFILTER` to force bidirectional propagation through the Pipeline bridge.

**Rule 1: Aggregate queries (CALCULATE + CROSSFILTER)**

```dax
-- ✅ CORRECT: CALCULATE with CROSSFILTER for aggregate counts
CALCULATE (
    DISTINCTCOUNT ( 'Opportunity'[Opportunity ID] ),
    TREATAS ( {"Open"}, 'Opportunity'[MSX Status] ),
    TREATAS ( {"FY26-Q3","FY26-Q4","FY27-Q1"}, 'Opportunity'[Opportunity Due Quarter] ),
    TREATAS ( {"Healthcare"}, 'Account'[Industry] ),
    CROSSFILTER ( 'Opportunity'[dimopportunitykey], 'Pipeline'[Dimopportunitykey], BOTH )
)
```

**Rule 2: Detail queries (CALCULATETABLE + CROSSFILTER + SELECTCOLUMNS)**

```dax
-- ✅ CORRECT: CALCULATETABLE with CROSSFILTER for detail rows
EVALUATE
VAR _base =
    CALCULATETABLE (
        'Opportunity',
        TREATAS ( {"Open"}, 'Opportunity'[MSX Status] ),
        TREATAS ( {"FY26-Q3","FY26-Q4","FY27-Q1"}, 'Opportunity'[Opportunity Due Quarter] ),
        TREATAS ( {"Healthcare"}, 'Account'[Industry] ),
        CROSSFILTER ( 'Opportunity'[dimopportunitykey], 'Pipeline'[Dimopportunitykey], BOTH )
    )
VAR _filtered = FILTER ( _base, 'Opportunity'[Days In Sales Stage] > 30 )
RETURN
TOPN (
    25,
    SELECTCOLUMNS (
        _filtered,
        "Opportunity Name", 'Opportunity'[Opportunity Name],
        "Account", 'Opportunity'[CRM Account Name],
        "Owner", 'Opportunity'[Opportunity Owner],
        "Stage", 'Opportunity'[Sales Stage],
        "Days In Stage", 'Opportunity'[Days In Sales Stage],
        "Revenue", 'Opportunity'[Expected Revenue],
        "CRM URL", 'Opportunity'[CRM URL]
    ),
    [Days In Stage], DESC
)
```

**Pattern:**
1. `CALCULATETABLE('Opportunity', ...)` with all filters + CROSSFILTER returns the scoped Opportunity table
2. `FILTER(...)` applies the exception-specific condition
3. `SELECTCOLUMNS(...)` projects only the needed columns
4. `TOPN(...)` limits results

**Unscoped queries may still use SUMMARIZECOLUMNS** — the auto-exist issue only applies when Account-level TREATAS filters are present.

### CROSSFILTER Syntax Rules

- Must be a **direct argument** to `CALCULATE()` or `CALCULATETABLE()` — never assign to a `VAR`
- Column pair: `'Opportunity'[dimopportunitykey]` (lowercase 'd') ↔ `'Pipeline'[Dimopportunitykey]` (capital 'D')
- `Pipeline[OpportunityKey]` does NOT exist — always use `Pipeline[Dimopportunitykey]`

### Alternative: Pre-defined Measures

The semantic model exposes pre-built measures that already handle bridge traversal:

```dax
CALCULATE (
    [Opportunity Count],
    TREATAS ( {"Healthcare"}, 'Account'[Industry] )
)
```

Prefer pre-defined measures over raw DISTINCTCOUNT/SUM when available.

### Bridge Filtering Caveats

The Pipeline bridge creates many-to-many mappings. Even with CROSSFILTER:
- **TPID-based filtering is more precise** than Industry/Sales Unit
- **Post-query sanity check:** Verify Total Opps is in expected range for the scope

---

## Auth Query

Verifies access and resolves fiscal quarter labels in one call:

```dax
EVALUATE
SUMMARIZECOLUMNS (
    'Calendar'[Relative Quarter],
    'Calendar'[Fiscal Quarter],
    FILTER ( 'Calendar', 'Calendar'[Relative Quarter] IN {"CQ-1","CQ","CQ+1"} )
)
ORDER BY 'Calendar'[Relative Quarter] ASC
```

---

## Filter Construction

### Mandatory Filters (always present)

```dax
VAR _statusFilter  = TREATAS ( {"Open"}, 'Opportunity'[MSX Status] )
VAR _quarterFilter = TREATAS ( {"<CQ-1 label>","<CQ label>","<CQ+1 label>"}, 'Opportunity'[Opportunity Due Quarter] )
```

### Scope Filter (when active)

```dax
-- Industry (preferred for vertical scoping):
VAR _scopeFilter = TREATAS ( {"Healthcare"}, 'Account'[Industry] )

-- Sales Unit:
VAR _scopeFilter = TREATAS ( {"USA - Healthcare"}, 'Account'[Sales Unit] )

-- TPID:
VAR _scopeFilter = TREATAS ( {"<tpid1>","<tpid2>"}, 'Account'[TPID] )
```

### CROSSFILTER (required for ALL scoped queries)

```dax
-- Add inline to every CALCULATE / CALCULATETABLE call when scope is active
CROSSFILTER ( 'Opportunity'[dimopportunitykey], 'Pipeline'[Dimopportunitykey], BOTH )
```

---

## Pipeline Overview Query

### Unscoped

```dax
EVALUATE
SUMMARIZECOLUMNS (
    'Opportunity'[Opportunity Due Quarter],
    'Opportunity'[Sales Stage],
    TREATAS ( {"Open"}, 'Opportunity'[MSX Status] ),
    TREATAS ( {"<CQ-1>","<CQ>","<CQ+1>"}, 'Opportunity'[Opportunity Due Quarter] ),
    "Opp Count", DISTINCTCOUNT ( 'Opportunity'[Opportunity ID] ),
    "Pipeline $", SUM ( 'Opportunity'[Expected Revenue] ),
    "Weighted Pipeline", SUMX (
        'Opportunity',
        'Opportunity'[Expected Revenue] *
        SWITCH (
            'Opportunity'[Sales Stage Code],
            1, 0.10, 2, 0.25, 3, 0.50, 4, 0.75, 5, 0.90, BLANK()
        )
    )
)
ORDER BY 'Opportunity'[Opportunity Due Quarter] ASC, 'Opportunity'[Sales Stage] ASC
```

### Scoped (e.g., Healthcare) — CALCULATETABLE pattern

```dax
EVALUATE
VAR _base =
    CALCULATETABLE (
        ADDCOLUMNS (
            SUMMARIZE (
                'Opportunity',
                'Opportunity'[Opportunity Due Quarter],
                'Opportunity'[Sales Stage],
                'Opportunity'[Sales Stage Code]
            ),
            "Opp Count", CALCULATE ( DISTINCTCOUNT ( 'Opportunity'[Opportunity ID] ) ),
            "Pipeline $", CALCULATE ( SUM ( 'Opportunity'[Expected Revenue] ) ),
            "Weighted Pipeline", CALCULATE (
                SUMX (
                    'Opportunity',
                    'Opportunity'[Expected Revenue] *
                    SWITCH (
                        'Opportunity'[Sales Stage Code],
                        1, 0.10, 2, 0.25, 3, 0.50, 4, 0.75, 5, 0.90, BLANK()
                    )
                )
            )
        ),
        TREATAS ( {"Open"}, 'Opportunity'[MSX Status] ),
        TREATAS ( {"<CQ-1>","<CQ>","<CQ+1>"}, 'Opportunity'[Opportunity Due Quarter] ),
        TREATAS ( {"Healthcare"}, 'Account'[Industry] ),
        CROSSFILTER ( 'Opportunity'[dimopportunitykey], 'Pipeline'[Dimopportunitykey], BOTH )
    )
RETURN _base
ORDER BY 'Opportunity'[Opportunity Due Quarter] ASC, 'Opportunity'[Sales Stage Code] ASC
```

---

## Weighted Pipeline (Stage-Code Proxy)

No explicit win probability exists. Use this mapping:

| Stage Code | Stage Name | Proxy Probability |
|---|---|---|
| 1 | 1-Listen & Consult | 10% |
| 2 | 2-Inspire & Design | 25% |
| 3 | 3-Empower & Achieve | 50% |
| 4 | 4-Realize Value | 75% |
| 5 | 5-Manage & Optimize | 90% |

---

## Combined Snapshot Query (Step 1 — single call)

> **This replaces the separate Auth Query, Pipeline Overview Query, and Aggregate Query (from exception-rules.md).** One `ExecuteQuery` call returns three result sets.

The PBI REST API `ExecuteQuery` endpoint supports multiple `EVALUATE` statements in a single request. Use this to return CQ labels, pipeline overview, and aggregate exception counts in one round trip.

### Scoped (e.g., Healthcare) — always use this variant

```dax
-- Result Set 1: CQ Label Resolution (also serves as auth check)
EVALUATE
SUMMARIZECOLUMNS (
    'Calendar'[Relative Quarter],
    'Calendar'[Fiscal Quarter],
    FILTER ( 'Calendar', 'Calendar'[Relative Quarter] IN {"CQ-1","CQ","CQ+1"} )
)
ORDER BY 'Calendar'[Relative Quarter] ASC

-- Result Set 2: Pipeline Overview by Quarter × Stage
EVALUATE
VAR _base =
    CALCULATETABLE (
        ADDCOLUMNS (
            SUMMARIZE (
                'Opportunity',
                'Opportunity'[Opportunity Due Quarter],
                'Opportunity'[Sales Stage],
                'Opportunity'[Sales Stage Code]
            ),
            "Opp Count", CALCULATE ( DISTINCTCOUNT ( 'Opportunity'[Opportunity ID] ) ),
            "Pipeline $", CALCULATE ( SUM ( 'Opportunity'[Expected Revenue] ) ),
            "Weighted Pipeline", CALCULATE (
                SUMX (
                    'Opportunity',
                    'Opportunity'[Expected Revenue] *
                    SWITCH (
                        'Opportunity'[Sales Stage Code],
                        1, 0.10, 2, 0.25, 3, 0.50, 4, 0.75, 5, 0.90, BLANK()
                    )
                )
            )
        ),
        TREATAS ( {"Open"}, 'Opportunity'[MSX Status] ),
        TREATAS ( {"<CQ-1>","<CQ>","<CQ+1>"}, 'Opportunity'[Opportunity Due Quarter] ),
        TREATAS ( {"<scope_value>"}, '<scope_column>' ),
        CROSSFILTER ( 'Opportunity'[dimopportunitykey], 'Pipeline'[Dimopportunitykey], BOTH )
    )
RETURN _base
ORDER BY 'Opportunity'[Opportunity Due Quarter] ASC, 'Opportunity'[Sales Stage Code] ASC

-- Result Set 3: Aggregate Exception Counts
EVALUATE
VAR _statusFilter  = TREATAS ( {"Open"}, 'Opportunity'[MSX Status] )
VAR _quarterFilter = TREATAS ( {"<CQ-1>","<CQ>","<CQ+1>"}, 'Opportunity'[Opportunity Due Quarter] )
VAR _scopeFilter   = TREATAS ( {"<scope_value>"}, '<scope_column>' )
RETURN
ROW (
  "Total Opps",
    CALCULATE ( DISTINCTCOUNT ( 'Opportunity'[Opportunity ID] ),
      _statusFilter, _quarterFilter, _scopeFilter,
      CROSSFILTER ( 'Opportunity'[dimopportunitykey], 'Pipeline'[Dimopportunitykey], BOTH ) ),
  "Total Pipeline",
    CALCULATE ( SUM ( 'Opportunity'[Expected Revenue] ),
      _statusFilter, _quarterFilter, _scopeFilter,
      CROSSFILTER ( 'Opportunity'[dimopportunitykey], 'Pipeline'[Dimopportunitykey], BOTH ) ),
  "Stale >30d",
    CALCULATE ( DISTINCTCOUNT ( 'Opportunity'[Opportunity ID] ),
      _statusFilter, _quarterFilter, _scopeFilter,
      CROSSFILTER ( 'Opportunity'[dimopportunitykey], 'Pipeline'[Dimopportunitykey], BOTH ),
      FILTER ( VALUES ( 'Opportunity'[Days In Sales Stage] ),
        'Opportunity'[Days In Sales Stage] > 30 ) ),
  "Stale >60d",
    CALCULATE ( DISTINCTCOUNT ( 'Opportunity'[Opportunity ID] ),
      _statusFilter, _quarterFilter, _scopeFilter,
      CROSSFILTER ( 'Opportunity'[dimopportunitykey], 'Pipeline'[Dimopportunitykey], BOTH ),
      FILTER ( VALUES ( 'Opportunity'[Days In Sales Stage] ),
        'Opportunity'[Days In Sales Stage] > 60 ) ),
  "Past Due Close",
    CALCULATE ( DISTINCTCOUNT ( 'Opportunity'[Opportunity ID] ),
      _statusFilter, _quarterFilter, _scopeFilter,
      CROSSFILTER ( 'Opportunity'[dimopportunitykey], 'Pipeline'[Dimopportunitykey], BOTH ),
      FILTER ( VALUES ( 'Opportunity'[Opportunity Close Date] ),
        NOT ISBLANK ( 'Opportunity'[Opportunity Close Date] )
          && 'Opportunity'[Opportunity Close Date] < TODAY () ) ),
  "Close <=14d",
    CALCULATE ( DISTINCTCOUNT ( 'Opportunity'[Opportunity ID] ),
      _statusFilter, _quarterFilter, _scopeFilter,
      CROSSFILTER ( 'Opportunity'[dimopportunitykey], 'Pipeline'[Dimopportunitykey], BOTH ),
      FILTER ( VALUES ( 'Opportunity'[Opportunity Close Date] ),
        NOT ISBLANK ( 'Opportunity'[Opportunity Close Date] )
          && 'Opportunity'[Opportunity Close Date] <= TODAY () + 14 ) ),
  "Missing Fields",
    CALCULATE ( DISTINCTCOUNT ( 'Opportunity'[Opportunity ID] ),
      _statusFilter, _quarterFilter, _scopeFilter,
      CROSSFILTER ( 'Opportunity'[dimopportunitykey], 'Pipeline'[Dimopportunitykey], BOTH ),
      FILTER ( VALUES ( 'Opportunity'[Opportunity ID] ),
        VAR _spa = CALCULATE ( MAX ( 'Opportunity'[Sales Play Solution Area] ) )
        VAR _fc  = CALCULATE ( MAX ( 'Opportunity'[Forecast Comments] ) )
        RETURN ISBLANK ( _spa ) || TRIM ( _spa ) = ""
            || ISBLANK ( _fc )  || TRIM ( _fc )  = "" ) ),
  "High Value >=500K",
    CALCULATE ( DISTINCTCOUNT ( 'Opportunity'[Opportunity ID] ),
      _statusFilter, _quarterFilter, _scopeFilter,
      CROSSFILTER ( 'Opportunity'[dimopportunitykey], 'Pipeline'[Dimopportunitykey], BOTH ),
      FILTER ( VALUES ( 'Opportunity'[Expected Revenue] ),
        'Opportunity'[Expected Revenue] >= 500000 ) ),
  "Stage Inflation",
    CALCULATE ( DISTINCTCOUNT ( 'Opportunity'[Opportunity ID] ),
      _statusFilter, _quarterFilter, _scopeFilter,
      CROSSFILTER ( 'Opportunity'[dimopportunitykey], 'Pipeline'[Dimopportunitykey], BOTH ),
      FILTER ( VALUES ( 'Opportunity'[Sales Stage Code] ),
        'Opportunity'[Sales Stage Code] >= 3 ),
      FILTER ( VALUES ( 'Opportunity'[Forecast Recommendation] ),
        'Opportunity'[Forecast Recommendation]
          IN {"UnCommitted", "UnCommitted Upside", "Committed At Risk"} ) )
)
```

### Template Substitution

| Placeholder | Source |
|---|---|
| `<CQ-1>`, `<CQ>`, `<CQ+1>` | Fiscal quarter labels — use literals for Result Sets 2 & 3 since Result Set 1 resolves them. **On first run, use the Relative Quarter names directly** in Result Set 1, then substitute resolved labels into Sets 2 & 3. If multi-EVALUATE is supported with shared resolution, use the same literals across all three. |
| `<scope_column>` | `'Account'[Industry]`, `'Account'[Sales Unit]`, or `'Account'[TPID]` per Step 0 |
| `<scope_value>` | Resolved filter value (e.g., `Healthcare`) |

### Fallback: Sequential Execution

If the PBI REST API does not support multiple `EVALUATE` statements in a single call, execute them as **three sequential `ExecuteQuery` calls** using the same queries. This is the degraded path — still better than the original 3+ calls because the DAX is pre-built (no schema discovery).

> **⚠️ Important:** The CQ labels from Result Set 1 must be substituted into Result Sets 2 & 3 before execution. If running sequentially, execute Set 1 first, extract labels, then execute Sets 2 & 3 (which can run in parallel if the API supports concurrent requests).
