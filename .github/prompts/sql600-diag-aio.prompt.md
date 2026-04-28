---
agent: pbi-analyst
description: "SQL600 diagnostic: validates AIO model (MSA_AzureConsumption_Enterprise) queries used for cross-referencing SQL600 HLS data. Tests QA-BULK, QA2, QA3-ATTR with known-fragile column detection and RLS coverage analysis."
model: Claude Opus 4.6 (copilot)
---
# SQL600 Diagnostic — AIO Cross-Reference

Validate the Azure All-in-One (AIO) model queries that enrich the SQL600 HLS readout. The AIO model is the most fragile dependency — it has RLS, schema instability, and cross-filter issues that change across model refreshes. This diagnostic catches those problems before they corrupt a live readout.

## Known Failure Modes

| Failure Mode | Frequency | Impact | Detection |
|---|---|---|---|
| **RLS blocks** — user can't see certain accounts | Common | Missing accounts in MoM heatmap | TPID coverage < 50% |
| **QA2 pillar duplication** — `$ ACR` duplicates across `StrategicPillar` rows | Intermittent (model refresh dependent) | Wrong service mix chart, inflated per-pillar ACR | All pillars show same ACR value |
| **Budget targets not loaded** — `BudgetAttainPct` returns 0 for everyone | Periodic | Missing budget signals | All attainment values near 0 |
| **MonthStartDate renamed** — DimDate month column changed | Rare | QA-BULK query fails entirely | Column-not-found error |
| **AzureCustomerAttributes table missing** — removed in model refresh | Rare | No attribute badges in report | Table-not-found error |
| **Rate limiting** — AIO model throttles requests | Common during peak hours | Timeout or partial results | HTTP 429 or timeout |

## ⛔ Tool Restrictions

**NEVER call `GetSemanticModelSchema` or `GetReportMetadata` against either model.** Both models' schema responses are too large for the MCP tool to parse (known `MPC -32603` error). All schema validation uses targeted DAX queries. Schema is fully mapped in each skill's `schema-mapping.md`.

## Configuration

| Setting | Value |
|---|---|
| **AIO Semantic Model ID** | `726c8fed-367a-4249-b685-e4e22ca82b3d` |
| **SQL600 Semantic Model ID** | `c848b220-eaf2-42e0-b6d2-9633a6e39b37` |
| **Expected HLS TPIDs** | ~43 (extract from SQL600 model) |
| **Cached Month Column** | `MonthStartDate` (verified 2026-04) |

---

## Pre-requisite — Get TPID List from SQL600 Model

Before testing AIO queries, extract the TPID list from the SQL600 model (same list the real skill uses):

```dax
EVALUATE
SUMMARIZECOLUMNS(
    '2) Account'[TPID],
    '2) Account'[TopParent],
    FILTER('2) Account',
        '2) Account'[SQL600 Account] = TRUE()
        && '2) Account'[Industry] = "Healthcare"
    )
)
ORDER BY '2) Account'[TopParent] ASC
```

**Model:** `c848b220-eaf2-42e0-b6d2-9633a6e39b37`

Save the TPID list (expected: ~43 values). This becomes `{<TPID_LIST>}` for all AIO queries below.

---

## Test 1 — AIO Auth + Basic Schema

### 1a — Auth check

```dax
EVALUATE TOPN(1, 'DimDate')
```

**Model:** `726c8fed-367a-4249-b685-e4e22ca82b3d`

| Result | Interpretation |
|---|---|
| Returns data | ✅ Auth OK |
| 401/403/timeout | ❌ Stop — no further AIO tests possible |

### 1b — MonthStartDate column exists

```dax
EVALUATE
TOPN(3,
    SELECTCOLUMNS('DimDate',
        "MonthStartDate", 'DimDate'[MonthStartDate],
        "IsClosedOpen", 'DimDate'[IsAzureClosedAndCurrentOpen]
    )
)
```

| Result | Interpretation |
|---|---|
| 3 rows with datetime values | ✅ Cached column name still valid |
| Column not found | ❌ `MonthStartDate` renamed — probe full schema with `EVALUATE TOPN(1, 'DimDate')` to find new column |

