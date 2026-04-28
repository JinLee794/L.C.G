# Schema Mapping — SQL 600 Performance Tracking

Semantic model `c848b220-eaf2-42e0-b6d2-9633a6e39b37`. Schema fully resolved — **never call `GetSemanticModelSchema`**. The model's schema response is too large for the MCP tool to parse (fails with `MPC -32603` at `verifiedAnswers[0].Bindings.Values`). If a column error occurs, update this file manually.

---

## Tables & Key Columns

### ◦ Measure (measure container)

All pre-built measures live here. No columns — measures only.

#### ACR Measures (`v___1__ACR` display folder)

| Measure | Type | Format | Notes |
|---|---|---|---|
| `ACR` | Decimal | $#,0 | Default ACR — includes current open month |
| `ACR (Last Closed Month)` | Decimal | $#,0 | **Primary ACR metric** — last fully closed month |
| `ACR (Total By Closed Month)` | Decimal | $#,0 | Use for time-series (model author instruction) |
| `ACR (Monthly Average)` | Decimal | $#,0 | |
| `ACR (Standardized Month YTD)` | Decimal | $#,0 | |
| `ACR (YTD)` | Decimal | $#,0 | Year-to-date |
| `ACR (June 2025 Baseline)` | Decimal | — | FY26 baseline anchor |
| `ACR (June 2025)` | Decimal | $#,0 | Specific month |
| `Baseline ACR` | Decimal | $#,0 | |
| `ACR (LY)` | Integer | — | Last year comparison |
| `ACR Change Δ% - YTD YoY` | Double | 0% | Year-over-year delta |
| `ACR % of Column Total` | Double | — | Share of total |
| ~~`Annualized ACR Growth (since June 2025)`~~ | ~~Decimal~~ | ~~$#,0~~ | **REMOVED from model Apr 2026.** Now computed from AIO aioAccountMoM: `(latestClosedACR − June2025ACR) × 12` |
| ~~`Annualized ACR Growth + Pipeline`~~ | ~~Double~~ | ~~$#,0~~ | **REMOVED from model Apr 2026.** Computed as AnnualizedGrowth + PipeQualified |
| `ACR (Excluding Current Month)` | Decimal | $#,0 | |
| `Baseline ACR (Current Open Month Onwards)` | Double | $#,0 | |
| `Realized ACR + Baseline + Pipe` | Double | $#,0 | **Composite forward view** |

#### WoW Snapshot Measures

| Measure | Type | Format | Notes |
|---|---|---|---|
| `ACR (Last Week Snapshot)` | Double | — | |
| `ACR (Excluding Current Month) (Last Week Snapshot)` | Double | $#,0 | |
| `Baseline ACR (Current Open Month Onwards) (Last Week Snapshot)` | Double | — | |
| `Pipeline ACR (Last Week Snapshot)` | Double | — | |
| `Pipeline ACR (Committed excl Blocked) (Last Week Snapshot)` | Double | $#,0 | |
| `Realized ACR + Baseline + Pipe (Last Week Snapshot)` | Double | $#,0 | |
| `Realized ACR + Baseline + Pipe WoW Change $` | Double | $#,0 | **Key WoW delta** |

#### Pipeline Measures (`v___2__Pipeline` display folder)

| Measure | Type | Format | Notes |
|---|---|---|---|
| `Pipeline ACR (Committed excl Blocked)` | Double | $#,0 | **Primary committed pipeline** |
| `Pipeline ACR (Uncommitted)` | Double | $#,0 | |
| `Pipeline ACR (Qualified)` | Double | $#,0 | |
| `Pipeline ACR (Unqualified)` | Double | $#,0 | |
| `Pipeline ACR (Committed FY26)` | Double | $#,0 | FY26 scoped |
| `Pipeline ACR (Uncommitted FY26)` | Double | $#,0 | FY26 scoped |
| `# of Qualified Opportunities` | Integer | #,0 | |
| `# of Opportunities` | Integer | 0 | |
| `Unqualified Pipe (FY26)` | Double | $#,0 | |
| `Blocked Pipe (FY26)` | Double | $#,0 | |

