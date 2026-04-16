# ACR Health Check Rules

Four health queries detect consumption anomalies across the portfolio. All inherit the fiscal year filter from Step 1 and optional scope filters from Step 0.

> **Key difference from pipeline hygiene:** These checks operate on **consumption actuals** (ACR), not billed pipeline forecasts. There are no stage staleness or close-date drift checks — those belong to `powerbi-billed-pipeline-hygiene`. Instead, health checks focus on revenue trajectory, concentration risk, and pipeline coverage relative to consumption.

---

## Filtering Notes

- **No CROSSFILTER needed.** Account→ACR and Account→Pipeline have direct TPID relationships. SUMMARIZECOLUMNS propagates filters correctly.
- **TREATAS for FY scoping** is required on all queries: `TREATAS({"<CURRENT_FY>"}, '1) Calendar'[Fiscal Year])`.
- **SMEC exclusion** is applied by default to all queries via `<SMEC_EXCLUSION>` (see [schema-mapping.md](schema-mapping.md) § Scope Filter Patterns). Override only when the user explicitly asks to include SMEC/SMB accounts.
- **Pre-built measures** (`[ACR Change Δ% - MoM]`, `[ACR Change Δ% - YTD YoY]`) handle temporal comparisons internally — no manual period-over-period DAX needed.

---

## Aggregate Health Counts (Step 5 — run FIRST)

Returns all health check counts in one call. **Skip any detail query (5a–5d) whose count is 0.**

```dax
EVALUATE
  ROW(
    "Total Accounts",
      COUNTROWS(
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
    "Total ACR",
      CALCULATE(
        [ACR],
        TREATAS({"<CURRENT_FY>"}, '1) Calendar'[Fiscal Year]),
        NOT('2) Account'[Segment] IN {"SMEC \u2014 SMB Public Sector", "SMEC \u2014 SMB Commercial"})
      ),
    "MoM Declining",
      COUNTROWS(
        FILTER(
          SUMMARIZECOLUMNS(
            '2) Account'[TPID],
            TREATAS({"<CURRENT_FY>"}, '1) Calendar'[Fiscal Year]),
            FILTER(ALL('2) Account'[Segment]), NOT('2) Account'[Segment] IN {"SMEC \u2014 SMB Public Sector", "SMEC \u2014 SMB Commercial"})),
            "ACR", [ACR],
            "MoM", [ACR Change Δ% - MoM]
          ),
          [ACR] > 100000 && [MoM] < -0.05
        )
      ),
    "YoY Declining",
      COUNTROWS(
        FILTER(
          SUMMARIZECOLUMNS(
            '2) Account'[TPID],
            TREATAS({"<CURRENT_FY>"}, '1) Calendar'[Fiscal Year]),
            FILTER(ALL('2) Account'[Segment]), NOT('2) Account'[Segment] IN {"SMEC \u2014 SMB Public Sector", "SMEC \u2014 SMB Commercial"})),
            "ACR", [ACR],
            "YoY", [ACR Change Δ% - YTD YoY]
          ),
          [ACR] > 100000 && [YoY] < -0.05
        )
      ),
    "High ACR Accounts",
      COUNTROWS(
        FILTER(
          SUMMARIZECOLUMNS(
            '2) Account'[TPID],
            TREATAS({"<CURRENT_FY>"}, '1) Calendar'[Fiscal Year]),
            FILTER(ALL('2) Account'[Segment]), NOT('2) Account'[Segment] IN {"SMEC \u2014 SMB Public Sector", "SMEC \u2014 SMB Commercial"})),
            "ACR", [ACR]
          ),
          [ACR] > 500000
        )
      )
  )
```

> **Concentration and pipeline coverage** are computed in post-processing from the portfolio query results (Step 3) and pipeline query (Step 5d), not as separate PBI aggregate counts.

> **Skip logic:** `MoM Declining` = 0 → skip 5a. `YoY Declining` = 0 → skip 5b. Concentration is always computed from Step 3 results. Pipeline coverage gap requires a separate query (5d) — skip if all high-ACR accounts have pipeline coverage.

---

## 5a. MoM Declining Accounts

Accounts with ACR above threshold whose month-over-month change is declining >5%.

| Parameter | Value |
|---|---|
| Filter | `[ACR] > 100000 AND [ACR Change Δ% - MoM] < -0.05` |
| Sort | `MoM ASC` (worst decline first) |
| Limit | Top 25 |

```dax
EVALUATE
  TOPN(
    25,
    FILTER(
      SUMMARIZECOLUMNS(
        '2) Account'[TPID],
        '2) Account'[TopParent],
        '2) Account'[Segment],
        '2) Account'[Vertical],
        TREATAS({"<CURRENT_FY>"}, '1) Calendar'[Fiscal Year]),
        FILTER(ALL('2) Account'[Segment]), NOT('2) Account'[Segment] IN {"SMEC \u2014 SMB Public Sector", "SMEC \u2014 SMB Commercial"})),
        "ACR", [ACR],
        "MoM", [ACR Change Δ% - MoM],
        "LastClosedMonth", [ACR (Last Closed Month)],
        "MonthlyAvg", [ACR (Monthly Average)]
      ),
      [ACR] > 100000 && [MoM] < -0.05
    ),
    [MoM], ASC
  )
ORDER BY [MoM] ASC
```

