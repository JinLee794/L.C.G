---
name: powerbi-hls-dbc-review
description: 'HLS Database Catalyst (DBC) program review — queries the MSA_AzureConsumption_Enterprise Power BI model live, scoped to the `SalesProgram[ProgramName] = "HLS Database Catalyst"` filter. Returns gap-to-target, pipeline coverage, top opportunities by conversion likelihood, account-level ACR ranking, strategic-pillar / solution-play breakdown, gap accounts (zero committed pipe), and WoW pipeline movement with risk flags. Optionally drafts Outlook follow-ups for opp owners. Triggers: HLS Database Catalyst, HLS DBC, HLS DBC review, Database Catalyst pipeline, HLS Catalyst program, DBC program review, HLS DBC gap to target, HLS DBC opportunities, HLS DBC pipeline, HLS DBC accounts, HLS DBC pillars, HLS DBC WoW, HLS DBC at risk. DO NOT USE FOR: SQL600 HLS portfolio (use powerbi-sql600-hls), broader Azure portfolio review (use powerbi-azure-all-in-one-review), SQL600 sales-play tagging audit (use sql600-tagging-audit).'
argument-hint: 'Optionally specify: "gap to target", "top opportunities", "pillars", "gap accounts", "WoW", "full readout", or "with drafts" for Outlook follow-up emails.'
---

# HLS Database Catalyst (DBC) Review (Power BI)

## Purpose

**Canonical skill for HLS Database Catalyst program review.** Queries the MSA_AzureConsumption_Enterprise Power BI semantic model live, scoped to the `SalesProgram[ProgramName] = "HLS Database Catalyst"` filter, to answer the seven core questions in one run:

1. **Gap to target** — ACR YTD vs. target for HLS DBC-tagged accounts
2. **Pipeline coverage** — committed / qualified / uncommitted ACR pipeline
3. **Top opportunities** ranked by conversion likelihood (stage, commitment, WoW movement)
4. **Account-level performance ranking** — ACR LCM, MoM, growth
5. **Strategic pillar / solution play breakdown** of HLS DBC pipeline
6. **Gap accounts** — HLS DBC-tagged opps with zero committed pipeline
7. **WoW pipeline movement** + risk flags

Always runs fresh PBI queries — vault snapshot notes are this skill's output for trend tracking and must never be read back as current state.

> **⚠️ Load Order:** Read **SKILL.md first** for the full flow. Sub-files are loaded on-demand:
> - [schema-mapping.md](schema-mapping.md) — table/column mapping, relationship model, DBC scope filter pattern
> - [query-rules.md](query-rules.md) — all DAX queries (snapshot + details)
> - [output-template.md](output-template.md) — vault persistence format
> - [draft-patterns.md](draft-patterns.md) — Outlook follow-up email templates

## When to Use

- Pre-meeting prep for HLS Database Catalyst program reviews
- Weekly DBC pipeline pass to check coverage and movement
- Ad-hoc "what's going on with HLS DBC?" requests
- Follow-up drafting for opp owners with at-risk or stale DBC milestones

## Freedom Level

**Medium** — DAX queries and scope filter are exact. Risk synthesis and severity assignment use judgment.

## Runtime Contract

| Tool | Purpose | Expected Calls |
|---|---|---|
| `powerbi-remote:ExecuteQuery` | All PBI data retrieval | **2** (combined snapshot + combined details) |
| `mail:CreateDraftMessage` | Outlook follow-up drafts (Step 5 only, user-requested) | 0 unless requested |
| `oil:get_note_metadata` | Check vault note existence before write | 1 |
| `oil:create_note` / `oil:atomic_replace` | Persist report to vault | 1 |

### Removed from Runtime

| Tool | Why Removed |
|---|---|
| `powerbi-remote:GetReportMetadata` | Report ID + page hardcoded. Auth verified by first `ExecuteQuery`. |
| `powerbi-remote:GetSemanticModelSchema` | Schema fully mapped in [schema-mapping.md](schema-mapping.md). **Never call.** If a column error occurs, fail with a message to update schema-mapping.md — do not auto-discover. |

## Configuration

| Setting | Value | Notes |
|---|---|---|
| **Report ID** | `d07c4e15-95f9-42f6-8411-59293f6895a1` | MSA_AzureConsumption_Enterprise report (page `ReportSection48c9715c72acdffebcd1`) |
| **Semantic Model ID** | `726c8fed-367a-4249-b685-e4e22ca82b3d` | MSA_AzureConsumption_Enterprise in BICOE_Prod_BICore_Azure01 |
| **Sales Program Filter** | `'SalesProgram'[ProgramName] = "HLS Database Catalyst"` | **Always active** — exact value, case-sensitive |
| **Date Filter** | `'DimDate'[IsAzureClosedAndCurrentOpen] = "Y"` | YTD closed months + current open month |
| **View Type** | `'DimViewType'[ViewType] = "Curated"` | Standard curated view |
| **Vault Output Path** | `Daily/HLS-DBC/hls-dbc-review-<YYYY-MM-DD>.md` | See [output-template.md](output-template.md) |

