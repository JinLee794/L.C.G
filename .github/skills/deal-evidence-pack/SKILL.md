---
name: deal-evidence-pack
description: 'Customer evidence pack compiler: assembles email threads, calendar excerpts, and chat history into a consolidated briefing document for upcoming reviews. Chains with mcem-stage-identification and milestone-health-review for pre-governance prep. Triggers: compile evidence, compile package, email threads, chat history, briefing document, evidence pack, governance prep, customer communication history, assemble evidence, build briefing bundle. DO NOT USE FOR: general meeting prep briefs (use the meeting-prep workflow), single-opportunity deal reviews (use deal-opportunity-review).'
argument-hint: 'Provide opportunityId, participant names, and date range for artifact compilation'
---

## Purpose

Produces a consolidated executive-ready evidence pack combining CRM execution state with M365 customer communication history for governance, risk updates, or value realization reporting.

## Freedom Level

**Medium** — Evidence assembly requires judgment on relevance; source separation is exact.

## Trigger

- Pre-governance or pre-QBR preparation
- User needs customer-facing evidence for risk or adoption updates
- User asks "prepare evidence pack" or "customer communication history"

## Flow

1. Build scoped request: customer/opportunity, stakeholders, **explicit date range**, M365 source types.
2. Call WorkIQ MCP (`ask_work_iq`) to retrieve Teams/meeting/Outlook/SharePoint evidence.
3. **VAULT-CORRELATE** — cross-reference WorkIQ results with vault notes for the same date window. Surface prior customer communication history, decisions, and action owners. Strict date boundaries.
4. Call `msx-crm:get_milestones` with `opportunityId` for execution state.
5. Call `msx-crm:get_milestone_activities` for relevant milestones (targeted only).
6. Produce consolidated pack separating CRM state from communication evidence.
7. Generate dry-run follow-up actions where gaps exist.

## Evidence Separation Rule

| Source | Provides | Label in output |
|---|---|---|
| CRM (msx-crm) | Opportunity and milestone status, dates, owners, risk state | `crm_execution_state` |
| M365 (WorkIQ) | Meeting notes, email threads, chat decisions | `m365_customer_signals` |
| Vault (OIL) | Prior notes, stakeholder context, historical decisions | `vault_correlation` |

## Decision Logic

- Raise `communication_gap` if CRM risk/status has no recent corroborating customer evidence
- Separate customer-safe bullets from internal action items
- Flag stale evidence (>30 days without corroborating signals)
- Route identified gaps to specific follow-up actions

## Output Schema

- `m365_customer_signals`: M365 evidence summary
- `crm_execution_state`: CRM milestone/task status
- `vault_correlation`: matched vault notes (if vault available)
- `customer_message_bullets`: customer-safe summary points
- `communication_gaps`: areas where evidence is missing
- `dry_run_followups`: task payloads for gap closure
- `next_action`: "Evidence pack assembled. Would you like to run `powerbi-billed-pipeline-hygiene` to review opportunity health based on findings?"
