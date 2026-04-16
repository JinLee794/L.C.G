---
name: deal-unified-check
description: 'Unified constraint check: detects work items needing Unified dispatch that lack eligibility proof, accreditation, or catalog alignment. Purely about Unified program logistics, not general feasibility. Chains with task-hygiene-flow and execution-monitoring for SE morning prep. Triggers: Unified Support, dispatch readiness, accreditation gap, eligibility proof, Unified catalog, Unified blocker, Unified constraints.'
argument-hint: 'Provide opportunityId with Unified Support dispatch dependencies'
---

## Purpose

Prevents Unified constraints from surfacing after commitment by detecting Unified-dependent milestones that lack eligibility, accreditation, or dispatch readiness evidence.

## Freedom Level

**Medium** — Constraint detection is rule-based; customer impact assessment requires judgment.

## Trigger

- Unified-dependent milestones are near-term or newly committed
- User asks "are there Unified blockers?" or "dispatch readiness check"
- Pre-commitment readiness validation for Unified-path milestones

## Flow

1. Call `msx-crm:get_milestones` with `opportunityId`, `keyword: 'unified'`, and `includeTasks: true` — isolate Unified-dependent milestones with inline task evidence.
2. Call `msx-crm:crm_query` for eligibility, accreditation, and dispatch readiness indicators on those milestones.
3. Classify constraint severity (see below).
5. Generate dry-run corrections:
   - `msx-crm:create_task` for escalation or readiness tasks
   - `msx-crm:update_milestone` for risk/status updates

## Constraint Classification

| Constraint | Severity | Action |
|---|---|---|
| No eligibility evidence | High | Block commitment; create eligibility verification task |
| Accreditation gap | High | Escalate to delivery org |
| Dispatch not confirmed | Medium | Create dispatch readiness task with timeline |
| Customer timeline depends on Unified, no contingency | Critical | Flag as `schedule_impact_high`; require contingency plan |
| Unified dependency exists with full readiness | Low | Document for tracking, no action needed |

## Role Lens (applied via role cards)

- **Technical owner focus**: Technical feasibility constraints, architecture prerequisites, environment readiness
- **Delivery owner focus**: Customer expectation management, timeline impact communication, exception escalation
- **GM focus**: Schedule impact on opportunity close date, executive communication, pipeline risk

## Output Schema

- `unified_dependency_report`: milestones with Unified path and readiness state
- `constraint_warnings`: gaps classified by severity
- `timeline_impact`: estimated schedule effect per constraint
- `dry_run_actions`: escalation/readiness task payloads
- `next_action`: "Unified constraints assessed. Would you like to run `commit-gate-enforcement` to validate full commitment readiness?"