### 1c — DimViewType has "Curated"

```dax
EVALUATE
SELECTCOLUMNS('DimViewType', "ViewType", 'DimViewType'[ViewType])
```

Check that `"Curated"` appears in results. If not → all AIO queries will return empty.

---

## Test 2 — QA-BULK (Account × Month ACR + Budget)

Use the first 10 TPIDs from the pre-requisite step to keep the test lightweight:

```dax
EVALUATE
SUMMARIZECOLUMNS(
    'DimCustomer'[TPID],
    'DimCustomer'[TPAccountName],
    'DimDate'[MonthStartDate],
    TREATAS({<FIRST_10_TPIDS>}, 'DimCustomer'[TPID]),
    FILTER('DimDate',
        'DimDate'[IsAzureClosedAndCurrentOpen] = "Y"
        && 'DimDate'[MonthStartDate] >= DATE(2024, 7, 1)
    ),
    TREATAS({"Curated"}, 'DimViewType'[ViewType]),
    "ACR", 'M_ACR'[$ ACR],
    "ACR_LCM", 'M_ACR'[$ ACR Last Closed Month],
    "BudgetAttainPct", 'M_ACRBudget'[% ACR Budget Attain (YTD)]
)
ORDER BY 'DimCustomer'[TPAccountName] ASC, 'DimDate'[MonthStartDate] ASC
```

**Validation:**

| Check | Expected | Fail Signal |
|---|---|---|
| Row count | > 0 (10 TPIDs × several months) | RLS blocking all accounts |
| Unique TPIDs in results | 5–10 (not all SQL600 TPIDs exist in AIO) | AIO TPID universe gap |
| `ACR` values | > 0 for most rows | ACR measure broken |
| `ACR_LCM` values | Non-BLANK for at least some rows | LCM measure broken |
| `BudgetAttainPct` values | Check if ALL are ≤ 0.01 | ⚠️ Budget targets not loaded |
| Month range | Jul 2024 through current month | Date filter issue |
| No duplicate (TPID, Month) pairs | Yes | Join grain broken |

### Budget Health Sub-Check

Count accounts where `BudgetAttainPct > 0.01`:
- If **0 accounts** → budget targets not loaded in this AIO refresh
- If **some but not all** → partial budget load (normal for some account types)
- If **all accounts** → ✅ budget data healthy

---

## Test 3 — QA2 (Account × Strategic Pillar) — FRAGILE

This is the most failure-prone query. Test with the same 10 TPIDs:

```dax
EVALUATE
SUMMARIZECOLUMNS(
    'DimCustomer'[TPID],
    'DimCustomer'[TPAccountName],
    'F_AzureConsumptionPipe'[StrategicPillar],
    TREATAS({<FIRST_10_TPIDS>}, 'DimCustomer'[TPID]),
    FILTER('DimDate',
        'DimDate'[IsAzureClosedAndCurrentOpen] = "Y"
        && 'DimDate'[MonthStartDate] >= DATE(2024, 7, 1)
    ),
    TREATAS({"Curated"}, 'DimViewType'[ViewType]),
    "ACR", 'M_ACR'[$ ACR]
)
ORDER BY 'DimCustomer'[TPAccountName] ASC, [ACR] DESC
```

**Validation — Pillar Duplication Check (critical):**

For each account (TPID) in the results:
1. Collect all `StrategicPillar` values and their `ACR`
2. Check if **all pillar ACR values are identical** (within 1%)

| Result | Interpretation |
|---|---|
| Different ACR per pillar (diverse ratios like 16%–61%) | ✅ QA2 working correctly — cross-filter scoping pillar-level ACR |
| All pillars show same ACR value (or nearly identical) | ❌ **DUPLICATION BUG** — `$ ACR` is not scoping by `StrategicPillar`. Fall back to Q10-DETAIL. |
| 0 rows returned | ⚠️ RLS or `F_AzureConsumptionPipe` table empty — fall back to Q10-DETAIL |
| Only 1 pillar per account | ⚠️ Pillar dimension collapsed — check column values |

### Duplication Detection Algorithm

