# Output Template — HLS DBC Review

> Vault path: `Daily/HLS-DBC/hls-dbc-review-<YYYY-MM-DD>.md`
> Persistence rule: Standard read-before-write pattern (`oil:get_note_metadata` → `oil:atomic_replace` if exists, else `oil:create_note`).

## Frontmatter

```yaml
---
type: pbi-readout
program: HLS Database Catalyst
program_filter: 'SalesProgram[ProgramName] = "HLS Database Catalyst"'
report: MSA_AzureConsumption_Enterprise
report_id: d07c4e15-95f9-42f6-8411-59293f6895a1
semantic_model_id: 726c8fed-367a-4249-b685-e4e22ca82b3d
generated: <YYYY-MM-DD HH:MM Local>
mode: <Full | Gap | Opps | Pillars | GapAccts | WoW>
account_count: <N>
opp_count: <N>
milestone_count: <N>
acr_ytd: <usd>
acr_lcm: <usd>
acr_target_ytd: <usd>
acr_attain_ytd_pct: <pct>
pipe_all: <usd>
pipe_committed: <usd>
pipe_qualified: <usd>
pipe_wow_change: <usd>
committed_nnr_coverage_pct: <pct>
qualified_nnr_coverage_pct: <pct>
critical_count: <N>
high_count: <N>
medium_count: <N>
drafts_created: <N>
tags: [pbi, hls-dbc, hls, database-catalyst, program-review]
---
```

## Body

### Headline

`# HLS Database Catalyst Review — <YYYY-MM-DD>`

One-line scorecard:

> **{ACR YTD} of {Target YTD} ({Attain%}) · NNR {NetNewRequired} · Pipe {PipeAll} (Committed {PipeCommitted}) · WoW {±change} · {AccountCount} accounts · {OppCount} opps · {MilestonesBlockedOrAtRisk} flagged**

If `PipeCommitted = 0` → prepend `🔴 NO COMMITTED COVERAGE — `
If `PipeWoWChange < -100000` → prepend `⚠️ PIPELINE DECLINED WoW — `

### Disclosure

> *ACR figures show full Azure consumption for the {AccountCount} accounts with at least one HLS DBC-tagged opportunity, not opp-restricted spend. Pipeline figures are HLS DBC-scoped.*

---

### 1. Program Snapshot

Use a 2-column key/value table for the KPI row from Q1.

| Metric | Value |
|---|---|
| Accounts in scope | {AccountCount} |
| Opportunities | {OppCount} |
| Milestones | {MilestoneCount} |
| ACR YTD | {ACR_YTD} |
| ACR Target YTD | {ACR_Target_YTD} |
| ACR Attain YTD | {ACR_Attain_YTD} |
| ACR LCM | {ACR_LCM} |
| Net New Required | {ACR_NetNewRequired} |
| Pipeline (All) | {PipeAll} |
| Committed Pipeline | {PipeCommitted} |
| Qualified Pipeline | {PipeQualified} |
| Pipeline WoW | {PipeWoWChange} |
| Committed NNR Coverage | {CommittedNNRCoverage} |
| Qualified NNR Coverage | {QualifiedNNRCoverage} |
| At-Risk Pipe | {AtRiskPipe} |
| Blocked Pipe | {BlockedPipe} |
| Milestones Blocked / At Risk | {MilestonesBlockedOrAtRisk} |

### 2. Stage Breakdown (from Q2)

| Sales Stage | Opps | Milestones | Pipe (All) | Pipe (Committed) |
|---|---|---|---|---|

### 3. Strategic Pillar × Solution Play (from Q7) — *Full / Pillars only*

| Strategic Pillar | Solution Play | Opps | Milestones | Pipe (All) | Pipe (Committed) |
|---|---|---|---|---|---|

### 4. Top Accounts (from Q5) — *Full / Gap only*

| Account | ACR LCM | ACR YTD | Attain YTD | YoY YTD Δ | Pipe (All) | Pipe (Committed) | Opps |
|---|---|---|---|---|---|---|---|

### 5. Top Opportunities by Conversion Likelihood (from Q6) — *Full / Opps only*

For each row, render:

`- [<checkbox>] **<OpportunityName>** · 👤 **<OpptyOwnerAlias>** · Stage: **<SalesStageName>** · Pipe: **<PipeACR>** (Committed: **<PipeCommittedACR>**) · 📅 EstClose: **<MilestoneCompletionDateEstimated>**`

Sub-bullets per row:
- `· {StrategicPillar} / {SolutionPlay}`
- `· DaysInStage: {DaysInSalesStage}` — if > 60: prepend `⚠️ stale —`
- `· WoW: stage {SalesStageCW1_Movement} · commitment {CommitmentChangeCW1} · date {DateChange_CW1}` — only if any non-blank
- `[CRM Link](<CRMLink>)`

Checkbox selection:
- `[f]` if CRITICAL tier
- `[!]` if HIGH tier
- `[*]` if MEDIUM tier
- `[ ]` otherwise

### 6. Gap Accounts — Zero Committed Pipeline (from Q8) — *Full / GapAccts only*

| Account | ACR LCM | ACR YTD | Pipe (All) | Opps |
|---|---|---|---|---|

For accounts with `ACR_LCM ≥ $1M`, prepend `🔴 GCP LEAKAGE RISK — ` to the account name.

### 7. WoW Movement (from Q9) — *Full / WoW only*

`- [<checkbox>] **<Owner>** · <Account> · <OpportunityName>`
- Stage: **<Stage>** ({StageMovement})
- Commitment Δ: {CommitmentChange}
- Date Δ: {DateChange}
- Status: {MilestoneStatus} ({StatusChange})
- [Milestone Link](<MilestoneLink>)

Checkbox selection: same scheme as section 5.

### 8. Risk Summary

```
🔴 CRITICAL ({critical_count})
- <one-line per item with link>

🟡 HIGH ({high_count})
- <one-line per item with link>

🟠 MEDIUM ({medium_count})
- <one-line per item with link>
```

If a tier is empty: `- None.`

### 9. Recommended Actions

Group by `OpptyOwnerAlias`. For each owner, list the concrete next actions L.C.G. or the owner should take. Each action MUST be checkbox-prefixed and include the CRMLink:

```
- [ ] 👤 **<Owner>** · <action> · ⏰ **<deadline>** [CRM](<CRMLink>)
```

### 10. Drafts Created (only if Step 5 ran)

| Owner | Subject | Recipient | Draft Link |
|---|---|---|---|

If Step 5 did not run: omit this section.

### 11. Source Queries

```
Report: MSA_AzureConsumption_Enterprise (d07c4e15-95f9-42f6-8411-59293f6895a1)
Semantic Model: 726c8fed-367a-4249-b685-e4e22ca82b3d
Filter: SalesProgram[ProgramName] = "HLS Database Catalyst"
       + DimDate[IsAzureClosedAndCurrentOpen] = "Y"
       + DimViewType[ViewType] = "Curated"
Snapshot batch: Q1, Q2, Q3, Q4 (1 ExecuteQuery)
Detail batch:   {gated query list} (1 ExecuteQuery)
Generated: <YYYY-MM-DD HH:MM Local>
```