#### SQL600 & Modernization Measures

| Measure | Type | Format | Notes |
|---|---|---|---|
| ~~`SQL 600 Pipeline Penetration %`~~ | ~~Double~~ | ~~0.0%~~ | **REMOVED from model Apr 2026.** Computed as AcctsWithModPipe / AccountCount |
| `Annualized SQL TAM` | Double | $#,0 | Total Addressable Market |
| `Total SQL Cores` | Double | #,0 | On-prem SQL Server footprint |
| `Accounts With Modernization Pipeline` | Integer | 0 | |
| `Accounts Without Modernization Pipeline` | Integer | 0 | GCP leakage risk signal |
| `Modernization Opportunities` | Integer | #,0 | |
| `Modernization Opportunities With Factory Case` | Integer | 0 | |
| `Qualified Modernization Pipe Without Factory` | Double | $#,0 | Execution gap signal |
| `Factory Attach to Modernization Opportunities` | Double | 0.0% | |

#### Budget & Projection

| Measure | Type | Format | Notes |
|---|---|---|---|
| `Budget` | Double | $#,0 | |
| `PBO VTB (All-Up)` | Double | $#,0 | Plan vs. Budget vs. Outlook |

---

### ✽ ACR (fact)

ACR at the Fiscal Month and Sub Strategic Pillar level.

| Column | Type | Format | Notes |
|---|---|---|---|
| `TPID` | Integer | 0 | FK → `'2) Account'[TPID]` |
| `Fiscal Month` | DateTime | MMM yyyy | FK → `'1) Calendar'[Fiscal Month]` |
| `Sub Strategic Pillar` | Text | | FK → `'3) Product'[SubStrategicPillar]` |
| `ACR` | Decimal | $#,0 | Raw ACR value |

### ✽ ACR (Last Week Snapshot) (fact)

Same grain as ACR fact, frozen at prior week's ETL.

| Column | Type | Notes |
|---|---|---|
| `TPID` | Integer | |
| `FiscalMonth` | DateTime | |
| `SubStrategicPillar` | Text | |
| `StrategicPillar` | Text | |
| `ETLDate` | DateTime | Snapshot timestamp |
| `ACR` | Double | |

### ✽ Pipeline (fact)

Pipeline at opportunity + milestone grain.

| Column | Type | Format | Notes |
|---|---|---|---|
| `TPID` | Integer | 0 | FK → `'2) Account'[TPID]` |
| `OpportunityID` | Text | | |
| `OpportunityName` | Text | | |
| `OpportunityStatus` | Text | | |
| `OpportunityCreatedDate` | DateTime | | |
| `OpportunityOwnershipGroup` | Text | | |
| `OpportunityStage` | Text | | Full stage name |
| `SalesStageShort` | Text | | Abbreviated |
| `MilestoneID` | Text | | |
| `MilestoneName` | Text | | |
| `MilestoneEstimatedMonth` | DateTime | MMM yyyy | |
| `MilestoneFiscalMonth` | DateTime | MMM yyyy | FK → `'1) Calendar'[Fiscal Month]` |
| `MilestonePastDue` | Text | | |
| `MilestoneStatus` | Text | | |
| `MilestoneCategory` | Text | | |
| `MilestoneWorkload` | Text | | FK → `'◦ Workload Bridge'[Workload]` |
| `MilestoneCreator` | Text | | |
| `MilestoneOwner` | Text | | |
| `MilestoneCommitment` | Text | | |
| `MilestoneLink` | Text | | CRM deep link |
| `QualifiedFlag` | Text | | |
| `PipelineACR` | Double | | Raw pipeline $ |
| `OpportunityLink` | Text | | CRM deep link |
| `DaysInSalesStage` | Integer | 0 | |
| `OpportunityOwner` | Text | | |
| `StrategicPillar` | Text | | |
| `EstimatedMonthlyMilestoneUsage` | Double | | |
| `MilestoneHelpNeeded` | Text | | |
| `PartnerDealDirection` | Text | | |
| `PartnerOneName` | Text | | |
| `Modernization Workload Flag` | Double | | 1 = modernization workload |
| `Factory Cases.Opportunity ID` | Text | | FK to Factory Cases |

