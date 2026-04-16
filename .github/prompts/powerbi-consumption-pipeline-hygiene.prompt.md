---
agent: pbi-analyst
description: "Launches consumption pipeline hygiene review via Power BI. Delegates to the powerbi-consumption-pipeline-hygiene skill."
model: Claude Opus 4.6 (copilot)
---
# Consumption Pipeline Hygiene (Power BI)

Run the `powerbi-consumption-pipeline-hygiene` skill with the configuration below.

> **⚠️ Disambiguation:** This report covers **consumption pipeline** (CAIP ACR & Pipeline). For **billed pipeline** (MSBilledPipelineCurated), use `powerbi-billed-pipeline-hygiene`. If the user asks for "pipeline hygiene" without specifying billed or consumption, **always ask which one they want**.

## Configuration

> **Managers**: Fork this file and update these values for your team scope.

| Setting                      | Value                                    | Notes                                                |
| ---------------------------- | ---------------------------------------- | ---------------------------------------------------- |
| **Report ID**                | `8b16b5da-616c-4452-84ea-2c30e09cc1f8`  | CAIP ACR & Pipeline report                           |
| **Semantic Model ID**        | `f71df8c0-e435-4354-b444-e4014e964b5f`  | CAIP ACR & Pipeline (Business Precision workspace)   |
| **Fiscal Year Filter**       | Current FY (resolve via `1) Calendar`)   | Use `'1) Calendar'[Fiscal Year]` — e.g. `"FY26"`    |
| **ACR Threshold**            | `$100,000`                               | Suppress accounts below this for portfolio-level view|
| **MSX Status Filter**        | Open opportunities only                  | Via seller RLS + SMEC exclusion                      |
| **Account Roster**           | _(optional)_                             | Narrow to specific TPIDs if provided by user         |

## Execution

The full workflow (auth pre-check → fiscal year resolution → seller scope → consumption snapshot → exception detection → risk synthesis → output → optional Outlook drafts → vault persistence) is defined in the `powerbi-consumption-pipeline-hygiene` skill.

Add "with drafts" to also generate Outlook follow-up emails for CRITICAL and HIGH items.
