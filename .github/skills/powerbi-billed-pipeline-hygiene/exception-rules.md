# Exception Detection Rules

Five exception queries run against open opportunities in CQ-1/CQ/CQ+1. All inherit mandatory filters from [schema-mapping.md](schema-mapping.md).

---

## Scope Filtering in Exception Queries

Every query below has two variants: **unscoped** and **scoped**.

**Unscoped:** Uses `SUMMARIZECOLUMNS` with `TREATAS` filters on Opportunity columns only.

**Scoped:** Uses `CALCULATETABLE` + `CROSSFILTER` for detail queries, and `CALCULATE` + `CROSSFILTER` for aggregate queries. This is required because `SUMMARIZECOLUMNS` **cannot** enforce Account-level scope through the Pipeline bridge — the filter is silently ignored.

> **Why not SUMMARIZECOLUMNS for scoped queries?** Account and Opportunity are both dimensions on the Pipeline fact table. Auto-exist in SUMMARIZECOLUMNS does not propagate Account filters across the fact table to Opportunity. Adding Account columns to `groupBy` causes fan-out without fixing the filter. Only `CROSSFILTER` (via CALCULATE/CALCULATETABLE) forces bidirectional propagation. Empirically confirmed April 8, 2026.

> **CROSSFILTER syntax:**
> - Must be a **direct argument** to `CALCULATE()` / `CALCULATETABLE()` — never assign to a `VAR`
> - Column pair: `'Opportunity'[dimopportunitykey]` (lowercase 'd') ↔ `'Pipeline'[Dimopportunitykey]` (capital 'D')
> - `Pipeline[OpportunityKey]` does NOT exist

---

## Aggregate Query (legacy Step 3.5 — now part of Step 1 Combined Snapshot)

> **These individual queries are retained for reference and fallback.** The optimized flow uses the Combined Snapshot Query (schema-mapping.md § Combined Snapshot Query) which includes these counts. Only use these standalone queries if the combined query fails.

Returns all exception counts in one call. **Skip any detail query (4a–4e) whose count is 0.**

### Unscoped

```dax
EVALUATE
VAR _statusFilter  = TREATAS ( {"Open"}, 'Opportunity'[MSX Status] )
VAR _quarterFilter = TREATAS ( {"<CQ-1>","<CQ>","<CQ+1>"}, 'Opportunity'[Opportunity Due Quarter] )
RETURN
ROW (
  "Total Opps",
    CALCULATE ( DISTINCTCOUNT ( 'Opportunity'[Opportunity ID] ),
      _statusFilter, _quarterFilter ),
  "Total Pipeline",
    CALCULATE ( SUM ( 'Opportunity'[Expected Revenue] ),
      _statusFilter, _quarterFilter ),
  "Stale >30d",
    CALCULATE ( DISTINCTCOUNT ( 'Opportunity'[Opportunity ID] ),
      _statusFilter, _quarterFilter,
      FILTER ( VALUES ( 'Opportunity'[Days In Sales Stage] ),
        'Opportunity'[Days In Sales Stage] > 30 ) ),
  "Stale >60d",
    CALCULATE ( DISTINCTCOUNT ( 'Opportunity'[Opportunity ID] ),
      _statusFilter, _quarterFilter,
      FILTER ( VALUES ( 'Opportunity'[Days In Sales Stage] ),
        'Opportunity'[Days In Sales Stage] > 60 ) ),
  "Past Due Close",
    CALCULATE ( DISTINCTCOUNT ( 'Opportunity'[Opportunity ID] ),
      _statusFilter, _quarterFilter,
      FILTER ( VALUES ( 'Opportunity'[Opportunity Close Date] ),
        NOT ISBLANK ( 'Opportunity'[Opportunity Close Date] )
          && 'Opportunity'[Opportunity Close Date] < TODAY () ) ),
  "Close <=14d",
    CALCULATE ( DISTINCTCOUNT ( 'Opportunity'[Opportunity ID] ),
      _statusFilter, _quarterFilter,
      FILTER ( VALUES ( 'Opportunity'[Opportunity Close Date] ),
        NOT ISBLANK ( 'Opportunity'[Opportunity Close Date] )
          && 'Opportunity'[Opportunity Close Date] <= TODAY () + 14 ) ),
  "Missing Fields",
    CALCULATE ( DISTINCTCOUNT ( 'Opportunity'[Opportunity ID] ),
      _statusFilter, _quarterFilter,
      FILTER ( VALUES ( 'Opportunity'[Opportunity ID] ),
        VAR _spa = CALCULATE ( MAX ( 'Opportunity'[Sales Play Solution Area] ) )
        VAR _fc  = CALCULATE ( MAX ( 'Opportunity'[Forecast Comments] ) )
        RETURN ISBLANK ( _spa ) || TRIM ( _spa ) = ""
            || ISBLANK ( _fc )  || TRIM ( _fc )  = "" ) ),
  "High Value >=500K",
    CALCULATE ( DISTINCTCOUNT ( 'Opportunity'[Opportunity ID] ),
      _statusFilter, _quarterFilter,
      FILTER ( VALUES ( 'Opportunity'[Expected Revenue] ),
        'Opportunity'[Expected Revenue] >= 500000 ) ),
  "Stage Inflation",
    CALCULATE ( DISTINCTCOUNT ( 'Opportunity'[Opportunity ID] ),
      _statusFilter, _quarterFilter,
      FILTER ( VALUES ( 'Opportunity'[Sales Stage Code] ),
        'Opportunity'[Sales Stage Code] >= 3 ),
      FILTER ( VALUES ( 'Opportunity'[Forecast Recommendation] ),
        'Opportunity'[Forecast Recommendation]
          IN {"UnCommitted", "UnCommitted Upside", "Committed At Risk"} ) )
)
```