### ✽ Pipeline Last Week Snapshot (fact)

Same grain as Pipeline, frozen at prior week's ETL. Additional columns:

| Column | Type | Notes |
|---|---|---|
| `CompetitorThreatLevel` | Text | Competitive signal |
| `ForecastComments` | Text | |
| `ForecastRecommendation` | Text | |
| `GBBAttachFlag` | Text | |
| `SnashotDate` | Text | (sic — typo in model) |

---

### 1) Calendar (dimension)

| Column | Type | Format | Notes |
|---|---|---|---|
| `Fiscal Year` | Text | | e.g. `FY26` |
| `Fiscal Half` | Text | | e.g. `FY26-H1` |
| `Fiscal Quarter` | Text | | e.g. `FY26-Q3` |
| `Fiscal Month` | DateTime | MMM yyyy | PK — joins to all fact tables |
| `YTD Flag` | Text | | `YTD` or `Future` |
| `TimeRefFlag` | Text | | |
| `IsClosed` | Boolean | | TRUE = month fully closed |
| `Relative_Month_in_FY` | Integer | | 1–12 |
| `Quarter` | Integer | | 1–4 |

### 2) Account (dimension)

| Column | Type | Format | Notes |
|---|---|---|---|
| `TPID` | Integer | 0 | **PK** — joins to all fact tables |
| `TopParent` | Text | | **Primary account name** (per model author instructions) |
| `Region` | Text | | |
| `Subsidiary` | Text | | |
| `SummarySegment` | Text | | |
| `Segment` | Text | | e.g. `Strategic — Commercial` |
| `SubSegment` | Text | | |
| `SalesUnit` | Text | | |
| `FieldRegion` | Text | | e.g. `US HLS` |
| `FieldArea` | Text | | |
| `FieldAreaShorter` | Text | | **Use in tables** (compact) |
| `FieldAreaDetail` | Text | | |
| `FieldAccountabilityUnit` | Text | | |
| `Area` | Text | | |
| `Industry` | Text | | **HLS = `"Healthcare"`** |
| `Vertical` | Text | | Health Payor / Provider / Pharma / MedTech |
| `SQL600 Account` | Boolean | | **TRUE = in SQL600 list** |
| `SQL Arc Enabled` | Text | | |
| `SQL Renewal Month` | DateTime | MMMM yyyy | |
| `ContractTermEndDate` | DateTime | | |
| `UnifiedSupportFlag` | Text | | |
| `MALFlag` | Text | | |
| `MACCTPIDFlag` | Text | | |
| `Tag` | Text | | |
| `ATU` | Text | | |
| `ATUGroup` | Text | | |

### 3) Product (dimension)

| Column | Type | Notes |
|---|---|---|
| `StrategicPillar` | Text | Top-level grouping |
| `SubStrategicPillar` | Text | FK for ACR fact |
| `SuperStrategicPillar` | Text | |
| `Workload` | Text | FK for Workload Bridge |
| `SolutionPlay` | Text | |
| `SolutionPlayShort` | Text | |

### 4) Sellers (dimension)

| Column | Type | Notes |
|---|---|---|
| `Role` | Text | |
| `Alias` | Text | FK → Security tables |
| `Manager` | Text | |
| `Email` | Text | |
| `Title` | Text | |
| `Qualifier I` | Text | |
| `Qualifier II` | Text | |

### SQL 500 Target List (reference)

| Column | Type | Format | Notes |
|---|---|---|---|
| `TPID` | Integer | 0 | FK ↔ `'2) Account'[TPID]` (bidirectional) |
| `Top Parent` | Text | | |
| `Field Area` | Text | | |
| `Field Region` | Text | | |
| `SQL 500 category` | Text | | Values: `SQL Renewals`, `Top SQL Cores (Excl. renewals)`, `Other / Field Nominated` |
| `SQL Renewal Quarter` | Text | | e.g. `FY26-Q4`, `FY26-Q3`, null |
| `$500K+ SQL Renewal` | Integer | | 1 = yes |
| `$1M+ SQL Billed` | Integer | | 1 = yes |
| `Total SQL Cores` | Integer | #,0 | On-prem SQL footprint |
| `SQL Arc Enabled?` | Text | | |
| `% of SQL Reclass used` | Double | 0% | |

