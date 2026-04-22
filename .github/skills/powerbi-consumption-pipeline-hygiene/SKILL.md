---
name: powerbi-consumption-pipeline-hygiene
description: 'Consumption pipeline hygiene — queries the CAIP ACR & Pipeline Power BI model live for consumption actuals and pipeline health. Flags declining ACR, stale opportunities, past-due milestones, concentration risk, and pipeline coverage gaps. Produces prioritized exception report with severity tiers and optional Outlook follow-up drafts. Persists results to vault for trend tracking. Triggers: consumption pipeline hygiene, consumption pipeline health, consumption exceptions, consumption pipeline review, ACR review, ACR portfolio, ACR health, ACR by account, ACR pipeline coverage, azure consumption, azure ACR. DO NOT USE FOR: billed pipeline hygiene or forecast exceptions (use powerbi-billed-pipeline-hygiene). IMPORTANT: If the user asks for generic "pipeline hygiene" without specifying billed or consumption, always ask which one before proceeding.'
argument-hint: 'Optionally specify TPID list, account roster, segment filter, or "with drafts" for Outlook follow-up emails.'
---

# Consumption Pipeline Hygiene (Power BI)

## Purpose

**Canonical skill for consumption pipeline hygiene requests.** Queries the CAIP ACR & Pipeline Power BI semantic model live to detect consumption and pipeline exceptions across the portfolio. Always runs fresh PBI queries — vault snapshot notes are this skill's output for trend tracking and must never be read back as current state.

> **⚠️ Disambiguation:** This skill covers **consumption pipeline** (ACR) only. For **billed pipeline** (MSBilledPipelineCurated), use `powerbi-billed-pipeline-hygiene`. If the user asks for generic "pipeline hygiene" without specifying billed or consumption, **always ask which one they want**.

> **⚠️ Load Order:** Read **SKILL.md first** for the full flow. Sub-files are loaded on-demand:
> - [schema-mapping.md](schema-mapping.md) — table/column/measure mapping, relationship model, DAX patterns
> - [health-rules.md](health-rules.md) — aggregate + detail exception queries (4a–4e)
> - [draft-patterns.md](draft-patterns.md) — Outlook follow-up email templates
> - [output-template.md](output-template.md) — vault persistence format

## When to Use

- Any consumption pipeline hygiene, health, or cleanup request
- Weekly/bi-weekly consumption hygiene pass before forecast calls
- Identifying accounts with declining ACR and stale pipeline
- Assessing concentration risk and pipeline coverage gaps
- Pre-meeting consumption briefing for account or territory reviews

## Freedom Level

**Medium** — DAX generation requires adaptive judgment; scope resolution, filter construction, and severity assignment are exact.

## Runtime Contract

| Tool | Purpose |
|---|---|
| `powerbi-remote:GetReportMetadata` | Confirm semantic model ID |
| `powerbi-remote:GetSemanticModelSchema` | Schema discovery (skip when schema-mapping.md is current) |
| `powerbi-remote:ExecuteQuery` | Execute DAX queries |
| `mail:CreateDraftMessage` | Outlook follow-up drafts (Step 7 only, user-requested) |
| `oil:get_note_metadata` | Check vault note existence before write |
| `oil:create_note` / `oil:atomic_replace` | Persist report to vault |

## Configuration

| Setting | Value | Notes |
|---|---|---|
| **Semantic Model ID** | `f71df8c0-e435-4354-b444-e4014e964b5f` | CAIP ACR & Pipeline (Business Precision workspace) |
| **Report ID** | `8b16b5da-616c-4452-84ea-2c30e09cc1f8` | CAIP ACR & Pipeline report |
| **Fiscal Year Filter** | Current FY (resolved at runtime via `'1) Calendar'`) | Use `'1) Calendar'[Fiscal Year]` — e.g. `"FY26"` |
| **ACR Threshold** | `$100,000` | Suppress accounts below this for portfolio-level view |
| **Max Rows** | `200` | Top N accounts by ACR descending |
| **MBS Included** | `No` | 1P ACR only — Marketplace Billed Sales excluded |
| **Segment Exclusion** | `SMEC — SMB Commercial`, `SMEC — SMB Public Sector` | Excluded by default. Matches report's built-in page filter. Override only when user explicitly requests SMEC inclusion. |
| **Vault Output Path** | `Daily/ACR Portfolio/consumption-hygiene-<YYYY-MM-DD>.md` | See [output-template.md](output-template.md) |