### Scoped (e.g., Healthcare)

Add `_scopeFilter` + inline `CROSSFILTER` to **every** `CALCULATE` call:

```dax
EVALUATE
VAR _statusFilter  = TREATAS ( {"Open"}, 'Opportunity'[MSX Status] )
VAR _quarterFilter = TREATAS ( {"<CQ-1>","<CQ>","<CQ+1>"}, 'Opportunity'[Opportunity Due Quarter] )
VAR _scopeFilter   = TREATAS ( {"Healthcare"}, 'Account'[Industry] )
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

> **Alternative:** If CROSSFILTER fails, use pre-defined measures:
> ```dax
> CALCULATE ( [Opportunity Count], _statusFilter, _quarterFilter, _scopeFilter )
> ```

> **Skip logic:** `Stale >30d` = 0 → skip 4a. `Close <=14d` = 0 → skip 4b. `Missing Fields` = 0 → skip 4c. `High Value >=500K` = 0 → skip 4d. `Stage Inflation` = 0 → skip 4e.

---

## 4a. Stage Staleness

Opportunities stuck >30 days in current stage.

| Parameter | Value |
|---|---|
| Filter | `Days In Sales Stage > 30` |
| Sort | `Days In Sales Stage DESC` |
| Limit | Top 25 |

**Last Activity Date** — prefer `Forecast Comments Modified Date`; fall back to `Opportunity Modified Date`.

### Unscoped

```dax
EVALUATE
VAR _Results =
  SUMMARIZECOLUMNS (
    'Opportunity'[Opportunity Name],
    'Opportunity'[CRM Account Name],
    'Opportunity'[Opportunity Owner],
    'Opportunity'[Sales Stage],
    'Opportunity'[Days In Sales Stage],
    'Opportunity'[Forecast Comments Modified Date],
    'Opportunity'[Opportunity Modified Date],
    'Opportunity'[Expected Revenue],
    'Opportunity'[CRM URL],
    TREATAS ( {"Open"}, 'Opportunity'[MSX Status] ),
    TREATAS ( {"<CQ-1>","<CQ>","<CQ+1>"}, 'Opportunity'[Opportunity Due Quarter] ),
    FILTER ( VALUES ( 'Opportunity'[Days In Sales Stage] ), 'Opportunity'[Days In Sales Stage] > 30 )
  )