### SQL 500 SQL TAM (reference)

| Column | Type | Format | Notes |
|---|---|---|---|
| `TPID` | Integer | 0 | FK ↔ `'2) Account'[TPID]` (bidirectional) |
| `SQL TAM` | Double | $#,0 | Total Addressable Market |

### SQL TAM & Cores (LCM Only) (reference)

| Column | Type | Notes |
|---|---|---|
| `TPAccountID` | Integer | FK ↔ `'2) Account'[TPID]` (bidirectional) |
| `FiscalMonth` | DateTime | |
| `AnnualizedSQLTAM` | Double | |
| `SQLCores` | Double | |

### SQL Renewal Month (reference)

| Column | Type | Format | Notes |
|---|---|---|---|
| `TPID` | Integer | 0 | FK ↔ `'2) Account'[TPID]` (bidirectional) |
| `EarliestRenewalDate` | DateTime | MMMM yyyy | |

### Factory Cases (reference)

| Column | Type | Notes |
|---|---|---|
| `Case ID` | Text | |
| `TPID` | Integer | |
| `Opportunity ID` | Text | FK ↔ `'✽ Pipeline'[OpportunityID]` (bidirectional) |
| `Committed Amount` | Double | |
| `Status` | Text | |
| `Offer Name` | Text | |
| `Solution Play` | Text | |
| `Created Date` | DateTime | |
| `End Date` | DateTime | |
| `Days Overdue` | Integer | |
| `Azure Accelerate Status` | Text | |
| `Primary Workload` | Text | |

### Fact_Budget (fact)

Budget targets by area/subsidiary/segment/pillar.

| Column | Type | Notes |
|---|---|---|
| `FiscalMonth` | DateTime | FK → Calendar |
| `Area` | Text | |
| `FieldAccountabilityUnit` | Text | |
| `StrategicPillar` | Text | FK → Product |
| `ACR Budget` | Double | |
| `BudgetKey` | Text | FK → `'2) Account'[BudgetKey]` |

### Fact_Projection (fact)

ACR baseline projections by TPID.

| Column | Type | Notes |
|---|---|---|
| `TPID` | Integer | FK → Account |
| `FiscalMonth` | DateTime | FK → Calendar |
| `StrategicPillar` | Text | FK → Product |
| `AzureConsumedRevenueBaseline` | Double | |

---

## Relationship Model

```
                    ┌──────────────┐
                    │ 1) Calendar  │
                    │  Fiscal Month│ (PK)
                    └──┬───┬───┬──┘
                       │   │   │
              ┌────────┘   │   └────────────┐
              ▼            ▼                ▼
        ┌─────────┐  ┌──────────┐    ┌─────────────┐
        │ ✽ ACR   │  │✽ Pipeline│    │Fact_Projection│
        │  TPID   │  │  TPID    │    │   TPID       │
        └────┬────┘  └────┬─────┘    └──────┬───────┘
             │            │                  │
             ▼            ▼                  ▼
        ┌────────────────────────────────────────┐
        │              2) Account                 │
        │  TPID (PK)                              │
        │  SQL600 Account, Industry, Vertical     │
        └──┬────┬────┬────┬──────────────────────┘
           │    │    │    │
           ▼    ▼    ▼    ▼
    ┌──────┐ ┌────┐ ┌────┐ ┌─────────────┐
    │SQL500│ │SQL │ │SQL │ │SQL TAM&Cores│
    │Target│ │TAM │ │Ren │ │ (LCM Only)  │
    │ List │ │    │ │Moon│ │             │
    └──────┘ └────┘ └────┘ └─────────────┘
     (bidir)  (bidir) (bidir) (bidir)

  3) Product ──► ✽ ACR (via SubStrategicPillar)
  3) Product ──► ◦ Workload Bridge ──► ✽ Pipeline (via Workload/MilestoneWorkload)
  Factory Cases ◄──► ✽ Pipeline (via Opportunity ID, bidirectional)
```

