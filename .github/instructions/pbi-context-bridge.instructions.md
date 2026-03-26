---
description: "PBI context bridge: subagent delegation, DAX pre-aggregation, and session file persistence for Power BI → downstream (CRM, WorkIQ, vault) multi-medium workflows. Prevents context window exhaustion when PBI prompts chain into agentic operations. Load when PBI prompt output feeds CRM correlation, WorkIQ scoping, risk surfacing, or any downstream skill."
---

# PBI Context Bridge

## Problem

Power BI prompts pull 5–10 DAX query results that accumulate 15,000–40,000+ tokens of raw tabular data in context. When users then ask for CRM correlation, WorkIQ check, or skill-based analysis, the context window is already saturated — leaving no room for downstream tool calls and reasoning.

## Strategy: Subagent Isolation + DAX Pre-Aggregation

Two complementary levers — reduce data at the source (DAX), and isolate retrieval in a separate context (subagent). No lossy post-hoc compression.

```
Approach A: Subagent Delegation (preferred for medium/heavy prompts)
  ├─ Subagent executes all DAX queries + analysis in isolated context
  ├─ Returns the FINAL REPORT (tables, rankings, recommendations)
  ├─ Parent agent receives only the rendered output
  └─ Parent uses report to scope CRM/WorkIQ/vault follow-ups

Approach B: Inline with DAX Pre-Aggregation (light prompts only)
  ├─ DAX queries use TOPN, SUMMARIZECOLUMNS, server-side counts
  ├─ Agent analyzes in current context
  └─ Persist final report to .copilot/sessions/pbi/ for downstream re-read
```

## DAX-Side Pre-Aggregation

Push analysis logic into DAX to reduce returned rows before they enter context. This is lossless — computes at the source rather than discarding data after retrieval.

- **Aggregate in DAX**: Use `SUMMARIZECOLUMNS` for server-side counts/groups instead of pulling all rows and counting in-context.
- **Use TOPN aggressively**: Portfolio summary: `TOPN(50)`. Opportunity detail: `TOPN(30)`. Service detail: `TOPN(20)` by absolute MoM change.
- **Merge related queries**: If two queries share the same dimension grain, combine into one `SUMMARIZECOLUMNS`.

## Session File Persistence

After the PBI prompt completes its analysis and renders the final report, persist the report to the workspace so downstream operations can re-read it without re-executing PBI queries:

```
.copilot/sessions/pbi/<prompt-name>-<date>.md
```

Example: `.copilot/sessions/pbi/azure-portfolio-review-2026-03-12.md`

This is the **full rendered report** — not a compressed digest. Downstream skills re-read the file to extract TPIDs, gap signals, opportunity rankings, and recommended actions.

### Re-read Pattern

Downstream skills consume the persisted report: read report → extract at-risk TPIDs from Gap Analysis → scope CRM queries (`get_milestones` with `customerKeyword`, `statusFilter: 'active'`) → scope WorkIQ from recommended actions → merge findings → produce unified report.

### Subagent Delegation

For medium and heavy PBI prompts, delegate retrieval + analysis to an isolated subagent. The subagent runs the full prompt workflow in its own context window, and the parent receives only the final report.

Use `@pbi-analyst` as the default delegate for these workflows.

### When to Use Subagent

| Prompt Complexity | DAX Queries | Strategy |
|---|---|---|
| Light (1–3 queries, single model) | GHCP incentive | Inline — no subagent needed |
| Medium (4–6 queries, single model) | All-in-one review | Subagent if downstream CRM/WorkIQ ops are planned |
| Heavy (6+ queries, multi-model) | SL5 deep dive | **Always subagent** — raw data would consume 40K+ tokens |

### Subagent Prompt Template

When delegating, instruct the subagent:

> Delegate to `@pbi-analyst` and execute the PBI workflow from [prompt name]. Run all DAX queries against model [ID] with scope filters: [filters]. Complete the full analysis. Return the FINAL REPORT with all tables, rankings, and recommendations rendered — not raw DAX results.

### Vault Context Injection (Account-Scoped Runs)

When the parent agent (@mcaps) has vault context for scoped accounts (from a prompt's vault-prefetch step), include it in the delegation prompt as a structured section:

```
## Vault Context

The following reporting overrides were extracted from the Obsidian vault. Apply them during analysis and report generation:

### [Account Name]
- [Override 1: e.g., "Org migration: slug-A → slug-B. Do not flag seat decline on slug-A as churn."]
- [Override 2: e.g., "CRM ACR shows $X but actual billed ACR is $Y — known variance."]
```

The subagent applies these overrides during its analysis steps and includes a "Vault Context Applied" section in the final report. The parent agent does NOT need to re-apply overrides after receiving the report — they are baked in.

If no vault context exists for the scoped accounts, omit this section from the delegation prompt.

## Prompt Template Convention

PBI prompts that support downstream correlation should include:

1. **Downstream hooks** — after the report, list what follow-up operations the report enables:

   ```
   ### Downstream Operations (Optional)
   With the report persisted, you can now:
   - "Cross-check at-risk accounts in CRM" → reads report, runs get_milestones for flagged TPIDs
   - "Check WorkIQ for stalled accounts" → reads report, scopes WorkIQ to flagged accounts
   - "Run pipeline hygiene triage" → report provides the prioritized account list
   ```

2. **Subagent hint** — for heavy prompts, note when delegation is recommended:

   ```
   > **Context note**: This prompt runs 8+ DAX queries across 2 models.
   > If you plan downstream CRM/WorkIQ correlation, run this prompt as a
   > subagent first, then use the persisted report for downstream operations.
   ```
