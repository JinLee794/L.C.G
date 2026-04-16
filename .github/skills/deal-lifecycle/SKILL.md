---
name: deal-lifecycle
description: "Unified MCEM lifecycle skill for general managers: stage spine, diagnostics, commit gates, handoff readiness, loopback rules, pipeline entry, and Stage 5 review in one pass. Consolidates mcem-flow, mcem-diagnostics, mcem-stage-identification, non-linear-progression, commit-gate-enforcement, delivery-accountability-mapping, handoff-readiness-validation, deal-qualification, deal-outcome-scoping, and stage-5-review for portfolio-level governance. Triggers: MCEM overview, deal health, stage review, where are we, portfolio progression, governance overview, manager view, commit gate, commit decision, handoff ready, ready to hand off, loopback, go back a stage, stage 5, adoption health, delivery accountability, who owns execution, exit criteria, stage mismatch. DO NOT USE FOR: net-new inbound signal qualification (use deal-qualification), initial KPI/success-plan workshops (use deal-outcome-scoping), single-deliverable outcome validation (use deal-value-realization)."
argument-hint: 'Provide opportunityId or customer name for scoped review; omit for portfolio-level overview'
---
# MCEM Manager

Unified MCEM lifecycle skill for general managers. Covers stage diagnostics, gate enforcement, handoff readiness, loopback rules, pipeline entry, and Stage 5 review — all in one skill load.Freedom Level

**Medium** — Governance assessment requires judgment; gate checks and RACI mappings are rule-based.

---

## §1 Stage Spine

| Stage               | Objective                                    | Accountable Unit | Typical Roles                 | Exit Evidence (VO)                                                      |
| ------------------- | -------------------------------------------- | ---------------- | ----------------------------- | ----------------------------------------------------------------------- |
| 1 Listen & Consult  | Qualify need, define measurable outcomes     | ATU              | AE, ATS, IA, Specialist, CSAM | Qualified opp +`msp_salesplay` set + outcomes defined                 |
| 2 Inspire & Design  | Shape approach, validate value, position HoK | STU              | Specialist, SE, CSA           | Play confirmed + BVA complete + success plan linked + HoK positioned    |
| 3 Empower & Achieve | Prove, commit, finalize handoff readiness    | STU              | Specialist, SE, CSA, CSAM     | Agreement + committed milestones + dated outcomes + HoK legal confirmed |
| 4 Realize Value     | Execute delivery, protect architecture       | CSU              | CSAM, CSA                     | Milestone delivery + customer health tracking                           |
| 5 Manage & Optimize | Sustain outcomes, route expansion            | CSU              | CSAM, Specialist              | Sustained value + expansion/renewal readiness                           |

### Action Classification

| Action Type                    | Default Lead                                  |
| ------------------------------ | --------------------------------------------- |
| Technical feasibility          | CSA                                           |
| Customer communication         | CSAM                                          |
| Pipeline/opportunity structure | Specialist                                    |
| Proof execution                | SE                                            |
| Delivery coordination          | CSAM (orchestration), Partner/ISD (execution) |
| Expansion evaluation           | Specialist (pipeline), CSAM (timing)          |

### Authority Tie-Break

| Domain                   | Decision Owner                    | Communication Owner                |
| ------------------------ | --------------------------------- | ---------------------------------- |
| Technical feasibility    | CSA                               | CSA informs CSAM                   |
| Architecture constraints | CSA                               | CSA documents, CSAM communicates   |
| Customer expectation     | CSAM                              | CSAM manages timeline/scope        |
| Delivery resourcing      | CSAM (escalation)                 | CSAM owns partner/ISD coordination |
| Timeline adjustment      | CSAM (customer) + CSA (technical) | Joint                              |

Neither claims → flag as `unresolved_authority` requiring explicit assignment.

### Critical CRM Fields

- `msp_milestonestatus = 861980001` → At Risk (NOT Committed)
- `msp_commitmentrecommendation = 861980003` → Committed
- `msp_salesplay` → solution play
- `msp_milestonedate` → milestone target date

---

## §2 Stage Diagnostics

Pinpoints functional MCEM stage from CRM entity state (not labels) and validates exit criteria.

### Modes

| Mode               | Trigger                               | Purpose                        |
| ------------------ | ------------------------------------- | ------------------------------ |
| **Identify** | which stage, stage mismatch, diagnose | Functional vs. declared stage  |
| **Validate** | exit criteria, are we ready, VO audit | Check criteria for progression |

