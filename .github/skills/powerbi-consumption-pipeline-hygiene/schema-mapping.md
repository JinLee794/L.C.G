# Schema Mapping — CAIP ACR & Pipeline

Semantic model `f71df8c0-e435-4354-b444-e4014e964b5f`. Schema fully resolved — **never call `GetSemanticModelSchema`**. Large PBI models fail with `MPC -32603` parsing errors. If a column error occurs, update this file manually.

> **Key difference from MSBilledPipelineCurated:** This model uses prefixed table names (`'2) Account'`, `'✽ ACR'`), has direct Account→ACR/Pipeline relationships via TPID (no bridge table — CROSSFILTER not needed), and provides pre-built measures in `'◦ Measure'`. SUMMARIZECOLUMNS works correctly for all queries.

---

## Tables & Key Columns

### ✽ ACR (fact)

| Column | Type | Notes |
|---|---|---|
| `TPID` | Text | FK → Account |
| `Fiscal Month` | Text | FK → Calendar |
| `Sub Strategic Pillar` | Text | Product-level detail |
| ACR amount | Double | Revenue value |

### ✽ Pipeline (fact)

| Column | Type | Notes |
|---|---|---|
| `TPID` | Text | FK → Account |
| `OpportunityID` | Text | Unique key |
| `OpportunityName` | Text | |
| `SalesStageShort` | Text | e.g. `1-L&C` |
| `OpportunityOwner` | Text | Microsoft alias |
| `OpportunityLink` | Text | Deep link to MSX record |
| `DaysInSalesStage` | Int64 | |
| `MilestoneID` | Text | |
| `MilestoneName` | Text | |
| `MilestoneStatus` | Text | |
| `MilestoneCommitment` | Text | |
| `MilestonePastDue` | Text | |
| `MilestoneEstimatedMonth` | Text | |
| `MilestoneWorkload` | Text | |
| `MilestoneOwner` | Text | |
| `MilestoneHelpNeeded` | Text | |
| `MilestoneLink` | Text | |
| `PipelineACR` | Double | |
| `QualifiedFlag` | Text | |
| `StrategicPillar` | Text | |

### 2) Account (dimension)

| Column | Type | Notes |
|---|---|---|
| `TPID` | Text | Account identifier — primary key |
| `TopParent` | Text | Account name |
| `ATU` | Text | e.g. `USA.EC.HLS.PROV.S` |
| `Segment` | Text | Strategic, Upper Majors, SMEC, etc. |
| `Vertical` | Text | e.g. Healthcare, Financial Services |
| `SubRegion` | Text | Geography |

### 1) Calendar (dimension)

| Column | Type | Notes |
|---|---|---|
| `Fiscal Year` | Text | e.g. `FY26` |
| `Fiscal Quarter` | Text | e.g. `FY26-Q3` |
| `Fiscal Month` | Text | e.g. `FY26-M09` |
| `RelativeFY` | Int64 | 0 = current FY |
| `RelativeFQ` | Int64 | 0 = current FQ |
| `RelativeFM` | Int64 | 0 = current FM |

### 3) Product (dimension)

| Column | Type | Notes |
|---|---|---|
| `SuperStrategicPillar` | Text | Top-level grouping |
| `StrategicPillar` | Text | e.g. Azure, Modern Work |
| `Workload` | Text | |
| `SolutionPlay` | Text | |

### 4) Sellers (dimension)

| Column | Type | Notes |
|---|---|---|
| `Alias` | Text | Microsoft alias |
| `Role` | Text | |
| `Manager` | Text | |
| `Email` | Text | |

### ◦ Measure (pre-built measures)

| Measure | Notes |
|---|---|
| `[ACR]` | Azure Consumption Revenue |
| `[Pipeline ACR]` | Total pipeline ACR |
| `[ACR (Last Closed Month)]` | Most recent closed month ACR |
| `[ACR (Monthly Average)]` | Average monthly ACR |
| `[ACR Change Δ% - MoM]` | Month-over-month change % |
| `[ACR Change Δ% - YTD YoY]` | Year-over-year YTD change % |
| `[Pipeline ACR (Committed excl Blocked)]` | Committed pipeline |
| `[Pipeline ACR (Uncommitted)]` | Uncommitted pipeline |
| `[Pipeline ACR (Qualified)]` | Qualified pipeline |
| `[Pipeline ACR (Unqualified)]` | Unqualified pipeline |
| `[# of Milestones]` | Milestone count |

---

## Relationship Model