RETURN TOPN ( 25, _Results, [Days In Sales Stage], DESC )
ORDER BY [Days In Sales Stage] DESC
```

### Scoped (e.g., Healthcare)

```dax
EVALUATE
VAR _base =
    CALCULATETABLE (
        'Opportunity',
        TREATAS ( {"Open"}, 'Opportunity'[MSX Status] ),
        TREATAS ( {"<CQ-1>","<CQ>","<CQ+1>"}, 'Opportunity'[Opportunity Due Quarter] ),
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
        "Last Activity", 'Opportunity'[Forecast Comments Modified Date],
        "Last Modified", 'Opportunity'[Opportunity Modified Date],
        "Revenue", 'Opportunity'[Expected Revenue],
        "CRM URL", 'Opportunity'[CRM URL]
    ),
    [Days In Stage], DESC
)
ORDER BY [Days In Stage] DESC
```

---

## 4b. Close-Date Drift

Opportunities with close date past due or within 14 days.

| Parameter | Value |
|---|---|
| Filter | `Opportunity Close Date` not blank AND `<= TODAY() + 14` |
| Sort | `Opportunity Close Date ASC` |
| Limit | Top 25 |

### Unscoped

```dax
EVALUATE
VAR _Results =
  SUMMARIZECOLUMNS (
    'Opportunity'[Opportunity Name],
    'Opportunity'[CRM Account Name],
    'Opportunity'[Opportunity Owner],
    'Opportunity'[Opportunity Close Date],
    'Opportunity'[Sales Stage],
    'Opportunity'[Expected Revenue],
    'Opportunity'[Days In Sales Stage],
    'Opportunity'[Forecast Recommendation],
    'Opportunity'[CRM URL],
    TREATAS ( {"Open"}, 'Opportunity'[MSX Status] ),
    TREATAS ( {"<CQ-1>","<CQ>","<CQ+1>"}, 'Opportunity'[Opportunity Due Quarter] ),
    FILTER ( VALUES ( 'Opportunity'[Opportunity Close Date] ),
      NOT ISBLANK ( 'Opportunity'[Opportunity Close Date] )
        && 'Opportunity'[Opportunity Close Date] <= TODAY () + 14 )
  )
RETURN TOPN ( 25, _Results, [Opportunity Close Date], ASC )
ORDER BY [Opportunity Close Date] ASC
```

### Scoped (e.g., Healthcare)

```dax
EVALUATE
VAR _base =
    CALCULATETABLE (
        'Opportunity',
        TREATAS ( {"Open"}, 'Opportunity'[MSX Status] ),
        TREATAS ( {"<CQ-1>","<CQ>","<CQ+1>"}, 'Opportunity'[Opportunity Due Quarter] ),
        TREATAS ( {"Healthcare"}, 'Account'[Industry] ),
        CROSSFILTER ( 'Opportunity'[dimopportunitykey], 'Pipeline'[Dimopportunitykey], BOTH )
    )
VAR _filtered = FILTER ( _base,
    NOT ISBLANK ( 'Opportunity'[Opportunity Close Date] )
      && 'Opportunity'[Opportunity Close Date] <= TODAY () + 14 )
RETURN
TOPN (
    25,
    SELECTCOLUMNS (
        _filtered,
        "Opportunity Name", 'Opportunity'[Opportunity Name],
        "Account", 'Opportunity'[CRM Account Name],
        "Owner", 'Opportunity'[Opportunity Owner],
        "Close Date", 'Opportunity'[Opportunity Close Date],
        "Stage", 'Opportunity'[Sales Stage],
        "Revenue", 'Opportunity'[Expected Revenue],
        "Days In Stage", 'Opportunity'[Days In Sales Stage],
        "Forecast", 'Opportunity'[Forecast Recommendation],
        "CRM URL", 'Opportunity'[CRM URL]
    ),
    [Close Date], ASC
)
ORDER BY [Close Date] ASC
```

---

## 4c. Missing Required Fields

Opportunities missing Sales Play Solution Area or Forecast Comments.

| Parameter | Value |
|---|---|
| Filter | `Sales Play Solution Area` blank OR `Forecast Comments` blank |
| Sort | `Expected Revenue DESC` |
| Limit | Top 25 |

### Unscoped

```dax
DEFINE
  VAR _Base =
    SUMMARIZECOLUMNS (
      'Opportunity'[Opportunity Name],
      'Opportunity'[CRM Account Name],
      'Opportunity'[Opportunity Owner],
      'Opportunity'[Sales Stage],
      'Opportunity'[Expected Revenue],
      'Opportunity'[Sales Play Solution Area],
      'Opportunity'[Forecast Comments],
      'Opportunity'[CRM URL],
      TREATAS ( {"Open"}, 'Opportunity'[MSX Status] ),
      TREATAS ( {"<CQ-1>","<CQ>","<CQ+1>"}, 'Opportunity'[Opportunity Due Quarter] )
    )
  VAR _Missing =
    FILTER ( _Base,
      ISBLANK ( [Sales Play Solution Area] ) || TRIM ( [Sales Play Solution Area] ) = ""
      || ISBLANK ( [Forecast Comments] ) || TRIM ( [Forecast Comments] ) = "" )
