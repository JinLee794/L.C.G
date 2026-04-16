---
name: powerbi-billed-pipeline-hygiene
description: 'Billed pipeline hygiene skill — queries the MSBilledPipelineCurated Power BI report live for the latest data. Flags stale opportunities, close-date drift, missing fields, risk concentration, and stage inflation across CQ-1/CQ/CQ+1. Produces prioritized exception report with severity tiers and optional Outlook follow-up drafts. Persists results to vault for trend tracking. Triggers: billed pipeline hygiene, billed pipeline health, billed pipeline, check billed pipeline, billed hygiene, billed pipeline exceptions, billed pipeline review, billed pipeline cleanup, billed forecast hygiene, pipeline hygiene billed, stale opportunities, close-date drift, missing fields, stage inflation, billed pipeline coverage. DO NOT USE FOR: consumption pipeline hygiene or ACR review — use powerbi-consumption-pipeline-hygiene. DO NOT USE FOR: milestone-only governance — use deal-milestone-review. IMPORTANT: If the user asks for generic "pipeline hygiene" without specifying billed or consumption, always ask which one they want before proceeding.'
argument-hint: 'Specify industry (e.g. "healthcare", "financial services"). Optionally add TPID list, account roster, or "with drafts" for Outlook follow-up emails.'
---

# Billed Pipeline Hygiene (Power BI)

## Purpose

**Canonical skill for billed pipeline hygiene requests.** Queries the MSBilledPipelineCurated Power BI semantic model live to detect hygiene exceptions across trailing, current, and forward fiscal quarters. Always runs fresh PBI queries — vault snapshot notes are this skill's output for trend tracking and must never be read back as current pipeline state.

> **⚠️ Disambiguation:** This skill covers **billed pipeline** only. For **consumption pipeline** (ACR), use `powerbi-consumption-pipeline-hygiene`. If the user asks for generic "pipeline hygiene" without specifying billed or consumption, **always ask which one they want**.

> **⚠️ Load Order:** Read **SKILL.md first** for the full flow. Sub-files are loaded on-demand:
> - [schema-mapping.md](schema-mapping.md) — table/column mapping, relationship model, DAX filter patterns
> - [exception-rules.md](exception-rules.md) — aggregate + detail exception queries (4a–4e)
> - [draft-patterns.md](draft-patterns.md) — Outlook follow-up email templates
> - [output-template.md](output-template.md) — vault persistence format

## When to Use

- Any pipeline hygiene, health, or cleanup request
- Weekly/bi-weekly pipeline hygiene pass before forecast calls
- Pre-forecast hygiene sweep across CQ-1 / CQ / CQ+1
- Industry-scoped pipeline reviews (e.g., "check Healthcare pipeline hygiene")

## Freedom Level

**Medium** — DAX generation requires adaptive judgment; scope resolution, filter construction, and severity assignment are exact.

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
| `powerbi-remote:GetReportMetadata` | Semantic model ID is hardcoded. Auth is verified by the first `ExecuteQuery` — if it fails, auth is broken. No separate check needed. |
| `powerbi-remote:GetSemanticModelSchema` | Schema is fully mapped in [schema-mapping.md](schema-mapping.md). **Never call this.** If a column error occurs, fail with a message to update schema-mapping.md — do not auto-discover. |

## Configuration

| Setting | Value | Notes |
|---|---|---|
| **Report ID** | `92fc5ec5-c739-4b9b-aad2-e809c9c2f7b8` | Pipeline hygiene report in MSIT Power BI |
| **Semantic Model ID** | `07d916d7-43b6-4d8d-bfa7-5374ffd9c355` | MSBilledPipelineCurated |
| **Fiscal Time Slicer** | `CQ-1, CQ, CQ+1` | Trailing + current + forward quarter |
| **MSX Status Filter** | Open only | Exclude Won, Lost, Abandoned, Disqualified |
| **Vault Output Path** | `Daily/Pipeline Hygiene/pipeline-hygiene-<YYYY-MM-DD>.md` | See [output-template.md](output-template.md) |

---

## Flow

> **⚠️ DISPATCH RULE — ALWAYS DELEGATE TO `pbi-analyst`.**
> This skill MUST be executed by the `pbi-analyst` subagent, not `Chief of Staff` or the main agent. If you are not already running inside `pbi-analyst`, immediately call `runSubagent` with `agentName: "pbi-analyst"` and pass the full user request + today's date. Do not attempt to run PBI queries directly from `Chief of Staff` or any other orchestrator agent.

> **Optimization target: 5–6 tool calls total (no drafts).** This flow consolidates what was previously 13–18+ tool calls into a minimal serial chain. PBI `ExecuteQuery` calls are reduced from 3–8 to exactly 2 by merging auth + snapshot + aggregate counts into one query and all exception details into another.

### Step 0 — Scope Resolution (mandatory)

