---
agent: pbi-analyst
description: "SQL600 diagnostic: compares data across the SQL600 and AIO models for the same accounts to detect cross-model drift, TPID mismatches, and ACR discrepancies. Also validates the full end-to-end data pipeline from PBI to report generation."
model: Claude Opus 4.6 (copilot)
---
# SQL600 Diagnostic — Cross-Model Consistency & Pipeline Validation

Validate that data across the SQL600 and AIO Power BI models is internally consistent, and that the end-to-end pipeline (PBI → JSON → HTML report) works without silent data loss. This catches:

- **Cross-model ACR discrepancy** — SQL600 and AIO report different ACR for the same accounts
- **TPID mapping gaps** — accounts exist in one model but not the other
- **Account name mismatches** — `TopParent` (SQL600) vs. `TPAccountName` (AIO) differ for same TPID
- **Pipeline data loss** — data correctly pulled from PBI but lost during normalization or report generation
- **Stale data detection** — one model refreshed but the other hasn't

## ⛔ Tool Restrictions

**NEVER call `GetSemanticModelSchema` or `GetReportMetadata` against either model.** Both models' schema responses are too large for the MCP tool to parse (known `MPC -32603` error). All validation uses targeted DAX queries.

## Configuration

| Setting | Value |
|---|---|
| **SQL600 Model ID** | `c848b220-eaf2-42e0-b6d2-9633a6e39b37` |
| **AIO Model ID** | `726c8fed-367a-4249-b685-e4e22ca82b3d` |

---

## Test 1 — ACR Parity Check (SQL600 vs. AIO)

Pull last-closed-month ACR from both models for the same accounts and compare.

### Step 1a — SQL600 per-account LCM ACR

```dax
EVALUATE
SUMMARIZECOLUMNS(
    '2) Account'[TPID],
    '2) Account'[TopParent],
    FILTER('2) Account',
        '2) Account'[SQL600 Account] = TRUE()
        && '2) Account'[Industry] = "Healthcare"
    ),
    "ACR_LCM", [ACR (Last Closed Month)]
)
ORDER BY '2) Account'[TopParent] ASC
```

**Model:** `c848b220-eaf2-42e0-b6d2-9633a6e39b37`

### Step 1b — AIO per-account LCM ACR

Using the TPIDs from Step 1a:

```dax
EVALUATE
SUMMARIZECOLUMNS(
    'DimCustomer'[TPID],
    'DimCustomer'[TPAccountName],
    TREATAS({<ALL_TPIDS>}, 'DimCustomer'[TPID]),
    FILTER('DimDate', 'DimDate'[IsAzureClosedAndCurrentOpen] = "Y"),
    TREATAS({"Curated"}, 'DimViewType'[ViewType]),
    "ACR_LCM", 'M_ACR'[$ ACR Last Closed Month]
)
ORDER BY 'DimCustomer'[TPAccountName] ASC
```

**Model:** `726c8fed-367a-4249-b685-e4e22ca82b3d`

### Comparison

Join on TPID. For each account:

| Check | Tolerance | Interpretation |
|---|---|---|
| SQL600 ACR ≈ AIO ACR (within 10%) | Normal | ✅ Models aligned — small differences from ETL timing |
| SQL600 ACR ≠ AIO ACR (> 20% difference) | Flag | ⚠️ Model refresh timing or measure definition drift |
| Account in SQL600 but not AIO | Expected for some | Note these accounts — AIO enrichment won't cover them |
| Account in AIO but not SQL600 | Unexpected | ❌ TPID filter issue |

**Portfolio-level check:** Sum all SQL600 LCM ACR vs. sum of matched AIO LCM ACR. Ratio should be 0.8–1.2 (accounting for AIO TPID coverage gaps).

---

## Test 2 — Account Name Matching

For accounts present in both models (matched by TPID), compare display names:

| SQL600 `TopParent` | AIO `TPAccountName` | Match? |
|---|---|---|
| <name> | <name> | ✅ / ⚠️ |

