---
name: powerbi-navigator
description: 'Power BI report router: detects which PBI report a user is asking about and routes to the correct pre-configured prompt, or guides discovery when the report is unclear. Matches natural-language phrases (e.g., "azure all in one", "customer incidents", "GHCP new logo", "service deep dive") to existing powerbi-*.prompt.md files. Falls back to dev-powerbi-prompt-builder when no match exists. Triggers: PBI report, Power BI report, azure all in one, all-in-one, AIO, customer incidents, outages, CMI, GHCP, new logo incentive, service deep dive, SL5, ACR by service, which PBI report, what reports, show me reports, consumption report, portfolio report, run PBI prompt, open PBI prompt. DO NOT USE FOR: pipeline hygiene analysis or exception detection (use powerbi-billed-pipeline-hygiene or powerbi-consumption-pipeline-hygiene directly), building new PBI prompts from scratch (use dev-powerbi-prompt-builder).'
argument-hint: 'Describe what you want to analyze or name the Power BI report'
---

## Purpose

Routes user queries about Power BI reports to the correct pre-configured Power BI skill or prompt, eliminating the need to remember exact names. Supports both multi-file skill folders (`.github/skills/powerbi-*/`) and legacy single-file prompts (`.github/prompts/powerbi-*.prompt.md`). When no match is found, presents the catalog and optionally chains to `dev-powerbi-prompt-builder` to create a new skill.

## When to Use

- User mentions a PBI report by name or nickname (e.g., "azure all in one", "CMI", "GHCP")
- User asks a data question answerable by a known PBI report
- User asks "what reports do we have?" or "which PBI prompts are available?"
- User wants to run a PBI analysis but isn't sure which report to use

## Report Catalog

> **This is the single source of truth for routing.** When new `powerbi-*.prompt.md` files are added to `.github/prompts/`, add a row here.

| ID | Aliases | Prompt File | Semantic Model | Answers |
|----|---------|-------------|----------------|---------|
| `aio` | azure all in one, all-in-one, AIO, portfolio review, gap to target, azure consumption, enterprise consumption | `pbi-azure-all-in-one-review.prompt.md` | MSA_AzureConsumption_Enterprise | Gap to target, pipeline conversion ranking, recommended actions |
| `subacr` | subscription details, subscription analysis, acr by subscription, subscription guid acr, subscription name acr, customer subscription acr, subscription consumption | `pbi-azure-subscription-acr-consumption.prompt.md` | MSA_Azure_SubscriptionDetails_Enterprise | Subscription-level ACR lookup by GUID/name/customer with month trend and service drivers |
| `sl5` | service deep dive, SL5, ACR by service, service-level, consumption by service, which services growing | `pbi-azure-service-deep-dive-sl5-aio.prompt.md` | MSA_AzureConsumption_Enterprise + WWBI_ACRSL5 | Service growth/decline trends, attainment by pillar, service-level gap actions |
| `cmi` | customer incidents, outages, CMI, CritSit, escalations, incident review, reactive support, AA&MSXI | `pbi-customer-incident-review.prompt.md` | AA&MSXI (CMI) | Active incidents, escalations, outage trends, reactive support health |
| `ghcp` | GHCP, new logo, new logo incentive, growth incentive, GHCP new logo | `pbi-ghcp-new-logo-incentive.prompt.md` | MSXI (DIM_GHCP_Initiative) | Account eligibility, qualifying status, realized ACR against thresholds |
| `hygiene` | pipeline hygiene, pipeline health, stale opportunities, close-date drift, missing fields, pipeline risks, pipeline exceptions, pipeline cleanup, forecast hygiene, billed pipeline, billed hygiene | `powerbi-billed-pipeline-hygiene.prompt.md` + `powerbi-billed-pipeline-hygiene` skill | MSBilledPipelineCurated (07d916d7) | Stage staleness, close-date drift, missing fields, concentration risk, stage inflation, Outlook follow-up drafts |
| `consumption` | consumption pipeline hygiene, consumption pipeline, consumption hygiene, ACR hygiene, ACR pipeline, azure consumption hygiene, consumption health, consumption review | `powerbi-consumption-pipeline-hygiene.prompt.md` + `powerbi-consumption-pipeline-hygiene` skill | CAIP ACR & Pipeline (f71df8c0) | ACR decline, stale consumption opps, past-due milestones, concentration risk, pipeline coverage gaps, Outlook follow-up drafts |
| `sql600` | SQL600, SQL 600, SQL600 HLS, HLS SQL600, HLS performance, SQL600 readout, SQL600 executive readout, HLS executive readout, SQL600 accounts, HLS accounts, SQL600 pipeline, HLS pipeline, SQL600 ACR, HLS ACR, database compete, DBC HLS, SQL modernization HLS | `powerbi-sql600-hls` skill | SQL 600 Performance Tracking (c848b220) | HLS SQL600 ACR, pipeline, industry ranking, MoM trends, WoW movement, renewal exposure, modernization coverage, GCP leakage risk, executive readout |

## Routing Flow

### Step 0 — Direct Trigger Bypass

Before running the full matching flow, check if the user's request **exactly matches** a known skill trigger phrase. If so, skip the navigator entirely and load the skill directly. This eliminates 2–3 tool calls of routing overhead for unambiguous requests.