**Before any PBI query, determine the user's scope.** An industry filter is **always required** — never run an unscoped full-pipeline query.

The Config Gate (Step 0 of all workflows) already reads `_lcg/role.md` and `_lcg/preferences.md`. **Use the scope from the Config Gate output** — do NOT re-read role.md. If the Config Gate resolved an industry or TPID list, use it directly.

Follow the **Account Scope Resolution** protocol defined in the `pbi-analyst` agent to resolve the user's scope (user-provided → Config Gate role.md → prompt). That protocol handles TPID detection, user confirmation, and the PBI access caveat.

Once a scope is resolved, this skill also accepts optional pipeline-specific inputs:
- **Fiscal quarter override** (optional) — default is CQ-1/CQ/CQ+1.
- **Follow-up drafts** (optional) — generate Outlook follow-ups for flagged exceptions.

Do NOT proceed to Step 1 until a scope is resolved.

**Industry-to-filter mapping** (the skill resolves these internally — users only set `industry` in role.md):

| User says / role.md value | Filter column | Filter value |
|---|---|---|
| "healthcare", "HLS", "health" | `'Account'[Industry]` | `"Healthcare"` |
| "financial services", "FSI" | `'Account'[Industry]` | `"Financial Services"` |
| "USA - Healthcare" | `'Account'[Sales Unit]` | `"USA - Healthcare"` |
| TPID list | `'Account'[TPID]` | `{"<tpid1>", "<tpid2>", ...}` |

**Rules:**
- Industry is more precise than Sales Unit for vertical scoping. Prefer Industry when the user names a vertical.
- Healthcare = `"Healthcare"` — NOT `"Health and Life Sciences"`. Empirically verified.
- If uncertain about the exact value, discover with: `EVALUATE DISTINCT('Account'[Industry])`
- Store the resolved scope type and value for use in all subsequent steps.
- A scope filter is **always active** — all downstream queries use CALCULATETABLE/CALCULATE with CROSSFILTER.

See [schema-mapping.md](schema-mapping.md) § Scope Filter Patterns for the mechanics and known values.

### Step 1 — Combined Auth + CQ Labels + Snapshot + Aggregate Counts (1 PBI call)

**This single `ExecuteQuery` call replaces what were previously Steps 1, 3, and 3.5 (3 separate calls).**

Use `powerbi-remote:ExecuteQuery` with the combined query from [schema-mapping.md](schema-mapping.md) § Combined Snapshot Query. This query returns **three result sets** in one call:

1. **CQ label mapping** — resolves `CQ-1`, `CQ`, `CQ+1` to fiscal quarter labels (e.g., `FY26-Q3`). Also serves as auth verification — if this fails, auth is broken.
2. **Pipeline overview** — fiscal quarter × stage breakdown with opp count, pipeline dollars, weighted pipeline.
3. **Aggregate exception counts** — all 5 exception type counts in one ROW, plus total opps and total pipeline.

**If the query fails:** Stop. Do not fall back to `GetReportMetadata` or `GetSemanticModelSchema`. Report the error — it's likely an auth issue or model change. The user or a developer must investigate.

**After this call, extract:**
- CQ labels for display (e.g., `FY26-Q3 (CQ-1), FY26-Q4 (CQ), FY27-Q1 (CQ+1)`)
- Exception counts for skip logic in Step 2
- Total opps for sanity check (if it exceeds expected range for the scope, warn about bridge filter leakage)

**In parallel with this PBI call**, fire `oil:get_note_metadata` for the vault output path (`Daily/Pipeline Hygiene/pipeline-hygiene-<YYYY-MM-DD>.md`). This has no dependency on PBI results and saves one serial round trip.

### Step 2 — Combined Exception Details (1 PBI call, conditional)

**This single `ExecuteQuery` call replaces what were previously Steps 4a–4e (up to 5 separate calls).**

**Skip logic first:** Use the aggregate counts from Step 1 to determine which exceptions have non-zero counts. If ALL counts are zero, skip this step entirely.

Execute the combined detail query from [exception-rules.md](exception-rules.md) § Combined Detail Query. This query:
1. Pulls the scoped base table **once** via `CALCULATETABLE` + `CROSSFILTER`
2. Tags each row with its exception type(s) using conditional columns
3. Returns up to 50 rows sorted by severity priority (CRITICAL → HIGH → MEDIUM)

**Only include exception types with non-zero counts.** The query template in exception-rules.md shows how to conditionally include/exclude exception filters based on Step 1 counts.

**Row limit:** 50 total across all exception types. This prevents context overflow while capturing the most severe items.

### Step 3 — Risk Synthesis (no tool call)

Synthesize exception detail rows into severity tiers. This is pure in-context logic — no tool calls needed.