Flag mismatches. Minor differences (e.g., "ABBOTT LABORATORIES" vs. "Abbott Laboratories") are cosmetic. Major differences (completely different names for the same TPID) indicate a TPID mapping error.

---

## Test 3 — Pillar Breakdown Consistency (Q10-DETAIL vs. QA2)

If QA2 passed the duplication check (see `sql600-diag-aio`), compare pillar-level data:

### Step 3a — Q10-DETAIL (SQL600 model)

```dax
EVALUATE
SUMMARIZECOLUMNS(
    '2) Account'[TPID],
    '3) Product'[StrategicPillar],
    FILTER('2) Account',
        '2) Account'[SQL600 Account] = TRUE()
        && '2) Account'[Industry] = "Healthcare"
    ),
    FILTER('1) Calendar', '1) Calendar'[Fiscal Year] = "FY26"),
    "ACR", [ACR (Total By Closed Month)]
)
ORDER BY '2) Account'[TPID] ASC, [ACR] DESC
```

### Step 3b — QA2 (AIO model)

```dax
EVALUATE
SUMMARIZECOLUMNS(
    'DimCustomer'[TPID],
    'F_AzureConsumptionPipe'[StrategicPillar],
    TREATAS({<ALL_TPIDS>}, 'DimCustomer'[TPID]),
    FILTER('DimDate',
        'DimDate'[IsAzureClosedAndCurrentOpen] = "Y"
        && 'DimDate'[MonthStartDate] >= DATE(2024, 7, 1)
    ),
    TREATAS({"Curated"}, 'DimViewType'[ViewType]),
    "ACR", 'M_ACR'[$ ACR]
)
ORDER BY 'DimCustomer'[TPID] ASC, [ACR] DESC
```

### Comparison

For each TPID present in both:
1. **Top pillar match** — Does the #1 pillar by ACR match between models? (pillar names may differ slightly — "Data & AI" vs. "Data and AI")
2. **Pillar count** — Similar number of pillars per account? (±2 is normal)
3. **Relative proportions** — Top pillar's % of total similar between models? (within 15pp)

| Result | Interpretation |
|---|---|
| Top pillar matches for 80%+ of accounts | ✅ Models aligned on consumption patterns |
| Top pillar matches for 50–80% | ⚠️ Some divergence — likely different time windows |
| Top pillar matches for < 50% | ❌ Significant discrepancy — one model's pillar mapping is broken |

---

## Test 4 — Data Freshness Check

Detect which model refreshed more recently.

### SQL600 — Latest closed month

```dax
EVALUATE
CALCULATETABLE(
    TOPN(1,
        SELECTCOLUMNS('1) Calendar',
            "FiscalMonth", '1) Calendar'[Fiscal Month],
            "IsClosed", '1) Calendar'[IsClosed]
        ),
        '1) Calendar'[Fiscal Month], DESC
    ),
    '1) Calendar'[IsClosed] = TRUE()
)
```

**Model:** SQL600

### AIO — Latest closed month

```dax
EVALUATE
TOPN(1,
    CALCULATETABLE(
        SELECTCOLUMNS('DimDate',
            "MonthStartDate", 'DimDate'[MonthStartDate]
        ),
        'DimDate'[IsAzureClosedAndCurrentOpen] = "Y"
    ),
    'DimDate'[MonthStartDate], DESC
)
```

**Model:** AIO

### Comparison

| Result | Interpretation |
|---|---|
| Same latest closed month | ✅ Both models current |
| SQL600 1 month ahead | ⚠️ AIO refresh lagging — ACR comparisons will be off by 1 month |
| AIO 1 month ahead | ⚠️ SQL600 refresh lagging |
| > 1 month difference | ❌ Stale model — data comparisons unreliable |

---

## Test 5 — End-to-End Pipeline Test

Validate that the full data pipeline works: PBI query → JSON → helper scripts → HTML report.

### Step 5a — Check helper scripts exist

Verify these files are present in the workspace:
- `scripts/helpers/normalize-aio.js`
- `scripts/helpers/generate-sql600-report.js`
- `scripts/helpers/generate-next-steps.js`
- `scripts/helpers/enrich-sql600-accounts.js`