> **⚠️ 1P ACR Only.** This model reports 1P Azure Consumption Revenue. Marketplace Billed Sales (MBS) are NOT included. MBS data lives in the MSA_AzureConsumption_Enterprise_Final model (`d47570f5-ca82-4ae3-a5c8-4e91023eeeda`) via `AdjustmentFlag = "MBS"`, but that model has RLS restrictions on account-level queries.

---

## Flow

> **⚠️ DISPATCH RULE — ALWAYS DELEGATE TO `pbi-analyst`.**
> This skill MUST be executed by the `pbi-analyst` subagent, not `Chief of Staff` or the main agent. If you are not already running inside `pbi-analyst`, immediately call `runSubagent` with `agentName: "pbi-analyst"` and pass the full user request + today's date. Do not attempt to run PBI queries directly from `Chief of Staff` or any other orchestrator agent.

### Step 0 — Scope Resolution (mandatory)

Determine the user's scope before any PBI query. The CAIP model is **seller-scoped via RLS** (unlike the billed pipeline model which requires explicit industry filtering).

**Resolution order:**

1. **User-provided scope** — if the user provides a TPID list, account roster, or segment filter, apply it.
2. **Default: Seller RLS + SMEC exclusion** — RLS scopes to the running user's seller assignment, and SMEC segments (`SMEC — SMB Commercial`, `SMEC — SMB Public Sector`) are **excluded by default**. This matches the report's built-in page filter and shows only managed accounts.
3. **Optional narrowing** — user can add:
   - **TPID list** — narrow to specific accounts
   - **ATU pattern** — filter to specific ATU (e.g., `USA.EC.HLS.*`)
   - **Include SMEC** — explicitly request SMEC inclusion to see the full RLS scope

**Rules:**
- SMEC exclusion is applied by default to all queries via the `<SMEC_EXCLUSION>` filter defined in [schema-mapping.md](schema-mapping.md). Override only when the user explicitly asks to include SMEC/SMB accounts.
- Unlike pipeline hygiene, an explicit industry filter is NOT required — RLS handles scoping.
- Store the resolved scope type for use in all subsequent steps and output metadata.

### Step 1 — Auth & Fiscal Year Resolution

A single query verifies PBI access and resolves the current fiscal year.

1. Call `powerbi-remote:GetReportMetadata` to confirm the semantic model ID matches `f71df8c0-e435-4354-b444-e4014e964b5f`.
2. Execute the auth + FY resolution query from [schema-mapping.md](schema-mapping.md) § Auth Query. If it fails → stop (auth issue).
3. **Skip `GetSemanticModelSchema`** — schema is fully mapped in [schema-mapping.md](schema-mapping.md). Only call if model ID changed or a query fails with an unknown column error.
4. Store the resolved FY label (e.g., `"FY26"`) as `<CURRENT_FY>` for all subsequent queries.

### Step 2 — Seller Scope Confirmation

Query the sellers table to confirm who the model is scoped to:

```dax
EVALUATE '4) Sellers'
```

Show the seller alias, role, and manager in the output header. This confirms RLS is working and identifies the portfolio owner.

### Step 3 — Consumption Snapshot

Execute the main portfolio query from [schema-mapping.md](schema-mapping.md) § Portfolio Query to get ACR by account (Top N). Replace `<CURRENT_FY>` with the resolved fiscal year. Apply any scope filters from Step 0. Use `maxRows: 200`.

Then execute the summary query from [schema-mapping.md](schema-mapping.md) § Summary Query to get total ACR and account count across the portfolio.