---

## 5b. YoY Declining Accounts

Accounts with YTD year-over-year ACR decline.

| Parameter | Value |
|---|---|
| Filter | `[ACR] > 100000 AND [ACR Change Δ% - YTD YoY] < -0.05` |
| Sort | `YoY ASC` (worst decline first) |
| Limit | Top 25 |

```dax
EVALUATE
  TOPN(
    25,
    FILTER(
      SUMMARIZECOLUMNS(
        '2) Account'[TPID],
        '2) Account'[TopParent],
        '2) Account'[Segment],
        '2) Account'[Vertical],
        TREATAS({"<CURRENT_FY>"}, '1) Calendar'[Fiscal Year]),
        FILTER(ALL('2) Account'[Segment]), NOT('2) Account'[Segment] IN {"SMEC \u2014 SMB Public Sector", "SMEC \u2014 SMB Commercial"})),
        "ACR", [ACR],
        "YoY", [ACR Change Δ% - YTD YoY],
        "MonthlyAvg", [ACR (Monthly Average)]
      ),
      [ACR] > 100000 && [YoY] < -0.05
    ),
    [YoY], ASC
  )
ORDER BY [YoY] ASC
```

---

## 5c. Concentration Risk

Computed **in post-processing** from the Step 3 portfolio query results — no additional PBI query needed.

**Algorithm:**

1. Sum total ACR from all accounts in the portfolio result.
2. For each account, compute `share = account_ACR / total_ACR`.
3. Flag any account with `share > 0.20` (>20% of portfolio ACR).
4. Report top 10 accounts by share regardless of flag threshold for visibility.

**Severity assignment:**
- 🔴 Single account >30% of portfolio → CRITICAL concentration risk
- 🟡 Single account >20% of portfolio → HIGH concentration
- 🟠 Top 3 accounts >60% of portfolio → MEDIUM concentration

---

## 5d. Pipeline Coverage Gap

Accounts with significant ACR but no/low pipeline coverage. Requires cross-referencing ACR (Step 3 results) against pipeline data.

```dax
EVALUATE
  TOPN(
    25,
    FILTER(
      SUMMARIZECOLUMNS(
        '2) Account'[TPID],
        '2) Account'[TopParent],
        '2) Account'[Segment],
        TREATAS({"<CURRENT_FY>"}, '1) Calendar'[Fiscal Year]),
        FILTER(ALL('2) Account'[Segment]), NOT('2) Account'[Segment] IN {"SMEC \u2014 SMB Public Sector", "SMEC \u2014 SMB Commercial"})),
        "ACR", [ACR],
        "PipelineACR", [Pipeline ACR],
        "Committed", [Pipeline ACR (Committed excl Blocked)],
        "Milestones", [# of Milestones]
      ),
      [ACR] > 500000 && ([PipelineACR] = 0 || ISBLANK([PipelineACR]))
    ),
    [ACR], DESC
  )
ORDER BY [ACR] DESC
```

> **Interpretation:** High-ACR accounts with zero pipeline indicate either (a) stable consumption not requiring net-new pipeline, or (b) a growth opportunity being missed. The SKILL surfaces these for human judgment — it does not auto-classify.

---

## Severity Assignment

| Tier | Criteria | Example |
|---|---|---|
| 🔴 **CRITICAL** | ACR >$1M AND MoM declining >10% AND no pipeline coverage | Major account hemorrhaging ACR with no active pipeline recovery |
| 🔴 **CRITICAL** | Single account >30% of portfolio ACR | Dangerous single-customer dependency |
| 🟡 **HIGH** | MoM declining >5% on accounts >$500K | Significant consumption drop on material accounts |
| 🟡 **HIGH** | Single account >20% of portfolio ACR | High concentration |
| 🟡 **HIGH** | YoY declining >15% on accounts >$500K | Sustained year-over-year erosion |
| 🟠 **MEDIUM** | ACR >$500K with no pipeline | Growth opportunity gap — needs pipeline coverage assessment |
| 🟠 **MEDIUM** | YoY declining 5–15% on accounts >$100K | Moderate decline worth monitoring |
| 🟠 **MEDIUM** | Top 3 accounts >60% of portfolio | Portfolio diversification risk |

> **Cross-referencing:** When an account appears in multiple health checks (e.g., MoM declining AND no pipeline), escalate severity by one tier. A MEDIUM + MEDIUM = HIGH. A HIGH + any = CRITICAL.

---

## Pipeline Risk Assessment (Step 5e)

Four pipeline risk queries detect opportunity and milestone hygiene issues across the portfolio. These use the `✽ Pipeline` table within the same CAIP model — no second data source needed.

