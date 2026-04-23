# Query Rules — HLS DBC Review

> Loaded on-demand by `powerbi-hls-dbc-review`. Two `ExecuteQuery` calls per run, each batching multiple DAX queries via the `daxQueries` array.

## Always-Active Filters

Every query inherits:

```dax
'SalesProgram'[ProgramName] = "HLS Database Catalyst"
'DimDate'[IsAzureClosedAndCurrentOpen] = "Y"
'DimViewType'[ViewType] = "Curated"
```

Pattern: wrap `SUMMARIZECOLUMNS` in `CALCULATETABLE(..., <DimDate filter>, <DimViewType filter>)` and put `FILTER('SalesProgram', 'SalesProgram'[ProgramName] = "HLS Database Catalyst")` as the first SUMMARIZECOLUMNS arg.

---

## Snapshot Batch — Step 1 (1 ExecuteQuery, 4 DAX queries)

### Q1 — Program KPI Snapshot (also auth verification)

```dax
EVALUATE
CALCULATETABLE(
    SUMMARIZECOLUMNS(
        FILTER('SalesProgram', 'SalesProgram'[ProgramName] = "HLS Database Catalyst"),
        "AccountCount", DISTINCTCOUNT('SalesProgram'[TPID]),
        "OppCount", DISTINCTCOUNT('SalesProgram'[OpportunityNumber]),
        "MilestoneCount", DISTINCTCOUNT('F_AzureConsumptionPipe'[MilestoneNumber]),
        "ACR_YTD", [$ ACR (YTD)],
        "ACR_LCM", [$ ACR Last Closed Month],
        "ACR_Target_YTD", [$ ACR Target (YTD)],
        "ACR_LeftToGo_YTD", [$ ACR Left To Go (YTD)],
        "ACR_Attain_YTD", [% ACR Attain (YTD)],
        "ACR_NetNewRequired", [$ ACR Net New Required],
        "PipeAll", [$ Consumption Pipeline All],
        "PipeCommitted", [$ Consumption Committed Pipeline All],
        "PipeQualified", [$ Qualified Pipeline all],
        "PipeStage1", [$ Stage 1 Pipe all],
        "PipeWoWChange", [$ Consumption Pipeline All WoW Change],
        "CommittedWoWChange", [$ Consumption Committed Pipe WoW Change],
        "QualifiedWoWChange", [$ Qualified Pipe WoW Change],
        "AtRiskPipe", [$ At Risk Pipeline],
        "BlockedPipe", [$ Blocked Pipeline],
        "MilestonesBlockedOrAtRisk", [# Milestones Blocked or At Risk],
        "QualifiedNNRCoverage", [% Qualified Pipe NNR Coverage],
        "CommittedNNRCoverage", [% Committed NNR Consumption Pipe Coverage]
    ),
    'DimDate'[IsAzureClosedAndCurrentOpen] = "Y",
    'DimViewType'[ViewType] = "Curated"
)
```

### Q2 — Stage Breakdown

```dax
EVALUATE
CALCULATETABLE(
    SUMMARIZECOLUMNS(
        'F_AzureConsumptionPipe'[SalesStageName],
        FILTER('SalesProgram', 'SalesProgram'[ProgramName] = "HLS Database Catalyst"),
        "MilestoneCount", DISTINCTCOUNT('F_AzureConsumptionPipe'[MilestoneNumber]),
        "OppCount", DISTINCTCOUNT('F_AzureConsumptionPipe'[OpportunityNumber]),
        "PipeAll", [$ Consumption Pipeline All],
        "PipeCommitted", [$ Consumption Committed Pipeline All]
    ),
    'DimDate'[IsAzureClosedAndCurrentOpen] = "Y",
    'DimViewType'[ViewType] = "Curated"
)
ORDER BY [PipeAll] DESC
```

### Q3 — Vertical Breakdown (HLS sub-verticals via Strategic Pillar / Solution Play)

> The model does not expose an explicit HLS vertical column; use `OpptyOwnershipGroup` + `MilestoneOwnerGroup` to surface vertical-ish ownership clustering.

```dax
EVALUATE
CALCULATETABLE(
    SUMMARIZECOLUMNS(
        'F_AzureConsumptionPipe'[OpptyOwnershipGroup],
        FILTER('SalesProgram', 'SalesProgram'[ProgramName] = "HLS Database Catalyst"),
        "AccountCount", DISTINCTCOUNT('SalesProgram'[TPID]),
        "OppCount", DISTINCTCOUNT('F_AzureConsumptionPipe'[OpportunityNumber]),
        "PipeAll", [$ Consumption Pipeline All],
        "PipeCommitted", [$ Consumption Committed Pipeline All]
    ),
    'DimDate'[IsAzureClosedAndCurrentOpen] = "Y",
    'DimViewType'[ViewType] = "Curated"
)
ORDER BY [PipeAll] DESC
```