```
For each TPID in QA2 results:
  pillars = all (StrategicPillar, ACR) rows for this TPID
  if len(pillars) > 1:
    acr_values = [p.ACR for p in pillars]
    max_acr = max(acr_values)
    min_acr = min(acr_values)
    if max_acr > 0 and (max_acr - min_acr) / max_acr < 0.05:
      → DUPLICATED (all pillars show same value)
    else:
      → DIVERSE (pillar breakdown is real)
```

If **any** account shows duplication → the entire QA2 result set is unreliable.

### QA2 vs. Q10-DETAIL Comparison

If QA2 passes the duplication check, compare against Q10-DETAIL for the same 10 TPIDs. Query Q10-DETAIL for those TPIDs:

```dax
EVALUATE
SUMMARIZECOLUMNS(
    '2) Account'[TPID],
    '2) Account'[TopParent],
    '3) Product'[StrategicPillar],
    FILTER('2) Account',
        '2) Account'[SQL600 Account] = TRUE()
        && '2) Account'[Industry] = "Healthcare"
        && '2) Account'[TPID] IN {<FIRST_10_TPIDS>}
    ),
    FILTER('1) Calendar', '1) Calendar'[Fiscal Year] = "FY26"),
    "ACR", [ACR (Total By Closed Month)]
)
ORDER BY '2) Account'[TopParent] ASC, [ACR] DESC
```

**Model:** `c848b220-eaf2-42e0-b6d2-9633a6e39b37` (SQL600)

Compare pillar rankings (not exact values — different time windows and measure definitions):
- Both should show similar top-2 pillars per account
- If pillar ordering is wildly different → one model's relationship chain is broken

---

## Test 4 — QA3-ATTR (Account Attributes)

```dax
EVALUATE
CALCULATETABLE(
    SELECTCOLUMNS(
        'AzureCustomerAttributes',
        "TPID", 'AzureCustomerAttributes'[TPID],
        "ESI_Tier", 'AzureCustomerAttributes'[ESI_Tier],
        "HasOpenAI", 'AzureCustomerAttributes'[HasOpenAI],
        "HasOpenAI_Pipe", 'AzureCustomerAttributes'[HasOpenAI_Pipe],
        "PTU_Target", 'AzureCustomerAttributes'[PTU_Target_Customer],
        "NetNewMigrationTarget", 'AzureCustomerAttributes'[NetNewMigrationTarget],
        "LXP_Category", 'AzureCustomerAttributes'[LXP_Category],
        "TrancheGrowthTarget", 'AzureCustomerAttributes'[TrancheGrowthTargetAccounts],
        "500K_100K_Target", 'AzureCustomerAttributes'[500K_100K_Targets],
        "GHCP_200Plus", 'AzureCustomerAttributes'[GHCPFY26200Plus],
        "GHCP_200Less", 'AzureCustomerAttributes'[GHCPFY26200Less]
    ),
    'AzureCustomerAttributes'[TPID] IN {<FIRST_10_TPIDS>}
)
```

**Validation:**

| Check | Expected | Fail Signal |
|---|---|---|
| Query succeeds | Yes | ❌ Table or column renamed/removed |
| Row count | 5–10 (not all TPIDs in attributes table) | ⚠️ Low coverage is normal |
| `ESI_Tier` values | Recognizable (e.g., "Tier 1", "Tier 2") | Attribute values changed |
| Mixed attribute values | Not all nulls or all same value | Data not populated |

**Column-by-column check:**

| Column | Fail if |
|---|---|
| `ESI_Tier` | All BLANK |
| `HasOpenAI` | All BLANK (should be Y/N mix) |
| `PTU_Target` | Column not found (renamed) |
| `NetNewMigrationTarget` | Column not found (renamed) |
| `LXP_Category` | Column not found (renamed) |
| `GHCPFY26200Plus` | Column not found (FY rollover renamed to FY27) |

---

## Test 5 — TPID Coverage Analysis

Run QA-BULK with the **full** TPID list (all 43):