### Step 3.5 — Aggregate Exception Counts

Execute two aggregate queries in sequence:

1. **ACR health counts** — the aggregate health count query from [health-rules.md](health-rules.md) § Aggregate Health Counts. Returns counts for MoM declining, YoY declining, high-ACR accounts.
2. **Pipeline risk counts** — the aggregate pipeline risk query from [schema-mapping.md](schema-mapping.md) § Pipeline Risk Aggregate Query. Returns counts for stale opps, past-due milestones, help-needed milestones, milestone-less opps.

**Sanity check:** If `Total Pipeline Opps` exceeds the expected range for the scope, warn about potential scope leakage and suggest TPID narrowing.

**Skip logic:** Use counts to gate Step 4 — skip any detail query whose count is 0.

### Step 4 — Exception Detection (conditional)

Run detail queries per [health-rules.md](health-rules.md), **only for non-zero counts**:

| Query | Exception | Skip when |
|---|---|---|
| 4a | MoM Declining (ACR dropped >5% MoM) | `MoM Declining` = 0 |
| 4b | YoY Declining (YTD ACR dropped vs prior year) | `YoY Declining` = 0 |
| 4c | Concentration Risk (single account >20% of portfolio ACR) | Computed from Step 3 results |
| 4d | Pipeline Coverage Gap (ACR >$500K with no/low pipeline) | `Uncovered` = 0 |
| 4e-i | Stale Opportunities (>60 days in current sales stage) | `Stale >60d` = 0 |
| 4e-ii | Past-Due Milestones (milestones flagged past due) | `Past Due MS` = 0 |
| 4e-iii | Help-Needed Milestones (milestones with unresolved help requests) | `Help Needed` = 0 |
| 4e-iv | Milestone-Less Opportunities (pipeline $ with no milestone attached) | `No Milestones` = 0 |

> **Cross-referencing:** When a flagged opportunity belongs to an account that also appears in a 4a–4d health check, escalate that account's severity by one tier per [health-rules.md](health-rules.md) § Updated Severity Assignment.

### Step 5 — Risk Summary

Synthesize exceptions into severity tiers per [health-rules.md](health-rules.md) § Updated Severity Assignment:

| Tier | Criteria |
|---|---|
| 🔴 **CRITICAL** | ACR >$1M AND MoM declining >10% AND no pipeline coverage |
| 🔴 **CRITICAL** | Single account >30% of portfolio ACR |
| 🔴 **CRITICAL** | ACR declining (4a/4b) AND stale opportunity >90d on same account |
| 🟡 **HIGH** | MoM declining >5% on accounts >$500K |
| 🟡 **HIGH** | Stale opportunity >60d on account with ACR >$1M |
| 🟡 **HIGH** | Past-due milestone on account with ACR >$500K |
| 🟡 **HIGH** | Help-needed milestone (any account) |
| 🟠 **MEDIUM** | Pipeline coverage gap OR YoY declining 5–15% |
| 🟠 **MEDIUM** | Milestone-less opportunity with PipelineACR >$100K |

### Step 6 — Output

Present to the user per [output-template.md](output-template.md): Consumption Snapshot → Exception Summary → Severity-tiered details (4a → 4e-iv) → Recommended Actions → Owner Summary → Portfolio Table.

### Step 7 — Outlook Follow-Up Drafts (user-requested only)

If user requests drafts/emails, create per [draft-patterns.md](draft-patterns.md). Every draft MUST surface its `webLink` in the output table.

### Step 8 — Vault Persistence

**Freedom Level: Low** — Use [output-template.md](output-template.md) exactly.

1. Path: `Daily/ACR Portfolio/consumption-hygiene-<YYYY-MM-DD>.md`.
2. Check existence via `oil:get_note_metadata`. Use `oil:create_note` or `oil:atomic_replace`.
3. Fill every frontmatter field per the template. Include `scope_filter` to record the active scope.
4. Fill body using exact heading names and section order from template.
5. Include draft `webLink` URLs if Step 7 executed.

