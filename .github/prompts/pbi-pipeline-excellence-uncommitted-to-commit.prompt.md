---
description: "M2 pipeline excellence review using MSX Insights - Pipeline Excellence Uncommitted to Commit. Answers: uncommitted-to-committed conversion rates by M1/area/solution play/role, quarter-over-quarter close rate trends, at-risk milestone triage, shift-out analysis, and role accountability. Triggers: pipeline excellence, uncommitted to committed, close rate, pipeline conversion, pipeline health, M2 pipeline review, pipeline shift out, milestone conversion, pipeline discipline."
---

# Pipeline Excellence — Uncommitted to Committed (M2 Review)

Analyze Azure consumption pipeline conversion health from the **WWBI_FabricMSXIAzureCloseRate_OneAMP** model. Produce an M2-level executive brief covering uncommitted-to-committed conversion, close rate trends, and actionable exceptions.

## Configuration

> **Managers**: Fork this file and update these values for your org scope.

| Setting | Value | Notes |
|---|---|---|
| **Semantic Model ID** | `d09cbcc8-e928-46d0-bbc0-00ccaae958cd` | WWBI_FabricMSXIAzureCloseRate_OneAMP |
| **Report ID** | `3c7e96ed-e3a0-46ae-b45f-9109104e2f3a` | [Open in Power BI](https://msit.powerbi.com/groups/me/reports/3c7e96ed-e3a0-46ae-b45f-9109104e2f3a) |
| **Default FY Filter** | `'fiscalmonth'[FiscalYear] IN {"FY26"}` | Current fiscal year |
| **Default Quarter** | `'fiscalmonth'[FiscalQuarter] IN {"FY26-Q3"}` | Current quarter — update each Q |
| **M2 Alias** | `<YOUR_ALIAS>` | Used for `accountcsammapping[CSAMM2]` scoping |
| **Area Filter** | _(optional)_ | `'Field Geography'[Field Area]` — blank = all visible |
| **Segment Filter** | `'Segment'[Field Summary Segment] IN {"Enterprise Commercial", "Enterprise Public Sector"}` | Default excludes SME&C |

## Key Measures Reference

| Measure | What It Means | M2 Use |
|---|---|---|
| `Starting Uncommitted Pipeline $` | $ value of milestones that were uncommitted at quarter start | Denominator for conversion rate |
| `Uncommited to Commited Pipeline (Total)` | $ that moved from uncommitted → committed during the quarter | Raw conversion signal |
| `Uncommited to Commited %` | Total conversion / starting uncommitted | **Primary health metric** |
| `Uncommitted to Committed Pipeline (In Quarter)` | Converted AND staying in current quarter | High-quality conversion |
| `Uncommitted to Committed Pipeline (Shifted Out)` | Converted BUT est. date pushed to future quarter | Discipline concern |
| `# Starting Uncommitted Milestone` | Count of milestones starting as uncommitted | Volume denominator |
| `# Uncommitted to Committed milestones` | Count that converted | Volume conversion |
| `% of Milestones Moving from Uncommitted to Committed` | Milestone count conversion rate | Breadth vs. $ concentration |
| `Milestone Close Rate (Quarterly)` | Overall milestone close rate | Benchmarking |
| `Committed Milestone Close Rate (Quarterly)` | Close rate for committed milestones | Quality of committed pipe |
| `Uncommitted Milestone Close Rate (Quarterly)` | Close rate for uncommitted milestones | Predictive signal |
| `NNR Close Rate (Quarterly)` | Net New Revenue close rate | Revenue realization |
| `Qualified Pipeline Coverage` | QP coverage ratio | Sufficiency check |

## Workflow

### Step 0 — Power BI Auth Pre-Check

```dax
EVALUATE TOPN(1, 'fiscalmonth')
```

If this returns data → proceed. If it fails → stop and tell the user:

> Power BI MCP auth expired. Run:
> ```
> az login --tenant 72f988bf-86f1-41af-91ab-2d7cd011db47
> az account get-access-token --resource https://analysis.windows.net/powerbi/api
> ```
> Then restart `powerbi-remote` in VS Code.

### Step 1 — Scope the Query

Ask the user (skip items already provided):

> **To scope your M2 pipeline review, confirm:**
> 1. **Fiscal quarter?** (default: current quarter from Configuration)
> 2. **M2 alias for team scoping?** (default: uses RLS; set `CSAMM2` for explicit filter)
> 3. **Area/geography filter?** (optional — `'Field Geography'[Field Area]`)
> 4. **Include prior quarter comparison?** (default: yes — pulls CQ and CQ-1)

Build `<SCOPE_FILTER>` from responses. Base filters always include:

```
TREATAS({<FY>}, 'fiscalmonth'[FiscalYear])
TREATAS({<Quarter>}, 'fiscalmonth'[FiscalQuarter])
```

If M2 alias provided, add:

```
TREATAS({<M2_ALIAS>}, 'accountcsammapping'[CSAMM2])
```

### Step 2 — Org-Level Conversion Summary

Single-row scorecard for the M2's total org.

```dax
EVALUATE
SUMMARIZECOLUMNS(
    <SCOPE_FILTER>,
    "Starting_Uncommitted_$", [Starting Uncommitted Pipeline $],
    "UC_to_C_Total_$", [Uncommited to Commited Pipeline (Total)],
    "UC_to_C_Pct", [Uncommited to Commited %],
    "UC_to_C_InQ_$", [Uncommitted to Committed Pipeline (In Quarter)],
    "UC_to_C_InQ_Pct", [Uncommitted to Committed Pipeline (In Quarter) %],
    "UC_to_C_ShiftOut_$", [Uncommitted to Committed Pipeline (Shifted Out)],
    "UC_to_C_ShiftOut_Pct", [Uncommitted to Committed Pipeline (Shifted Out) %],
    "Start_MS_Count", [# Starting Uncommitted Milestone],
    "UC_to_C_MS_Count", [# Uncommitted to Committed milestones],
    "MS_Move_Pct", [% of Milestones Moving from Uncommitted to Committed]
)
```

**Present as:**

```
## Org Conversion Scorecard — <Quarter>

| Metric | Value |
|---|---|
| **Starting Uncommitted Pipeline** | $X.XXB |
| **Converted (Total)** | $X.XXM (XX.X%) |
| **In-Quarter Conversion** | $X.XXM (XX.X%) |
| **Shifted Out** | $X.XXM (XX.X%) |
| **Milestones: Starting → Converted** | N → N (XX.X%) |
```

Flag: If shift-out > 20% of total conversion → ⚠️ pipeline discipline concern.

### Step 3 — M1 Manager Breakdown

Decompose conversion by each M1 manager under the M2.

```dax
EVALUATE
TOPN(25,
    SUMMARIZECOLUMNS(
        'accountcsammapping'[CSAMManager],
        <SCOPE_FILTER>,
        "Starting_Uncommitted", [Starting Uncommitted Pipeline $],
        "UC_to_C_Total", [Uncommited to Commited Pipeline (Total)],
        "UC_to_C_Pct", [Uncommited to Commited %],
        "UC_to_C_InQ", [Uncommitted to Committed Pipeline (In Quarter)],
        "ShiftOut", [Uncommitted to Committed Pipeline (Shifted Out)],
        "MS_Count", [# Starting Uncommitted Milestone],
        "UC_to_C_MS", [# Uncommitted to Committed milestones],
        "MS_Move_Pct", [% of Milestones Moving from Uncommitted to Committed]
    ),
    [Starting_Uncommitted], DESC
)
```

> **Note**: If `accountcsammapping[CSAMManager]` doesn't produce the right M1 roll-up (some orgs use different ownership paths), fall back to `'factazureconsumptionpipelinec2csnapshots'[MilestoneOwnerManagerAlias]` grouped by unique manager.

**Present as ranked table.** Flag:
- 🔴 M1s with conversion < 10% on material pipeline (>$50M starting)
- 🟡 M1s with shift-out > 30% of their conversions
- 🟢 M1s above org average conversion rate

### Step 4 — Area / Geography Breakdown

```dax
EVALUATE
TOPN(20,
    SUMMARIZECOLUMNS(
        'Field Geography'[Field Area],
        'Field Geography'[Lower Field Accountability Unit],
        <SCOPE_FILTER>,
        "Starting_Uncommitted", [Starting Uncommitted Pipeline $],
        "UC_to_C_Total", [Uncommited to Commited Pipeline (Total)],
        "UC_to_C_Pct", [Uncommited to Commited %],
        "InQ", [Uncommitted to Committed Pipeline (In Quarter)],
        "ShiftOut", [Uncommitted to Committed Pipeline (Shifted Out)],
        "MS_Count", [# Starting Uncommitted Milestone],
        "UC_to_C_MS", [# Uncommitted to Committed milestones]
    ),
    [Starting_Uncommitted], DESC
)
```

Rank by starting pipeline. Highlight areas with lowest conversion % and highest shift-out ratio.

### Step 5 — Solution Play Analysis

```dax
EVALUATE
SUMMARIZECOLUMNS(
    'strategicpillar'[AzureSolutionPlay],
    <SCOPE_FILTER>,
    "Starting_Uncommitted", [Starting Uncommitted Pipeline $],
    "UC_to_C_Total", [Uncommited to Commited Pipeline (Total)],
    "UC_to_C_Pct", [Uncommited to Commited %],
    "MS_Count", [# Starting Uncommitted Milestone],
    "UC_to_C_MS", [# Uncommitted to Committed milestones]
)
ORDER BY [Starting_Uncommitted] DESC
```

Flag solution plays where conversion % is below the org average — these need GTM intervention.

### Step 6 — Role Accountability

```dax
EVALUATE
SUMMARIZECOLUMNS(
    'factazureconsumptionpipelinec2csnapshots'[MilestoneOwnerRole],
    <SCOPE_FILTER>,
    "Starting_Uncommitted", [Starting Uncommitted Pipeline $],
    "UC_to_C_Total", [Uncommited to Commited Pipeline (Total)],
    "UC_to_C_Pct", [Uncommited to Commited %],
    "MS_Count", [# Starting Uncommitted Milestone],
    "UC_to_C_MS", [# Uncommitted to Committed milestones]
)
ORDER BY [Starting_Uncommitted] DESC
```

Expected pattern: CSU should have highest conversion % (delivery-stage pipe), STU carries the largest $ volume. Flag deviations.

### Step 7 — Close Rate Trend (4-Quarter)

```dax
EVALUATE
SUMMARIZECOLUMNS(
    'factmilestonecloseratequarterly'[FiscalQuarter],
    "MS_CR", [Milestone Close Rate (Quarterly)],
    "Committed_CR", [Committed Milestone Close Rate (Quarterly)],
    "Uncommitted_CR", [Uncommitted Milestone Close Rate (Quarterly)],
    "NNR_CR", [NNR Close Rate (Quarterly)],
    "QP_Coverage", [Qualified Pipeline Coverage]
)
ORDER BY 'factmilestonecloseratequarterly'[FiscalQuarter]
```

Filter to last 4–6 quarters. Trend interpretation:
- **Committed CR trending up** → healthy execution
- **Uncommitted CR trending down** → pipeline quality deteriorating
- **NNR CR declining** → revenue realization problem
- **QP Coverage < 2x** → pipeline sufficiency risk

### Step 8 — At-Risk Milestone Triage (Top N by $)

```dax
EVALUATE
TOPN(30,
    CALCULATETABLE(
        SELECTCOLUMNS(
            'factazureconsumptionpipelinec2csnapshots',
            "Account", RELATED('DimCustomer'[translatedaccountname]),
            "MilestoneName", 'factazureconsumptionpipelinec2csnapshots'[MilestoneName],
            "MilestoneNumber", 'factazureconsumptionpipelinec2csnapshots'[milestonenumber],
            "OpptyNumber", 'factazureconsumptionpipelinec2csnapshots'[opportunitynumber],
            "OwnerRole", 'factazureconsumptionpipelinec2csnapshots'[MilestoneOwnerRole],
            "OwnerAlias", 'factazureconsumptionpipelinec2csnapshots'[MilestoneOwnerAlias],
            "ManagerAlias", 'factazureconsumptionpipelinec2csnapshots'[MilestoneOwnerManagerAlias],
            "SolutionPlay", RELATED('strategicpillar'[AzureSolutionPlay]),
            "PrevCommit", 'factazureconsumptionpipelinec2csnapshots'[prevcommitmentrecommendation],
            "CurrCommit", 'factazureconsumptionpipelinec2csnapshots'[commitmentrecommendation],
            "PrevStatus", 'factazureconsumptionpipelinec2csnapshots'[PrevMilestonestatus],
            "CurrStatus", 'factazureconsumptionpipelinec2csnapshots'[Milestonestatus],
            "EstDate", 'factazureconsumptionpipelinec2csnapshots'[estdate],
            "PrevEstDate", 'factazureconsumptionpipelinec2csnapshots'[prevestdate],
            "SalesStage", 'factazureconsumptionpipelinec2csnapshots'[SalesStageName],
            "StartingUC$", 'factazureconsumptionpipelinec2csnapshots'[StartingUncommittedPipeline],
            "UC_to_C$", 'factazureconsumptionpipelinec2csnapshots'[UncommitToCommitTotalpipeline],
            "MilestoneLink", 'factazureconsumptionpipelinec2csnapshots'[milestonelink]
        ),
        <SCOPE_FILTER>,
        'factazureconsumptionpipelinec2csnapshots'[prevcommitmentrecommendation] = "Uncommitted",
        'factazureconsumptionpipelinec2csnapshots'[commitmentrecommendation] = "Uncommitted"
    ),
    [StartingUC$], DESC
)
```

These are the **largest milestones still stuck uncommitted**. Present top 15–20 with:
- Account, milestone name, $ value
- Owner alias + manager (for M1 escalation targeting)
- Sales stage, est. date, status
- Flag milestones where est. date has shifted (PrevEstDate ≠ EstDate)

### Step 9 — Report Output

Assemble as:

```markdown
# Pipeline Excellence — Uncommitted to Committed
## <M2 Alias> Org | <Quarter>

### Org Scorecard
<Step 2 output>

### M1 Manager Ranking
<Step 3 table with Red/Yellow/Green flags>

### Geography Breakdown
<Step 4 ranked table>

### Solution Play Health
<Step 5 table>

### Role Accountability
<Step 6 table>

### Close Rate Trend (4Q)
<Step 7 trend table with directional arrows>

### At-Risk Milestones (Top 20)
<Step 8 table>

### Recommended Actions
1. [M1-specific action based on lowest conversion]
2. [Solution play intervention based on Step 5]
3. [Shift-out discipline action if > 20%]
4. [Close rate improvement if trending down]
```

### Step 10 — Persist (Optional)

If requested, save to:

```
.copilot/sessions/pbi/pipeline-excellence-uc2c-<date>.md
```

For downstream CRM correlation or vault note creation.