---

## Flow

> **⚠️ DISPATCH RULE — ALWAYS DELEGATE TO `pbi-analyst`.**
> This skill MUST be executed by the `pbi-analyst` subagent. If not already running inside `pbi-analyst`, immediately call `runSubagent` with `agentName: "pbi-analyst"` and pass the full user request + today's date.

### Step 0 — Mode Selection (no tool call)

Scope is **always hardcoded** to `'SalesProgram'[ProgramName] = "HLS Database Catalyst"`. No user disambiguation needed.

Determine readout mode:

| User says | Mode | Detail queries to run |
|---|---|---|
| "full readout", "HLS DBC", "DBC review" (generic) | **Full** | All Q5–Q9 |
| "gap to target", "vs target" | **Gap** | Q5 (account ranking) only |
| "top opportunities", "top opps", "conversion" | **Opps** | Q6 (top opportunities) only |
| "pillars", "solution play", "workload mix" | **Pillars** | Q7 (pillar breakdown) only |
| "gap accounts", "no pipeline", "GCP leakage" | **GapAccts** | Q8 (gap accounts) only |
| "WoW", "movement", "trend" | **WoW** | Q9 (WoW movement) only |

Default to **Full** if ambiguous.

If user adds "with drafts" → Step 5 will draft Outlook follow-ups for HIGH / CRITICAL items.

### Step 1 — Combined Auth + Snapshot + Aggregate Counts (1 PBI call)

**This single `ExecuteQuery` call replaces auth-check, snapshot, and aggregate-count queries.**

Use the combined snapshot batch from [query-rules.md](query-rules.md) § Snapshot Batch (Q1–Q4):

1. **Q1 — Program KPI snapshot** — account count, opp count, ACR YTD, ACR LCM, ACR target YTD, pipeline (all/committed/qualified/uncommitted), WoW change. **Also serves as auth verification** — if this fails, auth is broken.
2. **Q2 — Stage breakdown** — milestone counts and pipeline $ by `SalesStageName`
3. **Q3 — Vertical breakdown** — accounts and pipeline by HLS vertical (Payor/Provider/Pharma/MedTech)
4. **Q4 — Sales-stage WoW snapshot** — counts of milestones moved into Qualified/Committed last week

**If the query fails:** Stop. Do not fall back to `GetReportMetadata` or `GetSemanticModelSchema`. Report the error.

**In parallel with this PBI call**, fire `oil:get_note_metadata` for the vault output path (`Daily/HLS-DBC/hls-dbc-review-<YYYY-MM-DD>.md`).

### Step 2 — Combined Detail Queries (1 PBI call, conditional)

**Skip logic:** If `MilestoneCount = 0` from Q1, skip this step entirely (program has no active opps in scope).

Run the detail queries from [query-rules.md](query-rules.md) § Detail Batch, scoped to the readout mode from Step 0. Up to 4 queries can be batched in one `ExecuteQuery` `daxQueries` array call:

| Query | What it returns | Mode gate |
|---|---|---|
| **Q5 — Account ranking** | Top 25 accounts by ACR LCM, with PipeAll, PipeCommitted, ACR YoY, Budget Attain | Full, Gap |
| **Q6 — Top opportunities** | Top 25 opps ranked by conversion likelihood (stage + commitment + WoW movement composite) | Full, Opps |
| **Q7 — Pillar / solution-play breakdown** | StrategicPillar × SolutionPlay × OppCount × pipeline $ | Full, Pillars |
| **Q8 — Gap accounts** | HLS DBC-tagged accounts with zero committed pipeline | Full, GapAccts |
| **Q9 — WoW movement detail** | Milestones with stage / commitment / date changes in CW-1 | Full, WoW |

**Row limit:** 50 total per query. The full DBC program is small (~12 opps today), so caps rarely bind.

### Step 3 — Risk Synthesis (no tool call)

Pure in-context logic. Apply tiers:

| Tier | Criteria |
|---|---|
| 🔴 **CRITICAL** | Past-due milestone completion + Stage 3+ + PipeACR ≥ $250K, OR an account with zero committed pipe AND ACR LCM ≥ $1M (high GCP leakage signal) |
| 🟡 **HIGH** | Stale > 60d in current stage, OR negative WoW pipeline change > $100K, OR milestone status = Blocked / At Risk |
| 🟠 **MEDIUM** | Missing required fields (no `EstUsage`, no `MilestoneCompletionDateEstimated`), or stage inflation (Stage 4+ but `MilestoneStatus` ≠ Committed) |

### Step 4 — Output

Present per [output-template.md](output-template.md): Program Snapshot → Pillar Breakdown → Top Accounts → Top Opportunities → Gap Accounts → WoW Movement → Risk Summary → Recommended Actions.

### Step 5 — Outlook Follow-Up Drafts (user-requested only)

If user requests drafts/emails:

1. **Batch owner resolution**: Collect unique `OpptyOwnerAlias` values from CRITICAL + HIGH items. Single vault `People/` search, then a single `mail:SearchMessages` batch for any misses.
2. **Delegate to `@m365-actions`**: Hand off pre-rendered draft payloads (subject, to, HTML body with CRM links from `'F_AzureConsumptionPipe'[CRMLink]`).
3. Every draft MUST surface its `webLink` in the output table per [draft-patterns.md](draft-patterns.md).

### Step 6 — Vault Persistence (parallel with Step 5 if drafts requested)

**Freedom Level: Low** — Use [output-template.md](output-template.md) exactly.

1. Path: `Daily/HLS-DBC/hls-dbc-review-<YYYY-MM-DD>.md`
2. Use vault metadata from parallel check in Step 1. Call `oil:create_note` or `oil:atomic_replace`.
3. Fill every frontmatter field per template. Include `program_filter`, `account_count`, `opp_count`, `pipe_committed`, `pipe_all`.

---

## Decision Logic

| Condition | Action |
|---|---|
| `MilestoneCount = 0` from Q1 | Report "No active HLS DBC milestones in current scope" — skip Step 2 |
| All committed pipe rows are null/0 | Tag the program as 🔴 NO COMMITTED COVERAGE in headline |
| `PipeWoWChange < -$100K` | Surface "⚠️ Pipeline declined WoW" prominently |
| Account in Q8 (gap accounts) with ACR LCM ≥ $1M | Tag "🔴 GCP LEAKAGE RISK" |
| PBI `ExecuteQuery` fails | Stop. Report error. Do not fall back. |
| User says "with drafts" | Execute Step 5 (delegate to `@m365-actions`) |

## Call Budget

| Scenario | PBI Calls | OIL Calls | Mail Calls | Total |
|---|---|---|---|---|
| **Standard run (no drafts)** | 2 | 2 (1 metadata + 1 persist) | 0 | **4** |
| **Empty program (MilestoneCount=0)** | 1 | 2 | 0 | **3** |
| **With drafts (N owners)** | 2 | 2 | N (via `@m365-actions`) | **4 + N** |

## Output Schema

- `program_snapshot`: KPI row (accounts, opps, ACR YTD vs target, pipeline tiers, WoW)
- `stage_breakdown`: milestone counts and $ by SalesStageName
- `vertical_breakdown`: accounts + pipe by HLS vertical
- `pillar_breakdown`: StrategicPillar × SolutionPlay × OppCount × pipe $
- `top_accounts`: ranked account performance
- `top_opportunities`: ranked opps with conversion-likelihood signals
- `gap_accounts`: HLS DBC accounts with zero committed pipe
- `wow_movement`: milestones with CW-1 stage/commitment/date changes
- `risk_summary`: CRITICAL / HIGH / MEDIUM lists
- `recommended_actions`: per-owner concrete next steps
- `drafts_created`: subject, recipient, webLink (if Step 5)
- `vault_path`: persisted vault note path

## Guardrails

- **Always scoped to `'SalesProgram'[ProgramName] = "HLS Database Catalyst"`.** Never run unscoped against the AIO model from this skill.
- **Always execute fresh PBI queries.** Never read vault snapshots as current state.
- **Never call `GetReportMetadata` or `GetSemanticModelSchema`.** Schema is hardcoded in [schema-mapping.md](schema-mapping.md).
- **Maximum 2 `ExecuteQuery` calls per run.** If you're making more, you're not using the combined queries.
- **ACR measures show full account-level ACR**, not opp-restricted — see [schema-mapping.md](schema-mapping.md) § ACR Filter Propagation Caveat. Always disclose this in output.
- Read-only analysis. No CRM writes, no Teams posts.
- Email drafts only when explicitly requested. Delegate to `@m365-actions`.
- `contentType` for email drafts: always `"HTML"`.