EVALUATE TOPN ( 25, _Missing, [Expected Revenue], DESC )
ORDER BY [Expected Revenue] DESC
```

### Scoped (e.g., Healthcare)

```dax
EVALUATE
VAR _base =
    CALCULATETABLE (
        'Opportunity',
        TREATAS ( {"Open"}, 'Opportunity'[MSX Status] ),
        TREATAS ( {"<CQ-1>","<CQ>","<CQ+1>"}, 'Opportunity'[Opportunity Due Quarter] ),
        TREATAS ( {"Healthcare"}, 'Account'[Industry] ),
        CROSSFILTER ( 'Opportunity'[dimopportunitykey], 'Pipeline'[Dimopportunitykey], BOTH )
    )
VAR _filtered = FILTER ( _base,
    ISBLANK ( 'Opportunity'[Sales Play Solution Area] )
      || TRIM ( 'Opportunity'[Sales Play Solution Area] ) = ""
      || ISBLANK ( 'Opportunity'[Forecast Comments] )
      || TRIM ( 'Opportunity'[Forecast Comments] ) = "" )
RETURN
TOPN (
    25,
    SELECTCOLUMNS (
        _filtered,
        "Opportunity Name", 'Opportunity'[Opportunity Name],
        "Account", 'Opportunity'[CRM Account Name],
        "Owner", 'Opportunity'[Opportunity Owner],
        "Stage", 'Opportunity'[Sales Stage],
        "Revenue", 'Opportunity'[Expected Revenue],
        "Sales Play", 'Opportunity'[Sales Play Solution Area],
        "Forecast Comments", 'Opportunity'[Forecast Comments],
        "CRM URL", 'Opportunity'[CRM URL]
    ),
    [Revenue], DESC
)
ORDER BY [Revenue] DESC
```

---

## 4d. High-Value Concentration Risk

Opportunities >= $500K to identify concentration exposure.

| Parameter | Value |
|---|---|
| Filter | `Expected Revenue >= 500000` |
| Sort | `Expected Revenue DESC` |
| Limit | Top 20 |

**Concentration flag:** If any single opp exceeds 30% of total pipeline (from Step 1 snapshot), flag as HIGH.

### Unscoped

```dax
EVALUATE
VAR _Results =
  SUMMARIZECOLUMNS (
    'Opportunity'[Opportunity Name],
    'Opportunity'[CRM Account Name],
    'Opportunity'[Opportunity Owner],
    'Opportunity'[Sales Stage],
    'Opportunity'[Expected Revenue],
    'Opportunity'[Opportunity Close Date],
    'Opportunity'[CRM URL],
    TREATAS ( {"Open"}, 'Opportunity'[MSX Status] ),
    TREATAS ( {"<CQ-1>","<CQ>","<CQ+1>"}, 'Opportunity'[Opportunity Due Quarter] ),
    FILTER ( VALUES ( 'Opportunity'[Expected Revenue] ), 'Opportunity'[Expected Revenue] >= 500000 )
  )
RETURN TOPN ( 20, _Results, [Expected Revenue], DESC )
ORDER BY [Expected Revenue] DESC
```

### Scoped (e.g., Healthcare)

```dax
EVALUATE
VAR _base =
    CALCULATETABLE (
        'Opportunity',
        TREATAS ( {"Open"}, 'Opportunity'[MSX Status] ),
        TREATAS ( {"<CQ-1>","<CQ>","<CQ+1>"}, 'Opportunity'[Opportunity Due Quarter] ),
        TREATAS ( {"Healthcare"}, 'Account'[Industry] ),
        CROSSFILTER ( 'Opportunity'[dimopportunitykey], 'Pipeline'[Dimopportunitykey], BOTH )
    )