| Tier | Criteria |
|---|---|
| 🔴 **CRITICAL** | Past-due close + Stage 3+ + value ≥ $500K (cross-reference rows tagged with multiple exception types) |
| 🟡 **HIGH** | Past-due close OR stale >60d OR concentration >30% OR close ≤14d with at-risk forecast |
| 🟠 **MEDIUM** | Missing required fields OR stage inflation |

Because the combined query tags each row with all applicable exception types, CRITICAL detection is straightforward — look for rows where `[Is Close Drift]` AND `[Is Stage Inflation]` AND `[Revenue] >= 500000` are all true.

### Step 4 — Output

Present to the user per [output-template.md](output-template.md): Pipeline Snapshot → Exception Summary → Severity-tiered details → Recommended Actions → Owner Summary.

### Step 5 — Outlook Follow-Up Drafts (user-requested only)

If user requests drafts/emails:

1. **Batch owner resolution:** Collect all unique owner aliases from exception results. Do a single vault `People/` search for all aliases, then a single `mail:SearchMessages` batch for any misses. Cache all resolved names.
2. **Delegate to `@m365-actions`:** Hand off the pre-rendered draft payloads (subject, to, HTML body with CRM links) to the M365 subagent. The parent has already composed the full HTML content — the subagent just creates the drafts.
3. Every draft MUST surface its `webLink` in the output table per [draft-patterns.md](draft-patterns.md).

### Step 6 — Vault Persistence (parallel with Step 5 if drafts requested)

**Freedom Level: Low** — Use [output-template.md](output-template.md) exactly.

1. Load [output-template.md](output-template.md) for vault path, frontmatter schema, body structure.
2. Path: `Daily/Pipeline Hygiene/pipeline-hygiene-<YYYY-MM-DD>.md`.
3. Use the vault metadata from the parallel check in Step 1. Call `oil:create_note` or `oil:atomic_replace`.
4. Fill every frontmatter field per the template. Include `scope_filter` to record the active scope.
5. Fill body using exact heading names and section order from template.
6. Include draft `webLink` URLs if Step 5 executed.

---

## Decision Logic

| Condition | Action |
|---|---|
| User names a vertical (Healthcare, FSI, etc.) | Resolve to Industry filter in Step 0; apply to all queries |
| User provides TPID list | Add TPID `TREATAS` filter to all queries |
| **No explicit scope AND role.md has TPIDs** | **Ask user: scope to TPID list or full industry?** |
| **No explicit scope AND role.md has industry (no TPIDs)** | **Auto-resolve from Config Gate role.md output** |
| **No explicit scope AND role.md has no industry or TPIDs** | **Prompt user for industry and optional filters before proceeding** |
| Aggregate `Total Opps` exceeds expected range | Warn about bridge leakage; suggest TPID narrowing |
| All exception counts are zero | Skip Step 2 entirely; report clean pipeline |
| PBI `ExecuteQuery` fails | Stop. Report error. Do not fall back to `GetReportMetadata` or `GetSemanticModelSchema`. |
| User says "with drafts" | Execute Step 5 (delegate to `@m365-actions` with pre-rendered payloads) |

## Call Budget

| Scenario | PBI Calls | OIL Calls | Mail Calls | Total |
|---|---|---|---|---|
| **Standard run (no drafts)** | 2 | 3 (2 config + 1 persist) | 0 | **5–6** |
| **Clean pipeline (all counts zero)** | 1 | 3 | 0 | **4** |
| **With drafts (N owners)** | 2 | 3 | N (via @m365-actions) | **5 + N** |

## Output Schema

- `pipeline_snapshot`: summary table by quarter × stage
- `exception_counts`: aggregate counts per exception type
- `risk_summary`: prioritized exception list (CRITICAL / HIGH / MEDIUM)
- `exception_details`: per-type tables (4a–4e)
- `recommended_actions`: concrete next steps per owner
- `drafts_created`: table with subject, recipient, webLink (if Step 5)
- `vault_path`: path to persisted vault note
- `next_action`: "Pipeline hygiene reviewed. Run `deal-portfolio-review` or `deal-milestone-review` for CRM-level drill-down."

## Guardrails

- **Never run unscoped.** An industry filter (or TPID list) is always required. If the user omits scope, prompt for it — do not default to full pipeline.
- **Always execute fresh PBI queries.** Never read vault snapshots as current pipeline state.
- **Never call `GetReportMetadata` or `GetSemanticModelSchema`.** The semantic model ID and schema are hardcoded. If a query fails, report the error — do not auto-discover.
- **Maximum 2 `ExecuteQuery` calls per run.** If you're making more, you're not using the combined queries.
- Read-only pipeline analysis. No CRM writes, no Teams posts.
- Email drafts only when explicitly requested. Delegate to `@m365-actions` — never create drafts in the parent agent.
- Always apply fiscal quarter slicer AND open-status filter. Never run unfiltered.
- Cap queries at stated row limits to prevent context overflow.
- `contentType` for email drafts: always `"HTML"`. Never use XML/CDATA wrappers.
