# Output Template — SQL600 HLS Executive Readout

> **Freedom Level: Low** — Use this template exactly. Do not improvise heading names, reorder sections, or omit frontmatter fields. Sections with zero results should note "None detected", not be omitted.

## Vault Path

```text
Daily/SQL600-HLS/sql600-hls-readout-<YYYY-MM-DD>.md
```

Use `oil:create_note` for new notes, `oil:atomic_replace` if the note already exists for the same date.

## Frontmatter Schema

```yaml
---
tags: [sql600, hls, dbc, executive-readout]
generated: <YYYY-MM-DD>
source: pbi
model: SQL 600 Performance Tracking
scope: "SQL600 HLS (Healthcare)"
hls_account_count: <int>
total_sql600_accounts: 251
acr_lcm: "<formatted $>"
acr_mom_direction: "<↑|↓|→>"
acr_yoy_pct: "<formatted %>"
annualized_growth: "<formatted $>"
pipe_committed: "<formatted $>"
pipe_uncommitted: "<formatted $>"
pipe_qualified: "<formatted $>"
pipeline_penetration: "<formatted %>"
sql_tam: "<formatted $>"
sql_cores: "<formatted #>"
wow_change: "<formatted $>"
wow_direction: "<↑|↓|→>"
mod_opps: <int>
factory_attach_pct: "<formatted %>"
accts_with_mod_pipe: <int>
accts_without_mod_pipe: <int>
gap_account_count: <int>
industry_rank: <int>
readout_mode: "<Full|Accounts|Renewal|Modernization|Trend|Ranking|AIODeepDive|AccountDrill>"
aio_data_available: <true|false>
---
```

### Field Rules

| Field | Type | Rule |
|---|---|---|
| `acr_lcm` | string | Always quoted. Compact format: `"$15.4M"`. Never raw number. |
| `acr_mom_direction` | string | Arrow based on last 2 closed months comparison. `↑` if positive, `↓` if negative, `→` if flat (< 1% change). |
| `annualized_growth` | string | Always quoted. Compact format: `"$196.3M"`. |
| `pipe_committed` | string | Always quoted. Can be negative (blocked > committed). |
| `wow_change` | string | Always quoted. Include sign: `"+$1.3B"` or `"-$450K"`. |
| `wow_direction` | string | Arrow based on `wow_change` sign. |
| `industry_rank` | int | Ordinal position by ACR LCM among all SQL600 industries. 1 = highest. |
| `gap_account_count` | int | Count of HLS SQL600 accounts with zero committed pipeline. |

### What does NOT go in frontmatter

- Account-level detail → body tables only
- Opportunity detail → body tables only
- Renewal specifics → body sections only

---

## Body Template