VAR _filtered = FILTER ( _base, 'Opportunity'[Expected Revenue] >= 500000 )
RETURN
TOPN (
    20,
    SELECTCOLUMNS (
        _filtered,
        "Opportunity Name", 'Opportunity'[Opportunity Name],
        "Account", 'Opportunity'[CRM Account Name],
        "Owner", 'Opportunity'[Opportunity Owner],
        "Stage", 'Opportunity'[Sales Stage],
        "Revenue", 'Opportunity'[Expected Revenue],
        "Close Date", 'Opportunity'[Opportunity Close Date],
        "CRM URL", 'Opportunity'[CRM URL]
    ),
    [Revenue], DESC
)
ORDER BY [Revenue] DESC
```

---

## 4e. Stage Inflation / Win Probability Mismatch

Stage 3+ opportunities with at-risk or uncommitted forecast recommendation.

| Parameter | Value |
|---|---|
| Filter | `Sales Stage Code >= 3` AND `Forecast Recommendation IN {"UnCommitted", "UnCommitted Upside", "Committed At Risk"}` |
| Sort | `Sales Stage Code DESC, Expected Revenue DESC` |
| Limit | Top 20 |

### Unscoped

```dax
EVALUATE
VAR _Results =
  SUMMARIZECOLUMNS (
    'Opportunity'[Opportunity Name],
    'Opportunity'[CRM Account Name],
    'Opportunity'[Opportunity Owner],
    'Opportunity'[Sales Stage],
    'Opportunity'[Sales Stage Code],
    'Opportunity'[Forecast Recommendation],
    'Opportunity'[Expected Revenue],
    'Opportunity'[Days In Sales Stage],
    'Opportunity'[CRM URL],
    TREATAS ( {"Open"}, 'Opportunity'[MSX Status] ),
    TREATAS ( {"<CQ-1>","<CQ>","<CQ+1>"}, 'Opportunity'[Opportunity Due Quarter] ),
    FILTER ( VALUES ( 'Opportunity'[Sales Stage Code] ), 'Opportunity'[Sales Stage Code] >= 3 ),
    FILTER ( VALUES ( 'Opportunity'[Forecast Recommendation] ),
      'Opportunity'[Forecast Recommendation] IN {"UnCommitted", "UnCommitted Upside", "Committed At Risk"} )
  )
RETURN TOPN ( 20, _Results, [Sales Stage Code], DESC, [Expected Revenue], DESC )
ORDER BY [Sales Stage Code] DESC, [Expected Revenue] DESC
```

### Scoped (e.g., Healthcare)

```dax
EVALUATE
VAR _base =
    CALCULATETABLE (
        'Opportunity',
        TREATAS ( {"Open"}, 'Opportunity'[MSX Status] ),
        TREATAS ( {"<CQ-1>","<CQ>","<CQ+1>"}, 'Opportunity'[Opportunity Due Quarter] ),
        TREATAS ( {"Healthcare"}, 'Account'[Industry] ),
        CROSSFILTER ( 'Opportunity'[dimopportunitykey], 'Pipeline'[Dimopportunitykey], BOTH )
    )
VAR _filtered = FILTER ( _base,
    'Opportunity'[Sales Stage Code] >= 3
      && 'Opportunity'[Forecast Recommendation]
           IN {"UnCommitted", "UnCommitted Upside", "Committed At Risk"} )