### Q4 — WoW / MoM Movement Snapshot

```dax
EVALUATE
CALCULATETABLE(
    SUMMARIZECOLUMNS(
        FILTER('SalesProgram', 'SalesProgram'[ProgramName] = "HLS Database Catalyst"),
        "MilestonesNewCW1", [# New Engagements Created CW-1],
        "MilestonesMovedToUpperLastWeek", [# Engagements Moved Into Upper Stages Last Week],
        "MilestonesMovedToQualifiedLastWeek", [$ Engagements Moved Into Qualified Last Week],
        "OpsCommittedWoWChange", [# Committed Opps WoW Change],
        "OppsQualifiedWoWChange", [# Qualified Opps WoW Change],
        "OppsStage1WoWChange", [# Stage 1 Opps WoW Change],
        "MilestonesNewCM1", [# New Engagements Created CM-1]
    ),
    'DimDate'[IsAzureClosedAndCurrentOpen] = "Y",
    'DimViewType'[ViewType] = "Curated"
)
```

---

## Detail Batch — Step 2 (1 ExecuteQuery, up to 5 DAX queries)

Send only the queries matching the readout mode from Step 0.

### Q5 — Top Accounts by ACR LCM (Full, Gap)

```dax
EVALUATE
TOPN(
    25,
    CALCULATETABLE(
        SUMMARIZECOLUMNS(
            'SalesProgram'[TPID],
            'F_AzureConsumptionPipe'[CRMAccountName],
            FILTER('SalesProgram', 'SalesProgram'[ProgramName] = "HLS Database Catalyst"),
            "ACR_LCM", [$ ACR Last Closed Month],
            "ACR_YTD", [$ ACR (YTD)],
            "ACR_Target_YTD", [$ ACR Target (YTD)],
            "ACR_Attain_YTD", [% ACR Attain (YTD)],
            "ACR_YoY_YTD_Change", [$ YoY ACR YTD Change],
            "PipeAll", [$ Consumption Pipeline All],
            "PipeCommitted", [$ Consumption Committed Pipeline All],
            "PipeQualified", [$ Qualified Pipeline all],
            "OppCount", DISTINCTCOUNT('F_AzureConsumptionPipe'[OpportunityNumber])
        ),
        'DimDate'[IsAzureClosedAndCurrentOpen] = "Y",
        'DimViewType'[ViewType] = "Curated"
    ),
    [ACR_LCM], DESC
)
```

### Q6 — Top Opportunities by Conversion Likelihood (Full, Opps)

```dax
EVALUATE
TOPN(
    25,
    CALCULATETABLE(
        SUMMARIZECOLUMNS(
            'F_AzureConsumptionPipe'[OpportunityNumber],
            'F_AzureConsumptionPipe'[OpportunityName],
            'F_AzureConsumptionPipe'[CRMAccountName],
            'F_AzureConsumptionPipe'[OpptyOwnerAlias],
            'F_AzureConsumptionPipe'[SalesStageName],
            'F_AzureConsumptionPipe'[StageSort],
            'F_AzureConsumptionPipe'[CommitmentRecommendation],
            'F_AzureConsumptionPipe'[CommitmentStatusCombined],
            'F_AzureConsumptionPipe'[StrategicPillar],
            'F_AzureConsumptionPipe'[SolutionPlay],
            'F_AzureConsumptionPipe'[DaysInSalesStage],
            'F_AzureConsumptionPipe'[MilestoneStatus],
            'F_AzureConsumptionPipe'[MilestoneCompletionDateEstimated],
            'F_AzureConsumptionPipe'[CRMLink],
            'F_AzureConsumptionPipe'[SalesStageCW1_Movement],
            'F_AzureConsumptionPipe'[CommitmentChangeCW1],
            'F_AzureConsumptionPipe'[DateChange_CW1],
            FILTER('SalesProgram', 'SalesProgram'[ProgramName] = "HLS Database Catalyst"),
            "PipeACR", [$ Consumption Pipeline All],
            "PipeCommittedACR", [$ Consumption Committed Pipeline All]
        ),
        'DimDate'[IsAzureClosedAndCurrentOpen] = "Y",
        'DimViewType'[ViewType] = "Curated"
    ),
    [PipeACR] + [PipeCommittedACR] * 1.5 + [StageSort] * 1000, DESC
)
```

> **Conversion likelihood ranking:** `[PipeACR] + [PipeCommittedACR] * 1.5 + [StageSort] * 1000`. Committed pipe weighted 1.5×; stage sort dominates so later-stage opps surface first within similar pipe sizes. Adjust weights in-context if user requests.