```markdown
# SQL600 HLS Executive Readout — <Month Day, Year>

---

## 📋 Executive Summary

> **Freedom Level: Medium** — Write a 3–5 paragraph executive narrative that can be read in two minutes and gives the full picture without scrolling further. Derive every claim from the data in this readout — no hardcoded framing. Recompute comparisons and positions each time.

<Paragraph 1 — Performance headline:>
<State ACR LCM, YoY growth %, industry rank among SQL600 industries, and annualized growth. Name the dominant vertical and its share of total HLS ACR, noting the top single-account contributor and its portfolio share.>

<Paragraph 2 — Pipeline health:>
<State pipeline penetration (accounts with pipe / total), committed pipe, uncommitted pipe. Call out concentration risk: which vertical holds the majority of committed pipe and which vertical is undercovered relative to its account count. Frame the delta as both a growth ceiling risk and a competitive exposure.>

<Paragraph 3 — Renewal exposure:>
<State the number of accounts in Q3/Q4 renewal windows, total SQL cores exposed, and how many have committed modernization pipeline. Name the 2–3 highest-risk accounts (by core count × lack of pipeline) requiring immediate DBC positioning to prevent GCP capture.>

<Paragraph 4 — Modernization execution:>
<State total mod opps, factory attach rate vs. target, and the link between factory utilization and uncommitted pipeline conversion. Frame increasing factory attach as the fastest lever for converting uncommitted pipe and strengthening competitive position against GCP leakage.>

<Paragraph 5 — Trajectory outlook:>
<Summarize the ACR trend direction across FY26 (start → end, % gain, any notable dips/inflections). Connect renewal window urgency + factory attach gap to the execution demand in the remaining quarter. Frame as: momentum is real but the window is time-bounded.>

---

> **Portfolio:** <hls_account_count> HLS accounts · <total_sql600_accounts> total SQL600 · **Industry Rank:** #<rank> of <industry_count> SQL600 industries by ACR

## 🎯 Headline

**<ACR_LCM>** ACR (LCM) · <acr_mom_direction> MoM · **<annualized_growth>** annualized growth since June '25
**<wow_change>** WoW movement (<wow_direction>) · Pipeline Penetration: **<pipeline_penetration>**

> <one- or two-line DBC narrative — derive from this readout's actuals. Compare HLS's pipeline penetration and annualized growth to the SQL600 average computed in the Industry Ranking section, then state the factual position neutrally (ahead / in line with / behind). Where the comparison is notable, reinforce it with 1–2 correlated data points from elsewhere in this readout (e.g., ACR MoM/YoY direction, WoW delta, factory attach %, mod pipeline coverage, renewal exposure, gap-account count). Only cite correlations actually supported by the numbers — do not invent causation.>

### KPI Snapshot

> Present as a compact grid — not a full table. Group related metrics on one line using `·` separators. Bold the values.

- **ACR (LCM):** <acr_lcm> · **YoY:** <acr_yoy_pct> · **Ann. Growth:** <annualized_growth>
- **Committed Pipe:** <pipe_committed> · **Uncommitted Pipe:** <pipe_uncommitted> · **Qualified Pipe:** <pipe_qualified>
- **Pipeline Penetration:** <pipeline_penetration> (<accts_with_pipe>/43 accounts) · **Total Opps:** <total_opps> (<qualified_opps> qualified)
- **SQL Cores:** <sql_cores> · **SQL TAM:** <sql_tam> · **WoW Δ:** <wow_change>
- **Mod Opps:** <mod_opps> · **Factory Attach:** <factory_attach> ⚠️ · **Accounts w/o Mod Pipe:** <accts_without>

---

## 📈 ACR Trajectory (FY26)

| Month | ACR |
|---|---|
<for each month in Q4 result:>
| <MMM yyyy> | <$formatted> |

> <trend narrative — direction, inflection points, trajectory interpretation. Where possible, correlate inflections with supporting signals from other sections (e.g., a jump in committed pipeline, a large renewal closing, mod-opps ramp, top-account expansion). Keep it factual — note the correlation, not a causal claim.>

---

## 🏥 Vertical Breakdown

| Vertical | Accounts | ACR (LCM) | Committed Pipe | Uncommitted Pipe | Growth | Mod Opps |
|---|---|---|---|---|---|---|
<for each vertical:>
| <vertical> | <count> | <acr> | <committed> | <uncommitted> | <growth> | <mod_opps> |

> <vertical narrative — call out the dominant vertical by ACR share, the underperforming vertical by per-account ACR or committed coverage, and the concentration risk. Note which verticals are growth levers vs. which need activation.>

---

## 🏆 Industry Ranking (SQL600)

| Rank | Industry | Accounts | ACR (LCM) | Committed Pipe |
|---|---|---|---|---|
<for each industry, sorted by ACR DESC:>
| <rank> | <industry> | <count> | <acr> | <committed> |

> <narrative — derived from the ranking table above. State HLS's rank, the gap (absolute or %) vs. the top industry and vs. the SQL600 average, and whether HLS is ahead/in line/behind. Reinforce with correlated signals where they strengthen or complicate the position (e.g., HLS pipeline penetration vs. ranking peers, committed pipe concentration, mod-opps share, factory attach). No hardcoded framing — recompute from the data each time.>

---

## 🔝 Top Accounts

| # | Account | Vertical | Segment | ACR (LCM) | Committed | Uncommitted | Ann. Growth | Next Step |
|---|---|---|---|---|---|---|---|---|
<for each top account:>
| <n> | <TopParent> | <vertical> | <segment> | <acr> | <committed> | <uncommitted> | <growth> | <sql modernization next step> |

> Omit TPID column from the display table — it clutters the executive view. TPID is available in frontmatter and JSON for drill-through.

---

## ⚠️ Renewal Watch

| Account | Category | Renewal Q | SQL Cores | Arc? | ACR (LCM) | Committed | Status |
|---|---|---|---|---|---|---|---|
<for each renewal account, sorted by SQL Cores DESC:>
| <TopParent> | <category> | **<renewal_q>** | <cores> | <arc> | <acr> | <committed> | <status_badge> |

**Status badge logic:**
- **🔴 AT RISK** — Renewal in current or next quarter AND zero committed pipeline AND no Arc
- **⚠️ NO PIPE** — Zero committed pipeline (any renewal quarter)
- **✅ covered** — Has committed pipeline covering the renewal

> <renewal narrative — Q3/Q4 exposure, accounts needing immediate DB mod positioning. Name the 2–3 highest-risk accounts by core count × lack of pipeline.>

---

## 🏭 Modernization Coverage

> Present as compact KPI callouts, not a table.

- **Accounts with Mod Pipeline:** <accts_with> / <total_hls>
- **Accounts without Mod Pipeline:** <accts_without>
- **Modernization Opportunities:** <mod_opps>
- **Factory Attach Rate:** <factory_attach> ⚠️ (target: 15%)

> <modernization narrative — coverage gaps, factory leverage opportunities. Quantify the impact of closing the factory attach gap (e.g., "increasing from X% to 20% would accelerate N mod opps").>

---

## 🧠 Modernization + AI Enablement Outlook

> <forward-looking narrative — connect SQL modernization decisions now to downstream AI readiness (Azure OpenAI/copilot/data-platform needs), and call out where delay will create re-platforming risk later. Reference pipeline penetration, factory attach, and specific accounts where the connection is strongest.>

---

## 🔴 GCP Leakage Risk (Zero Committed Pipeline)

| Account | Vertical | ACR (LCM) | Uncommitted | SQL Cores | Next Step |
|---|---|---|---|---|---|
<for each gap account, sorted by SQL Cores DESC:>
| <TopParent> | <vertical> | <acr> | <uncommitted> | <cores> | <next_step> |

> <competitive narrative — state total gap account count and combined SQL cores. Highlight the top 3–4 accounts by core count. Frame: what HLS customers aren't spending with us, they're spending with GCP. DB mod positioning directly competes with GCP capture.>

---

## 🔍 Azure Consumption Deep Dive (AIO Cross-Reference)

> **Source:** MSA_AzureConsumption_Enterprise (Azure All-in-One)
> Only present when AIO data is available. If AIO queries were skipped or failed, omit this entire section.

### Account MoM ACR Heatmap

| Account | <Mon 1> | <Mon 2> | <Mon 3> | ... | <Mon N> | MoM Δ | Direction |
|---|---|---|---|---|---|---|---|
<for each account, months as columns:>
| <TopParent> | <$ACR> | <$ACR> | <$ACR> | ... | <$ACR> | <$change> | <↑/↓/→> |

> <MoM narrative — call out accounts with sustained growth vs. declining trajectories. Correlate with SQL600 pipeline state: accounts growing consumption without modernization pipeline represent untapped SQL conversion opportunity.>

### Service Pillar Mix (ACR by Strategic Pillar)

| Account | Data & AI | Infra | Digital & App | Security | Modern Work | BizApps | SQL-Adjacent % |
|---|---|---|---|---|---|---|---|
<for each account:>
| <TopParent> | <$ACR> | <$ACR> | <$ACR> | <$ACR> | <$ACR> | <$ACR> | <pct of Data&AI + Infra> |

> <service mix narrative — highlight accounts where SQL-adjacent pillars (Data & AI + Infra) are a large share of total spend (high modernization leverage) vs. accounts where they're small (untapped). Flag where Migrate & Modernize solution play is active vs. absent.>

### Budget Attainment Overlay

| Account | ACR YTD | ACR LCM | Budget Attain % | Signal |
|---|---|---|---|---|
<for each account, sorted by attainment ASC:>
| <TopParent> | <$ACR> | <$ACR> | <pct> | <signal> |

**Signal logic:**
- **🟢 Ahead** — Budget attainment ≥ 100%
- **🟡 On track** — Budget attainment 80–99%
- **🔴 Below target** — Budget attainment < 80%
- **⚫ No data** — Budget attainment not available

> <budget narrative — flag accounts below 80% attainment with SQL600 pipeline context. Accounts below target AND without committed SQL pipeline need immediate attention.>

---

## 💡 Key Takeaways

- [!] <most important insight — bold the DBC impact>
- [*] <pipeline/growth highlight>
- [d] <risk or declining trend if any>
- [?] <open question or data gap>
```

## Revenue/Value Formatting

| Range | Format | Example |
|---|---|---|
| ≥ $1B | `$X.XB` | `$1.8B` |
| ≥ $1M | `$X.XM` | `$15.4M` |
| ≥ $1K | `$XXXK` | `$454K` |
| < $1K | `$XXX` | `$867` |
| Negative | `(-$X.XM)` | `(-$7.7M)` |
| Zero/Blank | `—` | |
| Percentages | `XX.X%` | `76.7%` |
| Counts | `#,###` | `208,484` |

### Direction Arrows

| Condition | Arrow |
|---|---|
| Current > Prior | ↑ |
| Current < Prior | ↓ |
| Abs change < 1% | → |

Always pair arrow with $ or % delta: `↑ +$1.5M` or `↓ -2.3%`.