```
✽ ACR (fact)
  ├─→ 2) Account (dimension)   via TPID           [direct]
  └─→ 1) Calendar (dimension)  via Fiscal Month   [direct]

✽ Pipeline (fact)
  └─→ 2) Account (dimension)   via TPID           [direct]

3) Product (dimension)
  └─→ ✽ ACR                    via Sub Strategic Pillar

◦ Security TPID Assignment
  └─→ 4) Sellers               via Alias          [RLS chain]
```

**Key differences from MSBilledPipelineCurated:**
- Account and ACR connect **directly** via TPID — no bridge table, no CROSSFILTER needed.
- Account and Pipeline also connect directly via TPID.
- `SUMMARIZECOLUMNS` with `TREATAS` works correctly for scoping (no auto-exist propagation issue).
- RLS scopes via `◦ Security TPID Assignment` → `4) Sellers` chain — the model automatically limits results to the running user's assigned accounts.

---

## Scope Filter Patterns

### Default: Seller RLS + SMEC Exclusion

The model's RLS automatically scopes to the running user. **SMEC segments are excluded by default** to match the report's built-in page filter and show only managed accounts.

All portfolio-level queries MUST include `<SMEC_EXCLUSION>` unless the user explicitly requests SMEC inclusion:

```dax
-- <SMEC_EXCLUSION> — add to every SUMMARIZECOLUMNS as a filter argument:
FILTER(
  ALL('2) Account'[Segment]),
  NOT('2) Account'[Segment] IN {"SMEC \u2014 SMB Public Sector", "SMEC \u2014 SMB Commercial"})
)

-- For CALCULATE expressions, add as a filter:
NOT('2) Account'[Segment] IN {"SMEC \u2014 SMB Public Sector", "SMEC \u2014 SMB Commercial"})
```

### Optional Filters

| User Request | Filter Pattern |
|---|---|
| **Include SMEC/SMB** | Remove `<SMEC_EXCLUSION>` from queries |
| Specific TPIDs | `TREATAS({"<tpid1>","<tpid2>"}, '2) Account'[TPID])` |
| HLS accounts only | `FILTER` on `'2) Account'[ATU]` matching `USA.EC.HLS.*` |
| Specific segment | `TREATAS({"Strategic"}, '2) Account'[Segment])` |

---

## Auth Query

Verifies access and resolves the current fiscal year in one call:

```dax
EVALUATE
  FILTER('1) Calendar', '1) Calendar'[RelativeFY] = 0)
```

Extract the `Fiscal Year` column value (e.g., `"FY26"`) and store as `<CURRENT_FY>`.

---

## Portfolio Query (Step 3)

```dax
EVALUATE
  TOPN(
    200,
    FILTER(
      SUMMARIZECOLUMNS(
        '2) Account'[TPID],
        '2) Account'[TopParent],
        '2) Account'[ATU],
        '2) Account'[Segment],
        '2) Account'[Vertical],
        '2) Account'[SubRegion],
        TREATAS({"<CURRENT_FY>"}, '1) Calendar'[Fiscal Year]),
        FILTER(ALL('2) Account'[Segment]), NOT('2) Account'[Segment] IN {"SMEC \u2014 SMB Public Sector", "SMEC \u2014 SMB Commercial"})),
        "ACR", [ACR]
      ),
      [ACR] > 100000
    ),
    [ACR], DESC
  )
ORDER BY [ACR] DESC
```

Use `maxRows: 200`.

---

## Summary Query (Step 4)

```dax
EVALUATE
  ROW(
    "TotalAccounts", COUNTROWS(
      FILTER(
        SUMMARIZECOLUMNS(
          '2) Account'[TPID],
          TREATAS({"<CURRENT_FY>"}, '1) Calendar'[Fiscal Year]),
          FILTER(ALL('2) Account'[Segment]), NOT('2) Account'[Segment] IN {"SMEC \u2014 SMB Public Sector", "SMEC \u2014 SMB Commercial"})),
          "ACR", [ACR]
        ),
        [ACR] > 100000
      )
    ),
    "TotalACR", CALCULATE(
      [ACR],
      TREATAS({"<CURRENT_FY>"}, '1) Calendar'[Fiscal Year]),
      NOT('2) Account'[Segment] IN {"SMEC \u2014 SMB Public Sector", "SMEC \u2014 SMB Commercial"})
    )
  )
```

---

## Pillar Query (Step 7)