**Key constraints:**
- Account → ACR and Account → Pipeline are **unidirectional** (Account filters facts, not reverse)
- Account ↔ SQL500 Target List, SQL TAM, SQL Renewal Month, SQL TAM & Cores are all **bidirectional** — cross-filtering works both directions
- Pipeline → Calendar is via `MilestoneFiscalMonth`, NOT a generic date
- Factory Cases ↔ Pipeline is **bidirectional** via `Opportunity ID`
- Workload Bridge sits between Product and Pipeline — filter flows Product → Bridge → Pipeline

---

## Scope Filter Patterns

### Mandatory HLS Scope

All queries in this skill use SUMMARIZECOLUMNS with the HLS filter applied via FILTER on `'2) Account'`:

```dax
FILTER('2) Account',
    '2) Account'[SQL600 Account] = TRUE()
    && '2) Account'[Industry] = "Healthcare"
)
```

For queries against `SQL 500 Target List` (bidirectional relationship), use CALCULATETABLE instead:

```dax
CALCULATETABLE(
    ...,
    '2) Account'[SQL600 Account] = TRUE(),
    '2) Account'[Industry] = "Healthcare"
)
```

### Known Filter Values

#### Industry (SQL600 accounts, by count)
| Value | Count |
|---|---|
| Healthcare | 43 |
| Financial Services | 37 |
| Government | 29 |
| Software, Data & Platforms | 26 |
| Industrials & Manufacturing | 22 |
| Retail & Consumer Goods | 19 |
| Energy & Resources | 17 |
| Prof & Business Services | 16 |
| Automotive, Mobility, Transpt | 15 |
| Telecommunications & Media | 15 |
| Education | 4 |
| Defense & Intelligence | 3 |
| Commercial Other Industries | 2 |

#### Vertical (Healthcare only)
| Value | Count |
|---|---|
| Health Provider | 25 |
| MedTech | 9 |
| Health Payor | 6 |
| Health Pharma | 3 |

#### SQL 500 Category
- `SQL Renewals`
- `Top SQL Cores (Excl. renewals)`
- `Other / Field Nominated`

#### SQL Renewal Quarter (Healthcare)
- `FY26-Q3`
- `FY26-Q4`
- `null` (no renewal tracked)

### Model Author Custom Instructions

> If no timeline is provided, always filter on "FY26" on `[Fiscal Year]` in `'1) Calendar'`.
> "ACR", "Azure Consumed Revenue", and "Consumption" are synonyms. All in $s.
> "Pipe", "Pipeline ACR", and "Pipeline" are synonyms. All in $s.

---

## Azure All-in-One (AIO) Cross-Reference Model

**Model:** MSA_AzureConsumption_Enterprise (MSXI BICOE)
**Semantic Model ID:** `726c8fed-367a-4249-b685-e4e22ca82b3d`
**Report ID:** `d07c4e15-95f9-42f6-8411-59293f6895a1`

Used **only** for cross-referencing SQL600 HLS accounts with full Azure consumption data. Provides month-over-month ACR at account level, budget attainment, and pipeline broken down by strategic pillar and solution play — enriching the SQL600 view with service-level granularity.

### Join Key

| SQL600 Model | AIO Model | Notes |
|---|---|---|
| `'2) Account'[TPID]` | `'DimCustomer'[TPID]` | Integer, exact match |

TPID list is gathered from SQL600 Q5 (Top Accounts) + Q8 (Gap Accounts) + Q6 (Renewal Accounts) and passed to AIO queries via `TREATAS`.

### AIO Tables & Columns Used

#### DimCustomer (dimension)

| Column | Type | Notes |
|---|---|---|
| `TPID` | Integer | PK — join key to SQL600 |
| `TPAccountName` | Text | Display name (may differ slightly from SQL600 `TopParent`) |

#### DimDate (dimension)

| Column | Type | Notes |
|---|---|---|
| `IsAzureClosedAndCurrentOpen` | Text | `"Y"` = YTD closed months + current open. **Always filter to "Y".** |
| `FY_Rel` | Text | `"FY"` = current fiscal year |
| `MonthStartDate` | DateTime | **Cached month-grain column.** Use for all time-series AIO queries. Verified 2026-04. |