### Step 9 — Optional: Portfolio Drill-Downs

These drill-downs are available when the user requests additional detail beyond the hygiene report:

| Drill-Down | Trigger | Query Source |
|---|---|---|
| ACR by Strategic Pillar | "with pillar" | [schema-mapping.md](schema-mapping.md) § Pillar Query |
| Monthly ACR Trend | "with trend" | [schema-mapping.md](schema-mapping.md) § Trend Query |
| Pipeline by Commitment Tier | "with pipeline" or single-account review | [schema-mapping.md](schema-mapping.md) § Pipeline Query |
| Opportunity-Level Pipeline | single-account review | [schema-mapping.md](schema-mapping.md) § Opportunity Query |
| Milestone-Level Detail | single-account review (requires TPID) | [schema-mapping.md](schema-mapping.md) § Milestone Query |

Single-account reviews (by TPID) automatically include Pipeline + Opportunity + Milestone drill-downs.

---

## Decision Logic

| Condition | Action |
|---|---|
| Schema column names differ from expected | Call `GetSemanticModelSchema`; adapt DAX |
| Query returns zero results | Check seller scope — model may not include your accounts |
| User provides TPID list | Add TPID filter to all queries from Step 3 onward |
| User requests pillar breakdown | Execute Step 9 (pillar drill-down) |
| User requests trend | Execute Step 9 (trend drill-down) |
| User requests pipeline summary | Execute Step 9 (pipeline drill-down) |
| User requests opportunity detail | Execute Step 9 (opportunity drill-down) |
| User requests milestone detail (requires TPID) | Execute Step 9 (milestone drill-down) |
| Single-account review with TPID | Execute Step 9 (pipeline + opportunity + milestone) automatically |
| User asks to **include** SMB/SMEC | Remove the default `<SMEC_EXCLUSION>` filter from queries |
| User wants only HLS accounts | Filter ATU to `USA.EC.HLS.*` pattern |
| User says "with drafts" | Execute Step 7 — create Outlook follow-up drafts for CRITICAL and HIGH items |

## Output Schema

- `consumption_snapshot`: total ACR, account count, aggregate exception counts
- `exception_summary`: severity-tiered summary (CRITICAL / HIGH / MEDIUM counts with affected accounts)
- `health_details`: per-type detail tables (4a–4d, non-zero only)
- `pipeline_risk_details`: per-type detail tables (4e-i–4e-iv, non-zero only)
- `recommended_actions`: numbered concrete actions
- `owner_summary`: owners ranked by flagged item count, total value, top issue
- `portfolio_table`: ranked account table (TPID, TopParent, ATU, Segment, Vertical, ACR)
- `pillar_breakdown`: ACR by strategic pillar (optional, Step 9)
- `monthly_trend`: ACR by fiscal month (optional, Step 9)
- `pipeline_summary`: pipeline by commitment tier per account (optional, Step 9)
- `opportunity_detail`: opp-level pipeline (optional, Step 9)
- `milestone_detail`: milestone-level detail (optional, Step 9, requires TPID)
- `draft_table`: Outlook draft webLinks (optional, Step 7)
- `vault_path`: path to persisted vault note
- `next_action`: "Consumption hygiene reviewed. Run `powerbi-billed-pipeline-hygiene` for billed pipeline exceptions or `crm-portfolio-review` for CRM-level drill-down."

## Guardrails

- **1P ACR only.** Always include MBS disclaimer in output. Never claim MBS is included.
- **Always execute fresh PBI queries.** Never read vault snapshots as current ACR state.
- **Cap queries at stated row limits** to prevent context overflow.
- **Milestone queries require a TPID.** Never run Step 9 milestone drill-down at portfolio level.
- **Seller RLS is the default scope.** Do not require industry filtering — this model is seller-assigned, not industry-partitioned.
- **Outlook drafts require explicit request.** Only create drafts when the user says "with drafts" or equivalent.