### Flow

1. `msx:crm_get_record` on opportunity → stage, solution play, success plan, `activestageid`.
2. `msx:get_milestones` with `opportunityId` → milestone state.
3. Compare CRM artifacts against exit criteria:

| Transition | Evidence Required                                                                    |
| ---------- | ------------------------------------------------------------------------------------ |
| 1 → 2     | Qualified opportunity + solution play selected                                       |
| 2 → 3     | CSP created + BVA complete + plays confirmed                                         |
| 3 → 4     | Customer agreement +`msp_commitmentrecommendation = 861980003` + resources aligned |
| 4 → 5     | `msp_milestonestatus = 861980003` (delivered) + health metrics agreed              |

**Non-linear rule**: If CRM says Stage 3 but no CSP or BVA → label **Functional Stage 2 (At Risk)**.

### Output

- `current_crm_stage` / `functional_mcem_stage` — flag divergence as highest-priority finding
- `outcome_gaps[]` — missing exit criteria with accountable role
- `overall_readiness`: ready | not_ready | partial
- `recommended_lead` — role for next steps based on functional stage

---

## §3 Loopback Rules

Loopback is iteration, not failure. Preserves long-term execution integrity.

| Gap Class                           | Loop-To      | Recovery Owner  | Re-advance When             |
| ----------------------------------- | ------------ | --------------- | --------------------------- |
| Proof failure / inconclusive        | Stage 2      | SE + Specialist | New proof passes acceptance |
| Architecture infeasible             | Stage 2      | CSA             | Revised design validated    |
| Readiness gap (customer not ready)  | Stage 1 or 2 | Specialist      | Stakeholder re-confirmed    |
| Capacity / resource constraint      | Stage 3      | CSAM            | Delivery resource named     |
| Scope change by customer            | Stage 2      | Specialist + SE | Revised scope approved      |
| Adoption stall reveals design issue | Stage 4      | CSAM + CSA      | Remediation plan active     |
| Customer priority shift             | Stage 1      | Specialist      | Re-qualified                |

**Rules**:

- Stage field updates are Specialist-owned — recommend but redirect execution.
- Milestone commitment changes follow write-gate authority (CSAM/Specialist).
- Document loopback reason in milestone comments before stage change.
- Loopback ≠ loss. Do not recommend closing unless customer has explicitly disengaged.

---

## §4 Commit Gate

Prevents premature milestone commitment. All must PASS before `msp_commitmentrecommendation = 861980003`.

### Checklist

| # | Criterion                                                            | Required |
| - | -------------------------------------------------------------------- | -------- |
| 1 | Delivery path explicitly named (Partner / ISD / Unified / Internal)  | Yes      |
| 2 | Execution owner ≠ CSAM (CSAM = orchestration only)                  | Yes      |
| 3 | `msp_milestonedate` set and realistic (≥14 days, <12 months)      | Yes      |
| 4 | ≥1 active task with owner and due date per milestone                | Yes      |
| 5 | CSU ownership confirmed (CSA preferred if active, CSAM fallback)     | Yes      |
| 6 | HoK legal gate cleared (if HoK engagement present)                   | Yes      |
| 7 | Revenue delta confidence (`msp_monthlyuse` = change, not absolute) | Yes      |
| 8 | CSU handoff discussion confirmed by receiving CSU role               | Yes      |

**Decision**: PASS (all met) → proceed to handoff | FAIL (any missing) → block, list gaps | PARTIAL → list specific gaps with remediation owner.

### CSA Ownership Resolution

1. `msx:manage_deal_team({ action: "list" })` → get deal team.
2. Query `systemusers` for `title` containing "Cloud Solution Architect" or "CSA".
3. CSA found + active on project → recommend as milestone owner.
4. No active CSA → CSAM fallback.
5. Neither on deal team → **commit-gate blocker**.

### Delivery Accountability (RACI)

| Role                | Responsibility                                                      |
| ------------------- | ------------------------------------------------------------------- |
| CSAM                | Outcome orchestration, customer expectations, risk escalation       |
| CSA                 | Technical feasibility, architecture guardrails, execution integrity |
| Partner/ISD/Unified | Day-to-day delivery execution                                       |
| Specialist          | Pipeline integrity (Stages 2-3 only), opportunity field updates     |