> **⚠️ Cached Month Column:** `MonthStartDate` is hardcoded in [query-rules.md](query-rules.md) AIO queries. If a DAX error reports "column not found", run `EVALUATE TOPN(1, 'DimDate')` once to rediscover and update both this file and query-rules.md.

#### DimViewType (dimension)

| Column | Type | Notes |
|---|---|---|
| `ViewType` | Text | `"Curated"` — **always filter to "Curated"**. Use `TREATAS({"Curated"}, 'DimViewType'[ViewType])` in SUMMARIZECOLUMNS — bare equality is invalid as a filter argument. |

#### M_ACR (measure group)

| Measure | Notes |
|---|---|
| `$ ACR` | Total ACR — works at any grain in the query |
| `$ ACR Last Closed Month` | Snapshot: last fully closed month ACR |

#### M_ACRBudget (measure group — budget)

| Measure | Notes |
|---|---|
| `% ACR Budget Attain (YTD)` | Budget attainment percentage YTD. **⚠️ Lives in `M_ACRBudget`, NOT `M_ACR`** (verified 2026-04-28). |

#### F_AzureConsumptionPipe (fact — pipeline)

| Column | Type | Notes |
|---|---|---|
| `TPID` | Integer | Account FK |
| `CRMAccountName` | Text | |
| `OpportunityName` | Text | |
| `OpportunityNumber` | Text | |
| `SalesStageName` | Text | Full stage name |
| `CommitmentRecommendation` | Text | |
| `MilestoneStatus` | Text | `"In Progress"`, `"Not Started"`, `"Blocked"` |
| `MilestoneName` | Text | |
| `MilestoneOwner` | Text | |
| `MilestoneCompletionMonth` | Text | |
| `SolutionPlay` | Text | e.g. `"Migrate & Modernize"` |
| `StrategicPillar` | Text | e.g. `"Data & AI"`, `"Infra"` |
| `SuperStrategicPillar` | Text | |
| `CRMLink` | Text | Opportunity deep link |
| `IsOpptySharedWithPartner` | Text | |

#### M_ACRPipe (measure group — pipeline)

| Measure | Notes |
|---|---|
| `$ Consumption Pipeline All` | All pipeline ACR |
| `$ Qualified Pipeline Prior Week all` | Prior week qualified |
| `$ Consumption Committed Pipeline Prior Week All` | Prior week committed |

### SQL600-Relevant Service Mapping (AIO StrategicPillar → SQL600 Workloads)

These AIO pillars and solution plays map to SQL600-relevant services. Used to filter/highlight the service breakdown:

| AIO StrategicPillar | SQL600 Relevance | Notes |
|---|---|---|
| `Data & AI` | **Primary** | Core SQL modernization, Cosmos DB, PostgreSQL, analytics |
| `Infra` | **High** | SQL VM IaaS migrations, Arc-enabled SQL Server |
| `Digital & App Innovation` | Medium | App modernization that pulls along DB modernization |
| `Security` | Low | Relevant only when tied to data governance |
| `Business Applications` | Low | Peripheral |
| `Modern Work` | Not relevant | |

| AIO SolutionPlay | SQL600 Relevance |
|---|---|
| `Migrate & Modernize` | **Primary** — direct SQL migration motions |
| `Build and Modernize AI Apps` | **High** — AI apps require modernized data layer |
| `Infra and Database Migration to Azure` | **Primary** — includes database migrations |
| `Innovate with AI Services` | Medium — downstream of data modernization |
> When asked about customers/accounts, return `[TopParent]` from `'2) Account'`.
> When asked about opportunities, include `[OpportunityID]`, `[OpportunityName]`, `[OpportunityLink]`.
> If asked about ACR in any other context, use `ACR (Total by Closed Month)`.
> Always round up to nearest whole number. Add $s for ACR or Pipeline.
> When providing customer tables, always include: TPID, TopParent, FieldAreaShorter, FieldAreaDetail, Segment.
