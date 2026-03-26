---
name: pbi-portfolio-navigator
description: 'Power BI report router: detects which PBI report a user is asking about and routes to the correct pre-configured prompt, or guides discovery when the report is unclear. Matches natural-language phrases (e.g., "CXObserve", "customer incidents", "pipeline excellence", "SE productivity") to existing pbi-*.prompt.md files. Falls back to pbi-prompt-builder when no match exists. Triggers: PBI report, Power BI report, CXObserve, CXP, support experience, customer health, customer incidents, outages, CMI, CritSit, pipeline excellence, uncommitted to committed, close rate, SE productivity, SE performance, seller productivity, HoK activities, milestones engaged, which PBI report, what reports, show me reports, run PBI prompt, open PBI prompt.'
argument-hint: 'Describe what you want to analyze or name the Power BI report'
---

## Purpose

Routes user queries about Power BI reports to the correct pre-configured `pbi-*.prompt.md` file, eliminating the need to remember exact prompt names. When no match is found, presents the catalog and optionally chains to `pbi-prompt-builder` to create a new prompt.

## When to Use

- User mentions a PBI report by name or nickname (e.g., "CXObserve", "pipeline excellence", "SE productivity")
- User asks a data question answerable by a known PBI report
- User asks "what reports do we have?" or "which PBI prompts are available?"
- User wants to run a PBI analysis but isn't sure which report to use

## Report Catalog

> **This is the single source of truth for routing.** When new `pbi-*.prompt.md` files are added to `.github/prompts/`, add a row here.

| ID | Aliases | Prompt File | Semantic Model | Answers |
|----|---------|-------------|----------------|---------|
| `cxobserve` | CXObserve, CXP, support experience, customer health, customer support review, support overview, TPID lookup, account support, customer experience, customer incidents, outages, CMI, CritSit, escalations, incident review, reactive support, AA&MSXI | `pbi-cxobserve-account-review.prompt.md` | AA&MSXI (CMI) | Customer support health, active incidents & escalations, satisfaction trends, reactive support metrics, outage impact (scoped by TPID) |
| `uc2c` | pipeline excellence, uncommitted to committed, close rate, pipeline conversion, pipeline health, M2 pipeline review, pipeline shift out, milestone conversion, pipeline discipline | `pbi-pipeline-excellence-uncommitted-to-commit.prompt.md` | WWBI_FabricMSXIAzureCloseRate_OneAMP | UC→C conversion rates by M1/area/solution play/role, close rate trends, at-risk milestones, shift-out analysis |
| `se` | SE productivity, SE performance, my SE metrics, seller productivity, individual seller review, how am I doing, SE scorecard, HoK activity count, milestones engaged, committed pipe engaged, engagement velocity, customer coverage | `pbi-se-productivity-review.prompt.md` | Azure Individual Seller Productivity FY26 | HoK activities, milestones engaged, committed milestones, customer deal-team coverage, pipeline created, engagement velocity, vault correlation |

## Routing Flow

### Step 1 — Match Intent

Extract the user's intent and compare against the **Aliases** column above. Matching rules:

1. **Exact alias match** → route immediately.
2. **Question-based match** — map the user's data question to the **Answers** column:
   - "Show me incidents for Contoso" → `cxobserve`
   - "What's the support health for this TPID?" → `cxobserve`
   - "What's the UC to committed conversion rate?" → `uc2c`
   - "How am I doing on milestones?" → `se`
   - "How many HoK activities do I have?" → `se`
3. **Ambiguous or partial match** → present the top 1–2 candidates with a one-line description and ask the user to confirm.
4. **No match** → go to Step 2.

### Step 2 — No Match: Present Catalog

If no alias or question matches, present the full catalog:

> I have these pre-configured Power BI reports:
>
> | # | Report | What It Answers |
> |---|--------|-----------------|
> | 1 | **CXObserve Account Review (CMI)** — support health, incidents, escalations, satisfaction trends by TPID | `cxobserve` |
> | 2 | **Pipeline Excellence (UC→C)** — uncommitted-to-committed conversion, close rates, M2 pipeline review | `uc2c` |
> | 3 | **SE Productivity Review** — HoK activities, milestones engaged, customer coverage, engagement velocity | `se` |
> | 4 | **None of these** — help me build a new one |
>
> Which one are you looking for? (pick a number or describe your question)

- If user picks 1–3 → route to the prompt.
- If user picks 4 or describes something not in the catalog → chain to `pbi-prompt-builder` skill.

### Step 3 — Execute the Prompt

Once matched, load and execute the full prompt file:

1. Read the matched `pbi-*.prompt.md` from `.github/prompts/`.
2. Follow the prompt's workflow exactly — it handles auth pre-check, scoping, DAX execution, and output formatting.
3. If the prompt requires account scoping and the user hasn't provided it, ask before proceeding.

## Edge Cases

| Situation | Action |
|---|---|
| User asks about a report not in the catalog | Show catalog, then offer to chain to `pbi-prompt-builder` |
| User asks about multiple reports at once | Route to each sequentially; warn about context window cost for multi-report runs |
| User says "run the PBI prompt" without specifying which | Present the catalog (Step 2) |
| Query could match two reports (e.g., "milestones" → `uc2c` or `se`) | Present both candidates with their key differentiator and ask user to pick |
| User wants to customize an existing prompt | Point them to the Configuration table in the matched prompt file |
| Power BI auth fails during execution | Follow the auth recovery pattern from the prompt file — do not retry silently |

## Chaining

- **Downstream**: Matched prompt file (executes via `@pbi-analyst` subagent for heavy DAX)
- **Fallback**: `pbi-prompt-builder` skill (when no catalog match)
- **Context bridge**: `pbi-context-bridge.instructions.md` (when PBI output feeds CRM/vault/WorkIQ)