**Flag mismatches**: CSAM as milestone owner but Partner executing → reassign. No delivery owner named → execution risk. Delivery owner exists but not executing → escalate.

> **Commitment help contact**: Cory.Kincaid@microsoft.com

---

## §5 Handoff Readiness (STU → CSU)

Quality gate before Specialist disengages.

### Checklist

| # | Item                                                                  | Required |
| - | --------------------------------------------------------------------- | -------- |
| 1 | Business-case summary (why customer bought)                           | Yes      |
| 2 | Measurable outcomes with baselines                                    | Yes      |
| 3 | Scope documented (in-scope + explicitly out-of-scope)                 | Yes      |
| 4 | Proof artifacts and customer agreement evidence findable              | Yes      |
| 5 | HoK artifacts (legal coverage, env access, work log) — if applicable | If HoK   |
| 6 | CSU-aligned owner per committed milestone                             | Yes      |
| 7 | Next 2-3 actions assigned and dated                                   | Yes      |
| 8 | Governance cadence: next meeting, stakeholders, escalation path       | Yes      |

**Decision**: Ready | Not Ready | Owner Mismatch (milestone still STU-owned post-commitment).

---

## §6 Pipeline Entry + Outcome Gate

### Qualification (5 signals)

| Signal                      | Required    | Evidence                                 |
| --------------------------- | ----------- | ---------------------------------------- |
| Customer priority alignment | Yes         | Customer-stated need or business problem |
| Commercial fit              | Yes         | Budget indication or funding path        |
| Solution play match         | Yes         | `msp_salesplay` maps to valid area     |
| No duplicate opportunity    | Yes         | No existing active opp covers same scope |
| Stakeholder access          | Recommended | Named decision maker or champion         |

**Decision**: Qualified → draft opp + milestones | Not Qualified → list gaps | Duplicate → recommend updating existing.

### Outcome Scoping (Stage 1 Exit Prerequisite)

For each of 2-5 business objectives:

| Element                   | Required    | Evidence                                        |
| ------------------------- | ----------- | ----------------------------------------------- |
| Business problem stated   | Yes         | Customer-articulated (not Microsoft projection) |
| Measurable success metric | Yes         | Quantifiable target                             |
| Baseline available        | Recommended | Current state measurement or plan to obtain     |
| Timeline expectation      | Yes         | Customer's expected value realization window    |

- Missing baseline → flag as Stage 2 prerequisite.
- No measurable metric → block progression.

---

## §7 Stage 5 Review

Three modes in one pass (all run by default):

| Mode                | Focus                      | Healthy                                                   | Unhealthy                                |
| ------------------- | -------------------------- | --------------------------------------------------------- | ---------------------------------------- |
| **Adoption**  | Usage telemetry vs targets | Tracking above target, named task owners, recent activity | Flat/declining, no owner, 30+ days stale |
| **Value**     | Outcome completeness       | Metric + baseline + target + owner + active tracking      | Any element missing                      |
| **Expansion** | Growth signals             | Signals captured with evidence, routed to Specialist      | Untracked signals or premature routing   |

### Expansion Signal Types

| Signal                    | Example                       | Route                                       |
| ------------------------- | ----------------------------- | ------------------------------------------- |
| Workload expansion        | New business unit adoption    | Specialist — new Stage 1-2 opp             |
| Usage growth              | Consumption exceeding targets | CSAM documents → Specialist evaluates      |
| Technology uplift         | Architecture modernization    | CSA captures → Specialist creates pipeline |
| Renewal with scope change | New workloads at renewal      | Specialist — linked opportunity            |

**Rules**:

- Route expansion signals only after CSAM timing/prioritization alignment.
- Check `msx:get_my_active_opportunities` for duplicates before creating.
- `msp_monthlyuse` represents estimated change in monthly revenue (delta, not absolute).

---

## Boundaries

- **CRM writes** still require `write-gate` skill (human confirmation before any mutation).
- **Role-specific execution** (SE task hygiene, CSA architecture review) → defer to role skills (`se-execution-check`, `architecture-review`, etc.).
- **HoK deep-dive** → defer to `hok-readiness-check` skill.
- **Morning brief / pipeline hygiene** → separate skills (not MCEM-lifecycle-specific).
- **Risk surfacing** → defer to `risk-surfacing` skill for proactive threat detection.
- **Partner motion** → see `shared-patterns` skill § Partner Motion Adjustments.