```dax
EVALUATE
  SUMMARIZECOLUMNS(
    '3) Product'[SuperStrategicPillar],
    '3) Product'[StrategicPillar],
    TREATAS({"<CURRENT_FY>"}, '1) Calendar'[Fiscal Year]),
    FILTER(ALL('2) Account'[Segment]), NOT('2) Account'[Segment] IN {"SMEC \u2014 SMB Public Sector", "SMEC \u2014 SMB Commercial"})),
    "ACR", [ACR]
  )
ORDER BY [ACR] DESC
```

---

## Trend Query (Step 8)

```dax
EVALUATE
  SUMMARIZECOLUMNS(
    '1) Calendar'[Fiscal Month],
    '1) Calendar'[Fiscal Quarter],
    TREATAS({"<CURRENT_FY>"}, '1) Calendar'[Fiscal Year]),
    FILTER(ALL('2) Account'[Segment]), NOT('2) Account'[Segment] IN {"SMEC \u2014 SMB Public Sector", "SMEC \u2014 SMB Commercial"})),
    "ACR", [ACR]
  )
ORDER BY '1) Calendar'[Fiscal Month]
```

---

## Pipeline Query (Step 9)

Works at portfolio level or scoped to a TPID. Add `TREATAS({<TPID>}, '2) Account'[TPID])` for single-account.

```dax
EVALUATE
  FILTER(
    SUMMARIZECOLUMNS(
      '2) Account'[TPID],
      '2) Account'[TopParent],
      '2) Account'[Segment],
      FILTER(ALL('2) Account'[Segment]), NOT('2) Account'[Segment] IN {"SMEC \u2014 SMB Public Sector", "SMEC \u2014 SMB Commercial"})),
      "Committed", [Pipeline ACR (Committed excl Blocked)],
      "Uncommitted", [Pipeline ACR (Uncommitted)],
      "Qualified", [Pipeline ACR (Qualified)],
      "Unqualified", [Pipeline ACR (Unqualified)],
      "Milestones", [# of Milestones]
    ),
    [Committed] + [Uncommitted] + [Qualified] + [Unqualified] > 0
  )
ORDER BY [Committed] DESC
```

---

## Opportunity Query (Step 10)

Add `TREATAS({<TPID>}, '2) Account'[TPID])` for single-account scope.

```dax
EVALUATE
  SUMMARIZECOLUMNS(
    '2) Account'[TPID],
    '2) Account'[TopParent],
    '✽ Pipeline'[OpportunityID],
    '✽ Pipeline'[OpportunityName],
    '✽ Pipeline'[SalesStageShort],
    '✽ Pipeline'[OpportunityOwner],
    '✽ Pipeline'[OpportunityLink],
    FILTER(ALL('2) Account'[Segment]), NOT('2) Account'[Segment] IN {"SMEC \u2014 SMB Public Sector", "SMEC \u2014 SMB Commercial"})),
    "DaysInStage", MIN('✽ Pipeline'[DaysInSalesStage]),
    "Committed", [Pipeline ACR (Committed excl Blocked)],
    "Uncommitted", [Pipeline ACR (Uncommitted)],
    "Qualified", [Pipeline ACR (Qualified)],
    "Milestones", [# of Milestones]
  )
ORDER BY [Qualified] DESC
```

Flag opportunities where `DaysInStage > 60`.

---

## Milestone Query (Step 11 — requires TPID)

**Never run at portfolio level.** Always scope to a specific TPID.

```dax
EVALUATE
  CALCULATETABLE(
    SELECTCOLUMNS(
      '✽ Pipeline',
      "OpportunityID", '✽ Pipeline'[OpportunityID],
      "OpportunityName", '✽ Pipeline'[OpportunityName],
      "SalesStage", '✽ Pipeline'[SalesStageShort],
      "MilestoneID", '✽ Pipeline'[MilestoneID],
      "MilestoneName", '✽ Pipeline'[MilestoneName],
      "MilestoneStatus", '✽ Pipeline'[MilestoneStatus],
      "MilestoneCommitment", '✽ Pipeline'[MilestoneCommitment],
      "MilestonePastDue", '✽ Pipeline'[MilestonePastDue],
      "MilestoneEstimatedMonth", '✽ Pipeline'[MilestoneEstimatedMonth],
      "MilestoneWorkload", '✽ Pipeline'[MilestoneWorkload],
      "MilestoneOwner", '✽ Pipeline'[MilestoneOwner],
      "MilestoneHelpNeeded", '✽ Pipeline'[MilestoneHelpNeeded],
      "MilestoneLink", '✽ Pipeline'[MilestoneLink],
      "PipelineACR", '✽ Pipeline'[PipelineACR],
      "QualifiedFlag", '✽ Pipeline'[QualifiedFlag],
      "StrategicPillar", '✽ Pipeline'[StrategicPillar]
    ),
    TREATAS({<TPID>}, '2) Account'[TPID])
  )
ORDER BY [MilestoneEstimatedMonth]
```

