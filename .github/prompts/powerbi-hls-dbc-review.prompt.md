---
description: "HLS Database Catalyst (DBC) review using MSA_AzureConsumption_Enterprise. Always scoped to SalesProgram[ProgramName]='HLS Database Catalyst'. Returns gap-to-target, pipeline coverage, top opportunities by conversion likelihood, account ranking, strategic-pillar / solution-play breakdown, gap accounts, and WoW movement. Optional Outlook follow-up drafts."
argument-hint: '[mode] [with drafts] — mode: full | gap | opps | pillars | gap-accts | wow (default: full)'
---

# HLS Database Catalyst Review

Run the **`powerbi-hls-dbc-review`** skill for the HLS Database Catalyst program.

## Scope (always active)

- `'SalesProgram'[ProgramName] = "HLS Database Catalyst"` (hardcoded — exact)
- `'DimDate'[IsAzureClosedAndCurrentOpen] = "Y"`
- `'DimViewType'[ViewType] = "Curated"`

## Mode

Default: **Full readout** (all seven questions). Override via argument:

| Argument | Mode |
|---|---|
| `gap` / `gap to target` | Gap-to-target only |
| `opps` / `top opportunities` | Top opps by conversion likelihood only |
| `pillars` / `solution play` | Strategic pillar × solution play breakdown only |
| `gap-accts` / `no pipeline` | Accounts with zero committed pipe only |
| `wow` / `movement` | WoW movement detail only |
| `with drafts` | Append: also draft Outlook follow-ups for HIGH/CRITICAL items |

## Execution

1. **Dispatch to `pbi-analyst` subagent** — required by the skill.
2. Skill runs Step 1 (1 ExecuteQuery: snapshot batch) and Step 2 (1 ExecuteQuery: detail batch, mode-gated).
3. Skill synthesizes risk tiers, presents the readout per `output-template.md`, and persists to `Daily/HLS-DBC/hls-dbc-review-<YYYY-MM-DD>.md` via OIL.
4. If `with drafts` requested, delegate `mail:CreateDraftMessage` calls to `@m365-actions`.

## Reference

- Skill: [.github/skills/powerbi-hls-dbc-review/SKILL.md](../skills/powerbi-hls-dbc-review/SKILL.md)
- Source report: [MSA_AzureConsumption_Enterprise](https://msit.powerbi.com/groups/me/reports/d07c4e15-95f9-42f6-8411-59293f6895a1/ReportSection48c9715c72acdffebcd1)
