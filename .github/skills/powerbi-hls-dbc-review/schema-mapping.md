# Schema Mapping — MSA_AzureConsumption_Enterprise (HLS DBC scope)

> Loaded on-demand by `powerbi-hls-dbc-review`. Hardcoded — never call `GetSemanticModelSchema` from this skill.

## Model Identifiers

| Field | Value |
|---|---|
| Workspace | `BICOE_Prod_BICore_Azure01` (`1CE1A10E-D56E-4E96-8147-CC06BABA1E9E`) |
| Semantic Model | `MSA_AzureConsumption_Enterprise` (`726c8fed-367a-4249-b685-e4e22ca82b3d`) |
| Report | `MSA_AzureConsumption_Enterprise` (`d07c4e15-95f9-42f6-8411-59293f6895a1`) |
| Source page | `ReportSection48c9715c72acdffebcd1` |

## Always-Active Filters (apply to every query)

```dax
'SalesProgram'[ProgramName] = "HLS Database Catalyst"
'DimDate'[IsAzureClosedAndCurrentOpen] = "Y"
'DimViewType'[ViewType] = "Curated"
```

These three are the inherited base scope. Wrap any `SUMMARIZECOLUMNS` in `CALCULATETABLE(..., <filter args>)`. Bare predicates as `SUMMARIZECOLUMNS` arguments will fail.

## Tables Used

### `SalesProgram` (bridge)

Filter table for the program scope. Joins to opportunities.

| Column | Type | Use |
|---|---|---|
| `OpportunityNumber` | string | Opp join key to `F_AzureConsumptionPipe` |
| `ProgramName` | string | **Filter column** — exact value `"HLS Database Catalyst"` |
| `ProgramType` | string | Higher-level grouping |
| `TPID` | int | Account join key to `DimCustomer` |
| `DimOpportunityKey` | int | Opportunity surrogate key |
| `AreaID` | int | Sales area |
| `ProgramSubType` | string | Sub-classification |

### `F_AzureConsumptionPipe` (opportunity / milestone fact)

Primary fact for opportunity, milestone, and pipeline detail.

| Column | Use |
|---|---|
| `OpportunityNumber`, `DimOpportunityKey` | Joins to SalesProgram |
| `MilestoneNumber`, `MilestoneName`, `MilestoneOwner`, `MilestoneOwnerStandardTitle`, `MilestoneOwnerManagerAlias` | Milestone identity + ownership |
| `MilestoneStatus`, `MilestoneStatusReason`, `MilestoneStatusReasonCombined` | Health status |
| `MilestoneCompletionDateEstimated`, `EstDate`, `EstUsage` | Estimated completion + usage |
| `MilestoneLink`, `CRMLink` | Deep links for Outlook drafts |
| `OpptyOwnerAlias`, `OpptyOwnerRole`, `OpptyOwnerManagerAlias`, `OpptyOwnershipGroup`, `OpptyCreatedBy` | Opp ownership |
| `OpportunityName`, `CRMAccountName` | Display labels |
| `SalesStageName`, `StageSort`, `Stage_Velocity_Group`, `DaysInSalesStage` | Stage state |
| `SalesStageCW1`, `SalesStageCW1_Movement`, `SalesStageCM1`, `SalesStageCM1_Movement` | WoW / MoM stage movement |
| `CommitmentRecommendation`, `CommitmentChangeCW1`, `CommitmentStatusCombined` | Commitment posture + WoW change |
| `DateChange_CW1`, `DateChange_CM1` | Date drift signals |
| `MilestoneStatusChangeCW1`, `MilestoneStatusChangeCM1` | Status drift signals |
| `StrategicPillar`, `SuperStrategicPillar`, `SubStrategicPillar`, `SolutionPlay`, `Workload`, `WorkloadType`, `Azure Workload Solution Play`, `OpptySolutionPlay` | Pillar + workload taxonomy |
| `ProductName` | Product detail (used for noise filter) |
| `PrimaryCompetitor`, `Competitor`, `CompeteThreatLevel` | Competitive posture |
| `RiskBlockerDetails`, `HelpNeeded`, `Need` | Risk + ask context |
| `IsCommercial`, `AzureGov`, `IsOpptySharedWithPartner`, `PartnerKey` | Segment / partner flags |
| `CRMForecastComments`, `MilestoneComments` | Free-text commentary |

### `DimCustomer`

Customer master.

| Column | Use |
|---|---|
| `TPID` | Join key to SalesProgram + facts |
| `AE` | Account Executive alias |

> **Note:** `DimCustomer` columns beyond `TPID`, `AE` are intentionally not catalogued here. Use `CRMAccountName` from `F_AzureConsumptionPipe` for display. If a query needs more DimCustomer columns, run a one-off `GetSemanticModelSchema` and update this file.

### `DimDate`

Date dim.

| Column | Use |
|---|---|
| `IsAzureClosedAndCurrentOpen` | Always `"Y"` (base filter) |
| `FY_Rel` | Fiscal-year offset (`"FY"`, `"FY+1"`, `"FY-1"`) |

### `DimViewType`

| Column | Use |
|---|---|
| `ViewType` | Always `"Curated"` (base filter) |

