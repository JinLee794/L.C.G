---
agent: pbi-analyst
description: "Launches billed pipeline hygiene review via Power BI. Delegates to the powerbi-billed-pipeline-hygiene skill."
model: Claude Opus 4.6 (copilot)
---
# Billed Pipeline Hygiene (Power BI)

Run the `powerbi-billed-pipeline-hygiene` skill with the configuration below.

> **⚠️ Disambiguation:** This report covers **billed pipeline** (MSBilledPipelineCurated). For **consumption pipeline** (ACR), use `powerbi-consumption-pipeline-hygiene`. If the user asks for "pipeline hygiene" without specifying billed or consumption, **always ask which one they want**.

## Configuration

> **Managers**: Fork this file and update these values for your team scope.

| Setting                      | Value                                    | Notes                                                |
| ---------------------------- | ---------------------------------------- | ---------------------------------------------------- |
| **Report ID**          | `92fc5ec5-c739-4b9b-aad2-e809c9c2f7b8` | Pipeline hygiene report in MSIT Power BI             |
| **Semantic Model ID**  | `07d916d7-43b6-4d8d-bfa7-5374ffd9c355` | MSBilledPipelineCurated                              |
| **Fiscal Time Slicer** | `CQ-1, CQ, CQ+1`                       | Always apply — trailing + current + forward quarter |
| **MSX Status Filter**  | Open opportunities only                  | Exclude Won, Lost, Abandoned, Disqualified           |
| **Account Roster**     | _(optional)_                           | Narrow to specific TPIDs if provided by user         |

## Execution

The full workflow (auth pre-check → schema discovery → pipeline overview → exception detection → risk synthesis → output → optional Outlook drafts → vault persistence) is defined in the `powerbi-billed-pipeline-hygiene` skill.

Add "with drafts" to also generate Outlook follow-up emails for CRITICAL and HIGH items.