RETURN
TOPN (
    20,
    SELECTCOLUMNS (
        _filtered,
        "Opportunity Name", 'Opportunity'[Opportunity Name],
        "Account", 'Opportunity'[CRM Account Name],
        "Owner", 'Opportunity'[Opportunity Owner],
        "Stage", 'Opportunity'[Sales Stage],
        "Stage Code", 'Opportunity'[Sales Stage Code],
        "Forecast", 'Opportunity'[Forecast Recommendation],
        "Revenue", 'Opportunity'[Expected Revenue],
        "Days In Stage", 'Opportunity'[Days In Sales Stage],
        "CRM URL", 'Opportunity'[CRM URL]
    ),
    [Stage Code], DESC, [Revenue], DESC
)
ORDER BY [Stage Code] DESC, [Revenue] DESC
```

---

## Severity Assignment

| Condition | Severity |
|---|---|
| Past-due close date + Stage 3+ + value >= $500K | 🔴 CRITICAL |
| Past-due close date OR stage stale > 60 days | 🟡 HIGH |
| Close date <= 14 days with at-risk/uncommitted forecast | 🟡 HIGH |
| High-value concentration (>30% of pipeline in 1 opp) | 🟡 HIGH |
| Missing required fields on any active opp | 🟠 MEDIUM |
| Stage inflation (Stage 3+ with at-risk forecast) | 🟠 MEDIUM |

---

## Combined Detail Query (Step 2 — single call)

> **This replaces the separate 4a–4e detail queries.** One `CALCULATETABLE` base pull + exception-type tagging returns all flagged opportunities in one `ExecuteQuery` call.

### Design

All five exception types share the **identical** base filter (`TREATAS` + `CROSSFILTER` for status, quarter, and scope). The only differences are the per-exception `FILTER` conditions and the output columns. By pulling the full scoped opportunity set once and tagging each row with boolean exception flags, we avoid 5 redundant `CALCULATETABLE` evaluations.

### Skip Logic

Before constructing this query, check the aggregate counts from Step 1. **Only include exception types with non-zero counts.** Remove the corresponding boolean flag and FILTER condition for any zero-count type. If ALL counts are zero, skip this query entirely.

### Scoped (e.g., Healthcare)

```dax
EVALUATE
VAR _base =
    CALCULATETABLE (
        'Opportunity',
        TREATAS ( {"Open"}, 'Opportunity'[MSX Status] ),
        TREATAS ( {"<CQ-1>","<CQ>","<CQ+1>"}, 'Opportunity'[Opportunity Due Quarter] ),
        TREATAS ( {"Healthcare"}, 'Account'[Industry] ),
        CROSSFILTER ( 'Opportunity'[dimopportunitykey], 'Pipeline'[Dimopportunitykey], BOTH )
    )
VAR _tagged =
    ADDCOLUMNS (
        _base,
        "Is Stale",        'Opportunity'[Days In Sales Stage] > 30,
        "Is Close Drift",  NOT ISBLANK ( 'Opportunity'[Opportunity Close Date] )
                             && 'Opportunity'[Opportunity Close Date] <= TODAY () + 14,
        "Is Past Due",     NOT ISBLANK ( 'Opportunity'[Opportunity Close Date] )
                             && 'Opportunity'[Opportunity Close Date] < TODAY (),
        "Is Missing Fields",
            ISBLANK ( 'Opportunity'[Sales Play Solution Area] )
              || TRIM ( 'Opportunity'[Sales Play Solution Area] ) = ""
              || ISBLANK ( 'Opportunity'[Forecast Comments] )
              || TRIM ( 'Opportunity'[Forecast Comments] ) = "",
        "Is High Value",   'Opportunity'[Expected Revenue] >= 500000,
        "Is Stage Inflation",
            'Opportunity'[Sales Stage Code] >= 3
              && 'Opportunity'[Forecast Recommendation]
                   IN {"UnCommitted", "UnCommitted Upside", "Committed At Risk"}
    )
VAR _flagged = FILTER ( _tagged,
    [Is Stale] || [Is Close Drift] || [Is Missing Fields]
      || [Is High Value] || [Is Stage Inflation] )
VAR _scored =
    ADDCOLUMNS (
        _flagged,
        "Severity Score",
            -- CRITICAL: past-due + stage 3+ + high value
            IF ( [Is Past Due] && 'Opportunity'[Sales Stage Code] >= 3
                   && 'Opportunity'[Expected Revenue] >= 500000, 100,
            -- HIGH: past-due OR stale >60d OR close drift with at-risk
            IF ( [Is Past Due]
                   || 'Opportunity'[Days In Sales Stage] > 60
                   || ( [Is Close Drift] && [Is Stage Inflation] ), 80,
            -- MEDIUM: everything else flagged
            50 ) )
    )