### `M_ACR` (measure table)

Key measures used:

- `[$ ACR (YTD)]` — Account-level ACR YTD
- `[$ ACR Last Closed Month]` — Account-level ACR LCM
- `[$ ACR Target (YTD)]`, `[$ ACR Target (FY)]`
- `[$ ACR Left To Go (YTD)]`, `[$ ACR Net New Required]`
- `[% ACR Attain (YTD)]`, `[% ACR Attain]`
- `[$ ACR MoM Change (Last Closed Month)]`, `[% ACR MoM Change (Last Closed Month)]`
- `[% ACR YTD YoY Change]`, `[$ YoY ACR YTD Change]`
- `[# Consuming Accounts]`
- `[% Qualified Pipe NNR Coverage]`, `[% Committed NNR Consumption Pipe Coverage]`

### `M_ACRPipe` (measure table)

Key measures used:

- `[$ Consumption Pipeline All]`, `[$ Consumption Committed Pipeline All]`, `[$ Qualified Pipeline all]`, `[$ Stage 1 Pipe all]`
- `[$ Consumption Pipeline All WoW Change]`, `[$ Consumption Pipeline MoM Change]`
- `[$ Consumption Committed Pipe WoW Change]`, `[$ Qualified Pipe WoW Change]`
- `[# Opportunities]`, `[# Committed Opps]`, `[# Qualified Opps]`, `[# Stage 1 Opps]`
- `[# Committed Opps WoW Change]`, `[# Qualified Opps WoW Change]`
- `[# Milestones]`, `[# Milestones Blocked or At Risk]`
- `[$ At Risk Pipeline]`, `[$ Blocked Pipeline]`, `[$ Blocked Committed Pipeline]`
- `[# Accounts w/ Engagement]`, `[# Accounts w/ Committed Pipe]`, `[# Accounts w/out Any Pipeline]`
- `[$ Engagements Moved Into Qualified Last Week]`, `[# Engagements Moved Into Upper Stages Last Week]`

## Relationship Model (key paths used)

```
SalesProgram[OpportunityNumber] ──► F_AzureConsumptionPipe[OpportunityNumber]
SalesProgram[TPID]              ──► DimCustomer[TPID]
F_AzureConsumptionPipe[DateID]  ──► DimDate
F_AzureConsumptionPipe[*]       ──► DimViewType (via context)
M_ACR / M_ACRPipe measures      ── operate over the full F_AzureConsumption fact (not F_AzureConsumptionPipe)
```

## ACR Filter Propagation Caveat (IMPORTANT)

`SalesProgram` is an **opportunity-level** bridge. The `M_ACR` measures (`$ ACR`, `$ ACR Last Closed Month`, `$ ACR (YTD)`) are computed from `F_AzureConsumption` (consumption fact, not pipe). The opportunity-level `SalesProgram` filter does NOT restrict consumption fact rows directly.

**Effect:** When you filter `SalesProgram[ProgramName] = "HLS Database Catalyst"`:
- ✅ Opp / milestone / pipeline counts are correctly scoped via the SalesProgram→F_AzureConsumptionPipe relationship
- ⚠️ Account-level ACR ($, YTD, LCM, MoM, Target) reflects the **full Azure consumption** of the 12 accounts that have at least one HLS DBC opp, NOT consumption tied to those specific opps

**This is the same behavior as the source PBI report.** Always disclose in output: *"ACR figures show full Azure consumption for accounts with ≥1 HLS DBC-tagged opportunity, not opp-restricted spend."*

## Account Count Pattern

To count distinct accounts in scope, use **`DISTINCTCOUNT('SalesProgram'[TPID])`**, NOT `DISTINCTCOUNT('DimCustomer'[TPID])`. The DimCustomer dim does not auto-filter to the SalesProgram scope in measure-row contexts; counting on the bridge column itself is required.

## Filter Pattern (canonical)

```dax
EVALUATE
CALCULATETABLE(
    SUMMARIZECOLUMNS(
        FILTER('SalesProgram', 'SalesProgram'[ProgramName] = "HLS Database Catalyst"),
        <optional group-by columns>,
        "<measure name>", [<measure>]
    ),
    'DimDate'[IsAzureClosedAndCurrentOpen] = "Y",
    'DimViewType'[ViewType] = "Curated"
)
```

`FILTER('SalesProgram', ...)` MUST be the first SUMMARIZECOLUMNS argument so it acts as the bridge filter table. The two CALCULATETABLE filter args are bare-predicate-allowed.

## Validated Reference Run (as of build)

For `'SalesProgram'[ProgramName] = "HLS Database Catalyst"`:

- 12 distinct accounts, 12 opportunities, 14 milestones in scope
- ACR YTD: $2.36B (full account ACR; see caveat above)
- ACR LCM: $287M
- Pipeline All: $67.5K, Committed: $57.3K, Qualified: $66K
- Strategic Pillars represented: Azure SQL Core, App Platform Services, MySQL & PostgreSQL PaaS, Databricks, Serverless, Defender for Cloud, Rest of Infra, Integration Services
- Solution Plays represented: Migrate and Modernize Your Estate, Innovate with Azure AI Apps and Agent, Unify Your Data Platform, Other Infra