Flag past-due and help-needed milestones.

---

## Pipeline Risk Aggregate Query (Step 5e)

Returns all pipeline risk counts in one call. Skip any detail query (5e-i–5e-iv) whose count is 0.

```dax
EVALUATE
  ROW(
    "Stale >60d",
      CALCULATE(
        DISTINCTCOUNT('✽ Pipeline'[OpportunityID]),
        FILTER(ALL('✽ Pipeline'[DaysInSalesStage]), '✽ Pipeline'[DaysInSalesStage] > 60),
        FILTER(ALL('2) Account'[Segment]), NOT('2) Account'[Segment] IN {"SMEC — SMB Public Sector", "SMEC — SMB Commercial"}))
      ),
    "Stale >90d",
      CALCULATE(
        DISTINCTCOUNT('✽ Pipeline'[OpportunityID]),
        FILTER(ALL('✽ Pipeline'[DaysInSalesStage]), '✽ Pipeline'[DaysInSalesStage] > 90),
        FILTER(ALL('2) Account'[Segment]), NOT('2) Account'[Segment] IN {"SMEC — SMB Public Sector", "SMEC — SMB Commercial"}))
      ),
    "Past Due MS",
      CALCULATE(
        COUNTROWS('✽ Pipeline'),
        FILTER(ALL('✽ Pipeline'[MilestonePastDue]), '✽ Pipeline'[MilestonePastDue] = "Yes"),
        FILTER(ALL('2) Account'[Segment]), NOT('2) Account'[Segment] IN {"SMEC — SMB Public Sector", "SMEC — SMB Commercial"}))
      ),
    "Help Needed",
      CALCULATE(
        COUNTROWS('✽ Pipeline'),
        FILTER(
          ALL('✽ Pipeline'[MilestoneHelpNeeded]),
          NOT(ISBLANK('✽ Pipeline'[MilestoneHelpNeeded]))
            && '✽ Pipeline'[MilestoneHelpNeeded] <> ""
        ),
        FILTER(ALL('2) Account'[Segment]), NOT('2) Account'[Segment] IN {"SMEC — SMB Public Sector", "SMEC — SMB Commercial"}))
      ),
    "No Milestones",
      CALCULATE(
        DISTINCTCOUNT('✽ Pipeline'[OpportunityID]),
        FILTER(
          ALL('✽ Pipeline'[MilestoneID]),
          ISBLANK('✽ Pipeline'[MilestoneID]) || '✽ Pipeline'[MilestoneID] = ""
        ),
        FILTER(ALL('2) Account'[Segment]), NOT('2) Account'[Segment] IN {"SMEC — SMB Public Sector", "SMEC — SMB Commercial"}))
      ),
    "Total Pipeline Opps",
      CALCULATE(
        DISTINCTCOUNT('✽ Pipeline'[OpportunityID]),
        FILTER(ALL('2) Account'[Segment]), NOT('2) Account'[Segment] IN {"SMEC — SMB Public Sector", "SMEC — SMB Commercial"}))
      )
  )
```

> **Note on MilestonePastDue values:** If `"Yes"` returns 0 unexpectedly, discover actual values with `EVALUATE DISTINCT('✽ Pipeline'[MilestonePastDue])` and adjust the filter.

---

## Pipeline Risk Detail: Stale Opportunities (Step 5e-i)

Opportunities stuck >60 days in current sales stage, sorted worst first.

```dax
EVALUATE
  TOPN(
    25,
    SUMMARIZECOLUMNS(
      '2) Account'[TPID],
      '2) Account'[TopParent],
      '✽ Pipeline'[OpportunityID],
      '✽ Pipeline'[OpportunityName],
      '✽ Pipeline'[SalesStageShort],
      '✽ Pipeline'[OpportunityOwner],
      '✽ Pipeline'[OpportunityLink],
      FILTER(ALL('2) Account'[Segment]), NOT('2) Account'[Segment] IN {"SMEC — SMB Public Sector", "SMEC — SMB Commercial"})),
      FILTER(ALL('✽ Pipeline'[DaysInSalesStage]), '✽ Pipeline'[DaysInSalesStage] > 60),
      "DaysInStage", MIN('✽ Pipeline'[DaysInSalesStage]),
      "PipelineACR", [Pipeline ACR]
    ),
    [DaysInStage], DESC
  )
ORDER BY [DaysInStage] DESC
```