### Q7 — Strategic Pillar × Solution Play Breakdown (Full, Pillars)

```dax
EVALUATE
CALCULATETABLE(
    SUMMARIZECOLUMNS(
        'F_AzureConsumptionPipe'[StrategicPillar],
        'F_AzureConsumptionPipe'[SolutionPlay],
        FILTER('SalesProgram', 'SalesProgram'[ProgramName] = "HLS Database Catalyst"),
        "OppCount", DISTINCTCOUNT('F_AzureConsumptionPipe'[OpportunityNumber]),
        "MilestoneCount", DISTINCTCOUNT('F_AzureConsumptionPipe'[MilestoneNumber]),
        "PipeAll", [$ Consumption Pipeline All],
        "PipeCommitted", [$ Consumption Committed Pipeline All]
    ),
    'DimDate'[IsAzureClosedAndCurrentOpen] = "Y",
    'DimViewType'[ViewType] = "Curated"
)
ORDER BY [PipeAll] DESC
```

### Q8 — Gap Accounts: HLS DBC-tagged accounts with ZERO committed pipe (Full, GapAccts)

```dax
EVALUATE
FILTER(
    CALCULATETABLE(
        SUMMARIZECOLUMNS(
            'SalesProgram'[TPID],
            'F_AzureConsumptionPipe'[CRMAccountName],
            FILTER('SalesProgram', 'SalesProgram'[ProgramName] = "HLS Database Catalyst"),
            "ACR_LCM", [$ ACR Last Closed Month],
            "ACR_YTD", [$ ACR (YTD)],
            "PipeAll", [$ Consumption Pipeline All],
            "PipeCommitted", [$ Consumption Committed Pipeline All],
            "OppCount", DISTINCTCOUNT('F_AzureConsumptionPipe'[OpportunityNumber])
        ),
        'DimDate'[IsAzureClosedAndCurrentOpen] = "Y",
        'DimViewType'[ViewType] = "Curated"
    ),
    ISBLANK([PipeCommitted]) || [PipeCommitted] = 0
)
ORDER BY [ACR_LCM] DESC
```

### Q9 — WoW Movement Detail (Full, WoW)

```dax
EVALUATE
CALCULATETABLE(
    SELECTCOLUMNS(
        FILTER(
            'F_AzureConsumptionPipe',
            NOT(ISBLANK('F_AzureConsumptionPipe'[SalesStageCW1_Movement]))
                || NOT(ISBLANK('F_AzureConsumptionPipe'[CommitmentChangeCW1]))
                || NOT(ISBLANK('F_AzureConsumptionPipe'[DateChange_CW1]))
                || NOT(ISBLANK('F_AzureConsumptionPipe'[MilestoneStatusChangeCW1]))
        ),
        "OpportunityNumber", 'F_AzureConsumptionPipe'[OpportunityNumber],
        "OpportunityName", 'F_AzureConsumptionPipe'[OpportunityName],
        "Account", 'F_AzureConsumptionPipe'[CRMAccountName],
        "Owner", 'F_AzureConsumptionPipe'[OpptyOwnerAlias],
        "Stage", 'F_AzureConsumptionPipe'[SalesStageName],
        "StageMovement", 'F_AzureConsumptionPipe'[SalesStageCW1_Movement],
        "CommitmentChange", 'F_AzureConsumptionPipe'[CommitmentChangeCW1],
        "DateChange", 'F_AzureConsumptionPipe'[DateChange_CW1],
        "StatusChange", 'F_AzureConsumptionPipe'[MilestoneStatusChangeCW1],
        "MilestoneStatus", 'F_AzureConsumptionPipe'[MilestoneStatus],
        "EstUsage", 'F_AzureConsumptionPipe'[EstUsage],
        "MilestoneLink", 'F_AzureConsumptionPipe'[MilestoneLink]
    ),
    FILTER('SalesProgram', 'SalesProgram'[ProgramName] = "HLS Database Catalyst"),
    'DimDate'[IsAzureClosedAndCurrentOpen] = "Y",
    'DimViewType'[ViewType] = "Curated"
)
```

---

## Execution Notes

- **Batch the snapshot Q1–Q4 in a single `ExecuteQuery` call** by passing all four DAX strings in the `daxQueries` array.
- **Batch detail queries Q5–Q9 in a single `ExecuteQuery` call.** When mode is anything other than `Full`, pass only the gated queries.
- `maxRows: 50` cap is sufficient — the program is small (~12 opps as of build).
- Currency / count formatting is server-side; do NOT add `FORMAT()` wrappers (lose numeric type).
- Never call `GetReportMetadata` or `GetSemanticModelSchema`.
- If a column reference fails, **stop and report**; do not auto-discover. Update [schema-mapping.md](schema-mapping.md) instead.