**Direct-match phrases (bypass navigator):**

| Phrase Pattern | Route Directly To |
|---|---|
| `billed pipeline hygiene`, `billed pipeline health`, `billed hygiene`, `check billed pipeline`, `billed pipeline exceptions` | `powerbi-billed-pipeline-hygiene` skill |
| `consumption pipeline hygiene`, `consumption hygiene`, `ACR hygiene`, `consumption pipeline health` | `powerbi-consumption-pipeline-hygiene` skill |
| `SQL600`, `SQL 600`, `SQL600 HLS`, `HLS SQL600`, `SQL600 readout`, `HLS executive readout`, `database compete HLS`, `DBC HLS` | `powerbi-sql600-hls` skill |

If the request contains any of these exact phrases (case-insensitive), **do not read this navigator skill at all** — go directly to the matched skill's SKILL.md.

> **When to use the navigator:** Ambiguous requests ("run the PBI prompt"), discovery requests ("what reports do we have?"), or question-based requests that could match multiple reports.

### Step 1 — Match Intent

Extract the user's intent and compare against the **Aliases** column above. Matching rules:

1. **Exact alias match** → route immediately.
2. **Question-based match** — map the user's data question to the **Answers** column:
   - "What is my gap?" → `aio`
   - "Get ACR for this subscription/customer/GUID" → `subacr`
   - "Show me incidents for Contoso" → `cmi`
   - "Which services are growing?" → `sl5`
   - "Am I qualifying for the growth incentive?" → `ghcp`
   - "What's stale in my pipeline?" → `hygiene`
   - "Flag pipeline risks" → `hygiene`
   - "SQL600 HLS performance" → `sql600`
   - "How is healthcare doing in SQL600?" → `sql600`
   - "DBC readout" → `sql600`
3. **Ambiguous or partial match** → present the top 1–2 candidates with a one-line description and ask the user to confirm.
4. **No match** → go to Step 2.

### Step 2 — No Match: Present Catalog

If no alias or question matches, present the full catalog:

> I have these pre-configured Power BI reports:
>
> | # | Report | What It Answers |
> |---|--------|-----------------|
> | 1 | **Azure All-in-One** — portfolio gap, pipeline ranking, actions | `aio` |
> | 2 | **Subscription ACR Lookup** — subscription/customer/GUID consumption detail | `subacr` |
> | 3 | **Service Deep Dive (SL5)** — service-level consumption trends | `sl5` |
> | 4 | **Customer Incidents (CMI)** — outages, CritSits, reactive support | `cmi` |
> | 5 | **GHCP New Logo Incentive** — account eligibility & qualifying status | `ghcp` |
> | 6 | **Pipeline Hygiene** — stale opps, close-date drift, missing fields, risk flags | `hygiene` |
> | 7 | **SQL600 HLS Executive Readout** — ACR, pipeline, trends, renewals, modernization, DBC | `sql600` |
> | 8 | **None of these** — help me build a new one |
>
> Which one are you looking for? (pick a number or describe your question)

- If user picks 1–7 → route to the prompt.
- If user picks 8 or describes something not in the catalog → chain to `dev-powerbi-prompt-builder` skill.

### Step 3 — Execute the Matched Skill or Prompt

> **⚠️ DISPATCH RULE — ALWAYS DELEGATE TO `pbi-analyst`.**
> All Power BI execution (DAX queries, schema discovery, report rendering) MUST be delegated to the `pbi-analyst` subagent via `runSubagent`. Pass the matched skill/prompt name and full user request. Do NOT execute PBI queries directly from `Chief of Staff` or the main agent.

Once matched, load and execute:

1. **Skill folder** (`.github/skills/powerbi-*/SKILL.md`) — Dispatch to `pbi-analyst` with the skill name and user request. The subagent reads SKILL.md and sub-files on-demand.
2. **Legacy prompt file** (`.github/prompts/powerbi-*.prompt.md`) — Dispatch to `pbi-analyst` with the prompt path and user request.
3. If the workflow requires account scoping and the user hasn't provided it, ask **before** dispatching to `pbi-analyst`.

## Edge Cases

| Situation | Action |
|---|---|
| User asks about a report not in the catalog | Show catalog, then offer to chain to `dev-powerbi-prompt-builder` |
| User asks about multiple reports at once | Route to each sequentially; warn about context window cost for multi-report runs |
| User says "run the PBI prompt" without specifying which | Present the catalog (Step 2) |
| Query could match two reports (e.g., "Azure consumption" → `aio` or `sl5`) | Present both candidates with their key differentiator and ask user to pick |
| User wants to customize an existing prompt | Point them to the Configuration table in the matched prompt file |
| Power BI auth fails during execution | Follow the auth recovery pattern from the prompt file — do not retry silently |

## Chaining

- **Downstream**: Matched prompt file (executes via `@pbi-analyst` subagent for heavy DAX)
- **Fallback**: `dev-powerbi-prompt-builder` skill (when no catalog match)
- **Context bridge**: `pbi-context-bridge.instructions.md` (when PBI output feeds CRM/vault/WorkIQ)