### Step 5b — JSON structure validation

If a recent data file exists (e.g., `.copilot/docs/sql600-data-*.json`), validate its structure:

**Required top-level keys:**

| Key | Type | Required | Source |
|---|---|---|---|
| `portfolioSnapshot` | object | ✅ | Q1 |
| `industryRanking` | array | ✅ | Q2 |
| `verticalBreakdown` | array | ✅ | Q3 |
| `acrTrend` | array | ✅ | Q4 |
| `verticalTrend` | array | ✅ | Q4B |
| `sql600PillarBreakdown` | array | ✅ | Q10-DETAIL |
| `topAccounts` | array | ✅ | Q5 |
| `renewalExposure` | array | ✅ | Q6 |
| `modernizationPipeline` | array | ✅ | Q7 |
| `gapAccounts` | array | ✅ | Q8 |
| `topOpportunities` | array | ✅ | Q9 |
| `aioAccountMoM` | array | Optional | QA-BULK |
| `aioBudgetAttainment` | array | Optional | QA-BULK |
| `aioServiceBreakdown` | array | Optional | QA2 |
| `aioAccountAttributes` | array | Optional | QA3-ATTR |
| `narratives` | object | Optional | LLM-generated |

### Step 5c — Report generation dry run

If data file exists, attempt to generate the report:

```bash
node scripts/helpers/generate-sql600-report.js .copilot/docs/sql600-data-<latest>.json --no-pdf --no-share --output /tmp/sql600-diag-test.html
```

| Result | Interpretation |
|---|---|
| HTML file generated, > 50KB | ✅ Pipeline works |
| Script errors with missing key | ❌ Data JSON schema changed — identify missing key |
| Script errors with module import | ❌ Dependency issue |
| HTML generated but < 10KB | ⚠️ Most sections empty — data coverage issue |

---

## Test 6 — Historical Consistency

If multiple data files exist from different dates, compare key metrics:

| Metric | Date 1 | Date 2 | Δ | Plausible? |
|---|---|---|---|---|
| Portfolio ACR LCM | <$> | <$> | <% change> | ✅/⚠️ (> 20% MoM unusual) |
| HLS Account Count | <n> | <n> | <Δ> | ✅ if same (account list rarely changes) |
| Total Opps | <n> | <n> | <Δ> | ✅/⚠️ (> 50% swing unusual) |
| Industry Rank | <n> | <n> | <Δ> | ✅ if stable (±1 normal) |

Large unexplained swings between runs suggest model refresh issues rather than real business changes.

---

## Output Format

```
## SQL600 Diagnostic — Cross-Model Consistency
Date: <today>

### ACR Parity (SQL600 vs. AIO)
- Accounts compared: <n> (of 43 SQL600 HLS)
- AIO coverage: <n> accounts (<pct>%)
- Portfolio ACR — SQL600: <$>, AIO: <$>, Ratio: <x>
- Accounts with > 20% discrepancy: <n>
  - <list with TPID, name, SQL600 ACR, AIO ACR, delta %>

### Account Name Mismatches
- <n> mismatches found
  - <TPID>: SQL600 "<name>" vs. AIO "<name>"

### Pillar Breakdown Consistency
- QA2 duplication status: RELIABLE / DUPLICATED / UNAVAILABLE
- Top-pillar match rate: <pct>%
- Assessment: ✅ / ⚠️ / ❌

### Data Freshness
| Model | Latest Closed Month | Status |
|---|---|---|
| SQL600 | <month> | ✅/⚠️ |
| AIO | <month> | ✅/⚠️ |

### Pipeline Test
| Step | Status | Notes |
|---|---|---|
| Helper scripts exist | ✅/❌ | |
| Data JSON valid | ✅/❌ | Missing keys: <list> |
| Report generates | ✅/❌ | |

### Summary
- Models aligned: **YES / PARTIAL / NO**
- Safe to run full readout: **YES / YES with caveats / NO**
- Action items: <list>
```