> **Why this matters:** ACR health checks (5a–5d) tell you *consumption is declining*. Pipeline risk checks tell you *the deals meant to protect or grow that consumption are themselves unhealthy*. An account with declining ACR AND stale pipeline is a compounded risk.

### Aggregate Pipeline Risk Counts

Run the aggregate query from [schema-mapping.md](schema-mapping.md) § Pipeline Risk Aggregate Query. Returns all counts in one call.

**Skip logic:** `Stale >60d` = 0 → skip 5e-i. `Past Due MS` = 0 → skip 5e-ii. `Help Needed` = 0 → skip 5e-iii. `No Milestones` = 0 → skip 5e-iv.

### 5e-i. Stale Opportunities (>60 Days in Sales Stage)

Opportunities that haven't progressed to the next stage in over 60 days.

| Parameter | Value |
|---|---|
| Filter | `DaysInSalesStage > 60` |
| Sort | `DaysInStage DESC` (worst first) |
| Limit | Top 25 |

**What this signals:** A deal stuck in the same stage for 60+ days likely has a blocker — missing customer engagement, stalled technical validation, or an owner who hasn't updated CRM. At 90+ days, the opportunity may be effectively dead but still inflating pipeline.

**Severity markers:**
- >90d on account with ACR >$1M → 🟡 HIGH (or escalate to 🔴 CRITICAL if account also has ACR decline)
- >60d on account with ACR >$500K → 🟡 HIGH
- >60d on account with ACR <$500K → 🟠 MEDIUM

### 5e-ii. Past-Due Milestones

Milestones where the estimated completion month has passed and the milestone remains open.

| Parameter | Value |
|---|---|
| Filter | `MilestonePastDue = "Yes"` |
| Sort | `PipelineACR DESC` (highest value first) |
| Limit | Top 25 |

**What this signals:** Work that was supposed to be done isn't done. Past-due milestones indicate execution risk — the customer may not be getting the value they expected, which eventually shows up as ACR decline.

**Severity markers:**
- Past-due milestone on account with ACR decline (5a/5b) → escalate by one tier
- Past-due milestone on account with ACR >$500K → 🟡 HIGH
- Past-due milestone on account with ACR <$500K → 🟠 MEDIUM

### 5e-iii. Help-Needed Milestones

Milestones where the owner has explicitly flagged that they need help.

| Parameter | Value |
|---|---|
| Filter | `MilestoneHelpNeeded` is not blank/empty |
| Sort | `PipelineACR DESC` |
| Limit | Top 25 |

**What this signals:** Known blockers — the seller has raised a flag but may not have received support. These are the most actionable items in the pipeline risk assessment.

**Severity:** Always 🟡 HIGH — the seller explicitly asked for help.

### 5e-iv. Milestone-Less Opportunities

Opportunities with pipeline ACR but no milestones attached.

| Parameter | Value |
|---|---|
| Filter | `MilestoneID` is blank/empty AND `PipelineACR > 0` |
| Sort | `PipelineACR DESC` |
| Limit | Top 25 |

**What this signals:** Pipeline value with no execution plan. Without milestones, there's no tracked work driving the opportunity toward close. Could be a newly created opp (acceptable) or a neglected one (risk).

**Severity markers:**
- Milestone-less opp with PipelineACR >$500K → 🟡 HIGH
- Milestone-less opp with PipelineACR $100K–$500K → 🟠 MEDIUM
- Milestone-less opp with PipelineACR <$100K → informational only

---

## Updated Severity Assignment (including Pipeline Risk)

| Tier | Criteria |
|---|---|
| 🔴 **CRITICAL** | ACR >$1M AND MoM declining >10% AND no pipeline coverage |
| 🔴 **CRITICAL** | Single account >30% of portfolio ACR |
| 🔴 **CRITICAL** | ACR declining (5a/5b) AND stale opportunity >90d on same account |
| 🟡 **HIGH** | MoM declining >5% on accounts >$500K |
| 🟡 **HIGH** | Single account >20% of portfolio ACR |
| 🟡 **HIGH** | YoY declining >15% on accounts >$500K |
| 🟡 **HIGH** | Stale opportunity >60d on account with ACR >$1M |
| 🟡 **HIGH** | Past-due milestone on account with ACR >$500K |
| 🟡 **HIGH** | Help-needed milestone (any account) |
| 🟡 **HIGH** | Milestone-less opportunity with PipelineACR >$500K |
| 🟠 **MEDIUM** | ACR >$500K with no pipeline |
| 🟠 **MEDIUM** | YoY declining 5–15% on accounts >$100K |
| 🟠 **MEDIUM** | Top 3 accounts >60% of portfolio |
| 🟠 **MEDIUM** | Milestone-less opportunity with PipelineACR $100K–$500K |
| 🟠 **MEDIUM** | Help-needed milestone on low-ACR account |

> **Cross-referencing (updated):** When an account appears in **both** ACR health checks (5a–5d) AND pipeline risk checks (5e), escalate severity by one tier. This reflects compounded risk — consumption is declining AND the deals meant to address it are themselves unhealthy.