RETURN
TOPN (
    50,
    SELECTCOLUMNS (
        _scored,
        "Opportunity Name", 'Opportunity'[Opportunity Name],
        "Opportunity ID", 'Opportunity'[Opportunity ID],
        "Account", 'Opportunity'[CRM Account Name],
        "Owner", 'Opportunity'[Opportunity Owner],
        "Stage", 'Opportunity'[Sales Stage],
        "Stage Code", 'Opportunity'[Sales Stage Code],
        "Days In Stage", 'Opportunity'[Days In Sales Stage],
        "Revenue", 'Opportunity'[Expected Revenue],
        "Close Date", 'Opportunity'[Opportunity Close Date],
        "Forecast", 'Opportunity'[Forecast Recommendation],
        "Sales Play", 'Opportunity'[Sales Play Solution Area],
        "Last Activity", 'Opportunity'[Forecast Comments Modified Date],
        "CRM URL", 'Opportunity'[CRM URL],
        "Is Stale", [Is Stale],
        "Is Close Drift", [Is Close Drift],
        "Is Past Due", [Is Past Due],
        "Is Missing Fields", [Is Missing Fields],
        "Is High Value", [Is High Value],
        "Is Stage Inflation", [Is Stage Inflation],
        "Severity Score", [Severity Score]
    ),
    [Severity Score], DESC, [Revenue], DESC
)
ORDER BY [Severity Score] DESC, [Revenue] DESC
```

### How to read the results

Each row is a unique opportunity tagged with boolean flags for every applicable exception type. A single opportunity can appear with multiple flags (e.g., `Is Stale = TRUE` AND `Is High Value = TRUE`).

**Severity assignment:**
- **🔴 CRITICAL** (Score 100): `Is Past Due = TRUE` AND `Stage Code >= 3` AND `Revenue >= 500K`
- **🟡 HIGH** (Score 80): `Is Past Due = TRUE` OR `Days In Stage > 60` OR (`Is Close Drift = TRUE` AND `Is Stage Inflation = TRUE`)
- **🟠 MEDIUM** (Score 50): All other flagged rows

**Grouping for output:** The parent agent groups rows by severity tier for the vault note. Each row includes enough columns to populate any exception-type table in the output template.

### Template Substitution

Same placeholders as the Combined Snapshot Query:

| Placeholder | Source |
|---|---|
| `<CQ-1>`, `<CQ>`, `<CQ+1>` | Resolved fiscal quarter labels from Step 1 Result Set 1 |
| `Healthcare` / `'Account'[Industry]` | Scope filter from Step 0 — substitute the actual column and value |

### Row Limit Rationale

50 rows total across all exception types. The previous flow allowed 25 per type × 5 types = 125 rows maximum. Since CRITICAL and HIGH items are prioritized by the severity score sort, the top 50 captures the most actionable items while preventing context overflow.

### Conditional Flag Pruning

> **Default policy: use the full query as-is.** The full combined query works correctly even when some exception counts are zero — those flags simply evaluate to `FALSE` for all rows and get filtered out by `_flagged`. Pruning is a marginal DAX performance optimization, not a correctness requirement. **Only prune when the full query hits DAX complexity limits or query timeout.**

#### When to prune

- The full query fails with a DAX error or timeout → prune zero-count flags and retry.
- Context window pressure forces a shorter query string → prune to reduce token count.
- All 5 counts are zero → skip the entire query (this is the only **required** prune).

#### Pruning reference table

Each row maps a Step 1 aggregate to the query elements that must be removed together when that type has zero count.

| Step 1 Aggregate | Flag to remove from `_tagged` | Condition to remove from `_flagged` | `SELECTCOLUMNS` column to remove | Severity references to adjust |
|---|---|---|---|---|
| `Stale >30d` = 0 | `"Is Stale"` | `[Is Stale]` | `"Is Stale", [Is Stale]` | None (severity uses `Days In Stage > 60` inline) |
| `Close <=14d` = 0 | `"Is Close Drift"` AND `"Is Past Due"` | `[Is Close Drift]` | `"Is Close Drift", [Is Close Drift]` AND `"Is Past Due", [Is Past Due]` | Remove CRITICAL gate (`[Is Past Due]`); remove HIGH `[Is Past Due]` and `[Is Close Drift] && [Is Stage Inflation]` terms |
| `Missing Fields` = 0 | `"Is Missing Fields"` | `[Is Missing Fields]` | `"Is Missing Fields", [Is Missing Fields]` | None |
| `High Value >=500K` = 0 | `"Is High Value"` | `[Is High Value]` | `"Is High Value", [Is High Value]` | Remove CRITICAL gate (requires high value); simplify to max score 80 |
| `Stage Inflation` = 0 | `"Is Stage Inflation"` | `[Is Stage Inflation]` | `"Is Stage Inflation", [Is Stage Inflation]` | Remove `[Is Close Drift] && [Is Stage Inflation]` from HIGH tier |

#### Severity score adjustments

The `_scored` block references flags that may have been pruned. Apply these rules **after** removing flags:

1. **CRITICAL (100) requires all three:** `Is Past Due`, `Stage Code >= 3`, `Revenue >= 500K`. If `Close <=14d` = 0 (no `Is Past Due`) OR `High Value >=500K` = 0 (no `Is High Value`), the CRITICAL tier is unreachable — remove the outer `IF` and start at HIGH (80).
2. **HIGH (80) compound term:** `[Is Close Drift] && [Is Stage Inflation]` requires both flags. If either is pruned, remove this term from the HIGH `IF`. If `Close <=14d` = 0, also remove `[Is Past Due]` and the `Days In Stage > 60` inline check only remains.
3. **MEDIUM (50)** is the catch-all and never needs adjustment.

#### Pruned query example

If Step 1 returns `Stale >30d` = 0 and `High Value >=500K` = 0:

```dax
-- Pruned: removed Is Stale, Is High Value
-- Severity: CRITICAL unreachable (no high-value gate), max is HIGH (80)
VAR _tagged =
    ADDCOLUMNS (
        _base,
        "Is Close Drift",  NOT ISBLANK ( 'Opportunity'[Opportunity Close Date] )
                             && 'Opportunity'[Opportunity Close Date] <= TODAY () + 14,
        "Is Past Due",     NOT ISBLANK ( 'Opportunity'[Opportunity Close Date] )
                             && 'Opportunity'[Opportunity Close Date] < TODAY (),
        "Is Missing Fields",
            ISBLANK ( 'Opportunity'[Sales Play Solution Area] )
              || TRIM ( 'Opportunity'[Sales Play Solution Area] ) = ""
              || ISBLANK ( 'Opportunity'[Forecast Comments] )
              || TRIM ( 'Opportunity'[Forecast Comments] ) = "",
        "Is Stage Inflation",
            'Opportunity'[Sales Stage Code] >= 3
              && 'Opportunity'[Forecast Recommendation]
                   IN {"UnCommitted", "UnCommitted Upside", "Committed At Risk"}
    )
VAR _flagged = FILTER ( _tagged,
    [Is Close Drift] || [Is Missing Fields] || [Is Stage Inflation] )
VAR _scored =
    ADDCOLUMNS (
        _flagged,
        "Severity Score",
            -- HIGH: past-due OR close drift with at-risk
            IF ( [Is Past Due]
                   || 'Opportunity'[Days In Sales Stage] > 60
                   || ( [Is Close Drift] && [Is Stage Inflation] ), 80,
            -- MEDIUM: everything else flagged
            50 )
    )
```

#### Invariants

Regardless of which flags are pruned, these must always hold:

- `_base` is **never modified** — scope filters are independent of exception types.
- Every flag in `_tagged` has a matching condition in `_flagged` and a column in `SELECTCOLUMNS`.
- `_flagged` uses `||` between all remaining flags — never `&&`.
- `_scored` severity tiers only reference flags that exist in `_tagged`.
- `SELECTCOLUMNS` only outputs flags that exist in `_tagged`.

### Legacy Queries (4a–4e)

The individual exception queries above are retained as **fallback** in case the combined query hits DAX complexity limits or row truncation issues. Use them only if the combined query fails or returns unexpected results. When falling back, execute only non-zero-count queries per the original skip logic.