---

## Pipeline Risk Detail: Past-Due Milestones (Step 5e-ii)

Milestones flagged as past due with their parent opportunity context.

```dax
EVALUATE
  TOPN(
    25,
    CALCULATETABLE(
      SELECTCOLUMNS(
        '✽ Pipeline',
        "TPID", '✽ Pipeline'[TPID],
        "OpportunityName", '✽ Pipeline'[OpportunityName],
        "OpportunityOwner", '✽ Pipeline'[OpportunityOwner],
        "OpportunityLink", '✽ Pipeline'[OpportunityLink],
        "SalesStage", '✽ Pipeline'[SalesStageShort],
        "MilestoneName", '✽ Pipeline'[MilestoneName],
        "MilestoneStatus", '✽ Pipeline'[MilestoneStatus],
        "MilestoneCommitment", '✽ Pipeline'[MilestoneCommitment],
        "MilestoneEstimatedMonth", '✽ Pipeline'[MilestoneEstimatedMonth],
        "MilestoneOwner", '✽ Pipeline'[MilestoneOwner],
        "MilestoneLink", '✽ Pipeline'[MilestoneLink],
        "PipelineACR", '✽ Pipeline'[PipelineACR]
      ),
      '✽ Pipeline'[MilestonePastDue] = "Yes",
      NOT('2) Account'[Segment] IN {"SMEC — SMB Public Sector", "SMEC — SMB Commercial"})
    ),
    [PipelineACR], DESC
  )
ORDER BY [PipelineACR] DESC
```

---

## Pipeline Risk Detail: Help-Needed Milestones (Step 5e-iii)

Milestones where the owner flagged help needed — known blockers requiring attention.

```dax
EVALUATE
  TOPN(
    25,
    CALCULATETABLE(
      SELECTCOLUMNS(
        '✽ Pipeline',
        "TPID", '✽ Pipeline'[TPID],
        "OpportunityName", '✽ Pipeline'[OpportunityName],
        "OpportunityOwner", '✽ Pipeline'[OpportunityOwner],
        "OpportunityLink", '✽ Pipeline'[OpportunityLink],
        "MilestoneName", '✽ Pipeline'[MilestoneName],
        "MilestoneStatus", '✽ Pipeline'[MilestoneStatus],
        "MilestoneOwner", '✽ Pipeline'[MilestoneOwner],
        "MilestoneHelpNeeded", '✽ Pipeline'[MilestoneHelpNeeded],
        "MilestoneLink", '✽ Pipeline'[MilestoneLink],
        "PipelineACR", '✽ Pipeline'[PipelineACR]
      ),
      NOT(ISBLANK('✽ Pipeline'[MilestoneHelpNeeded]))
        && '✽ Pipeline'[MilestoneHelpNeeded] <> "",
      NOT('2) Account'[Segment] IN {"SMEC — SMB Public Sector", "SMEC — SMB Commercial"})
    ),
    [PipelineACR], DESC
  )
ORDER BY [PipelineACR] DESC
```

---

## Pipeline Risk Detail: Milestone-Less Opportunities (Step 5e-iv)

Opportunities carrying pipeline dollars but no milestones — indicates no execution plan attached.

```dax
EVALUATE
  TOPN(
    25,
    FILTER(
      SUMMARIZECOLUMNS(
        '2) Account'[TPID],
        '2) Account'[TopParent],
        '✽ Pipeline'[OpportunityID],
        '✽ Pipeline'[OpportunityName],
        '✽ Pipeline'[SalesStageShort],
        '✽ Pipeline'[OpportunityOwner],
        '✽ Pipeline'[OpportunityLink],
        FILTER(ALL('2) Account'[Segment]), NOT('2) Account'[Segment] IN {"SMEC — SMB Public Sector", "SMEC — SMB Commercial"})),
        FILTER(
          ALL('✽ Pipeline'[MilestoneID]),
          ISBLANK('✽ Pipeline'[MilestoneID]) || '✽ Pipeline'[MilestoneID] = ""
        ),
        "PipelineACR", [Pipeline ACR]
      ),
      [PipelineACR] > 0
    ),
    [PipelineACR], DESC
  )
ORDER BY [PipelineACR] DESC
```