```dax
EVALUATE
SUMMARIZECOLUMNS(
    'DimCustomer'[TPID],
    'DimCustomer'[TPAccountName],
    TREATAS({<ALL_43_TPIDS>}, 'DimCustomer'[TPID]),
    FILTER('DimDate', 'DimDate'[IsAzureClosedAndCurrentOpen] = "Y"),
    TREATAS({"Curated"}, 'DimViewType'[ViewType]),
    "ACR", 'M_ACR'[$ ACR]
)
ORDER BY 'DimCustomer'[TPAccountName] ASC
```

Count unique TPIDs in results vs. 43 sent:

| Coverage | Interpretation |
|---|---|
| 35–43 (80%+) | ✅ Good coverage |
| 20–34 (50–80%) | ⚠️ Partial — some TPIDs not in AIO universe. Note missing accounts. |
| < 20 (< 50%) | ❌ Significant gap — AIO data will be sparse. Consider whether AIO enrichment adds value. |
| 0 | ❌ Complete miss — RLS blocking or TPID format mismatch |

**Identify missing TPIDs:** Compare sent list against returned TPIDs. Report accounts that exist in SQL600 but not in AIO — these are structural gaps, not errors.

---

## Test 6 — Rate Limit Sensitivity

Run a timing test — send the full QA-BULK + QA2 + QA3-ATTR batch (as the real skill does) and note:

```
daxQueries: [
  <QA-BULK with all 43 TPIDs>,
  <QA2 with all 43 TPIDs>,
  <QA3-ATTR with all 43 TPIDs>
]
```

| Result | Interpretation |
|---|---|
| All 3 return within 30s | ✅ No rate limiting |
| 1–2 return, others timeout | ⚠️ Partial rate limit — retry after 30s |
| HTTP 429 | ❌ Rate limited — try during off-peak hours |
| > 60s response time | ⚠️ Model under heavy load |

---

## Output Format

```
## SQL600 Diagnostic — AIO Cross-Reference
Date: <today>
AIO Model: MSA_AzureConsumption_Enterprise (726c8fed-367a-4249-b685-e4e22ca82b3d)

### Pre-requisite
- SQL600 HLS TPIDs extracted: <n> accounts

### Auth & Schema
| Test | Status | Notes |
|---|---|---|
| AIO Auth | ✅/❌ | |
| MonthStartDate column | ✅/❌ | |
| DimViewType "Curated" | ✅/❌ | |

### QA-BULK (Account × Month ACR)
| Check | Expected | Actual | Status |
|---|---|---|---|
| Rows returned | > 0 | <n> | ✅/❌ |
| TPID coverage (of 10 test) | 5–10 | <n> | ✅/⚠️/❌ |
| Budget data loaded | Some > 0.01 | <n accounts> | ✅/⚠️ |
| No duplicate (TPID, Month) | Yes | <yes/no> | ✅/❌ |

### QA2 (Pillar Breakdown) — FRAGILE
| Check | Expected | Actual | Status |
|---|---|---|---|
| Rows returned | > 0 | <n> | ✅/⚠️/❌ |
| Diverse pillar values | 3+ distinct | <n distinct> | ✅/❌ |
| **Duplication check** | No duplication | <dup/diverse> | ✅/❌ |
| Pillar ranking vs Q10-DETAIL | Similar top-2 | <match/mismatch> | ✅/⚠️ |

### QA3-ATTR (Account Attributes)
| Check | Expected | Actual | Status |
|---|---|---|---|
| Query succeeds | Yes | <yes/no> | ✅/❌ |
| Rows returned | 5–10 | <n> | ✅/⚠️ |
| Attribute diversity | Mixed values | <yes/no> | ✅/⚠️ |

### TPID Coverage (Full 43)
- Sent: 43 TPIDs
- Matched in AIO: <n> (<pct>%)
- Missing accounts: <list>

### Rate Limit
- Batch response time: <seconds>
- Status: ✅/⚠️/❌

### Summary
- AIO usable for enrichment: **YES / PARTIAL / NO**
- QA2 pillar data: **RELIABLE / DUPLICATED (use Q10-DETAIL) / UNAVAILABLE**
- Budget data: **LOADED / NOT LOADED**
- Recommended action: <guidance>
```
