---
name: deal-opportunity-review
description: "Single-opportunity deep-dive review: pulls full opportunity detail, active milestones, deal team, recent engagement signals, and risk posture into a one-page brief. Designed for pre-meeting prep, deal coaching, or ad-hoc \"what's going on with this deal?\" requests. Triggers: opportunity review, deal review, opp review, opportunity detail, deal deep dive, opportunity status, deal status, what is happening with opportunity, opp health."
argument-hint: 'Provide an opportunity name, account name, or opportunity ID. Optionally add "for [account]" to scope by account.'
---

# Opportunity Review

## Purpose

Produce a single-opportunity deep-dive brief — combining CRM opportunity fields, milestone status, deal team, engagement signals, and vault context into a concise review document. This is the "zoom in" complement to the portfolio-level `deal-portfolio-review`.

## When to Use

- Pre-meeting prep for a specific deal discussion
- Seller 1:1 coaching around a deal
- User asks "what's going on with [deal name]?" or "review [opportunity]"
- Ad-hoc deal health check before a customer call
- Governance review of a single high-value or at-risk opportunity

## When NOT to Use

- Portfolio-wide sweeps → use `deal-portfolio-review`
- Milestone-only governance → use `deal-milestone-review`
- Pipeline hygiene across many deals → use `powerbi-billed-pipeline-hygiene` or `powerbi-consumption-pipeline-hygiene`
- Account-level landscape → use `deal-account-landscape`

## Runtime Contract

### Required MCP Tools

| Tool | Purpose |
|------|---------|
| `msx-crm:crm_whoami` | Resolve authenticated user identity |
| `msx-crm:list_opportunities` | Search opportunities by customer keyword or opp keyword |
| `msx-crm:get_my_active_opportunities` | Find opportunities where user is on deal team |
| `msx-crm:crm_query` | Flexible OData lookup for full field detail by opportunity ID |

### Optional MCP Tools

| Tool | Purpose |
|------|---------|
| `msx-crm:get_milestones` | Pull active milestones for the opportunity |
| `msx-crm:manage_deal_team` | Retrieve deal team members |
| `msx-crm:list_accounts_by_tpid` | Resolve account from TPID |
| `oil:search_vault` / `oil:read_note_section` | Pull vault context (prior briefs, meeting notes) |
| `oil:create_note` / `oil:atomic_replace` | Persist output to vault |

## Flow

### Step 1: Resolve Identity

```
msx-crm:crm_whoami → { UserId, fullname }
```

### Step 2: Find the Opportunity

Use the input to locate the target opportunity. Try in order:

**If opportunity ID provided:**
```
msx-crm:crm_query({
  entitySet: "opportunities",
  filter: "opportunityid eq '<id>'",
  select: "opportunityid,name,estimatedvalue,estimatedclosedate,stepname,statecode,statuscode,msp_salesplay,msp_consumptionconsumedrecurring,description,modifiedon,createdon,_parentaccountid_value,_ownerid_value,msp_opportunitynumber,msp_estcompletiondate,msp_activesalesstage",
  top: 1
})
```

**If account name provided:**
```
msx-crm:list_opportunities({ customerKeyword: "<name>" })
```
Then match by opportunity name substring if also provided.

**If only opportunity name provided:**
```
msx-crm:list_opportunities({ opportunityKeyword: "<search term>" })
```
Or use the flexible `crm_query` for broader search:
```
msx-crm:crm_query({
  entitySet: "opportunities",
  filter: "contains(name,'<search term>')",
  select: "opportunityid,name,estimatedvalue,estimatedclosedate,stepname,statecode,statuscode,msp_salesplay,msp_consumptionconsumedrecurring,description,modifiedon,createdon,_parentaccountid_value,_ownerid_value,msp_opportunitynumber,msp_estcompletiondate,msp_activesalesstage",
  top: 10
})
```
If multiple results, present a numbered list and ask for clarification — unless one is an obvious match.

### Step 3: Pull Full Opportunity Detail

From the resolved opportunity, capture these **core fields**:

| Field | CRM Column | Notes |
|-------|-----------|-------|
| Name | `name` | |
| Account | `_parentaccountid_value` | Formatted value has display name |
| Stage | `stepname` | Full stage label (e.g. "3-3-Listen & Consult") |
| Active Sales Stage | `msp_activesalesstage` | Friendly stage name |
| Estimated Value | `estimatedvalue` | Deal size |
| Monthly Consumption | `msp_consumptionconsumedrecurring` | Recurring monthly consumption |
| Est. Close Date | `estimatedclosedate` | May be null — fall back to `msp_estcompletiondate` |
| Est. Completion Date | `msp_estcompletiondate` | Milestone-driven completion date |
| Sales Play | `msp_salesplay` | Formatted value has display name |
| Opp Number | `msp_opportunitynumber` | Human-readable opp ID |
| Status | `statecode` / `statuscode` | 0/1 = Open/In Progress |
| Description | `description` | Opportunity summary |
| Last Modified | `modifiedon` | Staleness indicator |
| Created | `createdon` | Deal age |
| Owner | `_ownerid_value` | Formatted value has display name |
| Opportunity ID | `opportunityid` | GUID for downstream lookups |

### Step 4: Pull Milestones

```
msx-crm:get_milestones({
  opportunityIds: ["<opportunityid>"],
  statusFilter: "active"
})
```

For each milestone, capture:
- Milestone name, ID (`msp_engagementmilestoneid`)
- Status, due date (`msp_milestonedate`)
- Workload, monthly use, commitment level
- Owner

### Step 5: Pull Deal Team

```
msx-crm:manage_deal_team({
  action: "list",
  opportunityId: "<opportunityid>"
})
```

### Step 6: Pull Vault Context (optional)

Search vault for prior engagement notes, meeting briefs, or customer context:
```
oil:search_vault({ query: "<account name> <opportunity name>" })
```

### Step 7: Assess Risk Posture

Apply these risk signals:

| Signal | Condition | Severity |
|--------|-----------|----------|
| **OVERDUE CLOSE** | `estimatedclosedate` < today | High |
| **CLOSE IMMINENT** | `estimatedclosedate` within 14 days | Medium |
| **STAGE STALE** | `modifiedon` > 30 days ago with no stage progression | High |
| **MISSING FIELDS** | `msp_salesplay` null, `estimatedvalue` = 0, or `description` empty | Medium |
| **NO MILESTONES** | Zero active milestones on an active opportunity | Medium |
| **MILESTONE OVERDUE** | Any milestone past `msp_milestonedate` | High |
| **HIGH VALUE + AT RISK** | `estimatedvalue` ≥ $500K AND any High-severity signal | Critical |

### Step 8: Format Output

See [Output Format](#output-format) below.

### Step 9: Persist (optional)

If user requests, or if running as part of a scheduled prep:
Write to vault at `Meetings/<today>-opp-review-<account>.md`:
- If file exists → `oil:atomic_replace`
- If file does not exist → `oil:create_note`

## Output Format

```markdown
# Opportunity Review: <Opportunity Name>

## Deal Snapshot
- **Opportunity:** <name> (`<msp_opportunitynumber>`)
- **Account:** <account name>
- **Stage:** <msp_activesalesstage> (`<stepname>`)
- **Estimated Value:** $<estimatedvalue>
- **Monthly Consumption:** $<msp_consumptionconsumedrecurring>/mo
- **Est. Completion Date:** <msp_estcompletiondate> · **Est. Close Date:** <estimatedclosedate or "Not set">
- **Sales Play:** <msp_salesplay formatted value or "Not set">
- **Status:** <statecode formatted> / <statuscode formatted>
- **Owner:** <owner name>
- **Created:** <createdon> · **Last Modified:** <modifiedon>
- **Deal Age:** <days> days
- **Risk Posture:** 🟢 Healthy | 🟡 Watch | 🔴 At Risk | ⚫ Critical
- **CRM Link:** [Open in MSX](recordUrl)

## Risk Signals
- [f] **OVERDUE CLOSE** — close date was <date>, now <days> days past due
- [!] **STAGE STALE** — no modification in <days> days
- [k] **MISSING FIELDS** — <field list>
- None. (if no signals)

## Active Milestones
| Milestone | ID | Status | Due Date | Workload | Monthly | Commitment | Owner |
|-----------|----|--------|----------|----------|---------|------------|-------|
| <name> | <id> | On Track | <date> | <workload> | $<monthly> | Committed | <owner> |

### Milestone Flags
- [f] **<Milestone>** · `<id>` — OVERDUE by <days> days
- [!] **<Milestone>** · `<id>` — AT RISK
- None.

## Deal Team
| Name | Role | Email |
|------|------|-------|
| <name> | <role> | <email> |

## Vault Context
> Summary of relevant vault notes, prior meeting briefs, or engagement history.
> If no vault context found: "No vault context available for this account."

## Recommended Actions
- [ ] 👤 **<Owner>** · <action> · ⏰ **by <when>**
- [ ] 👤 **<Owner>** · <action>

## Run Metadata
- Run date: <today>
- Resolved by: <method — name search | account scoped | ID lookup>
- Opportunity ID: <opportunityid>
- Milestones found: <count>
- Deal team members: <count>
- Vault context: available | unavailable
```

## Guardrails

- **Read-only.** Never execute CRM writes from this workflow.
- **Never send email or post to Teams.**
- **Always include `opportunityid`** in the output for downstream CRM lookups.
- **Always include `msp_engagementmilestoneid`** on every milestone reference.
- If milestones tool is unavailable, proceed without milestones and note the gap.
- If deal team tool is unavailable, proceed without deal team and note it.
- If vault context is unavailable, proceed with CRM data only and note it.
- If multiple opportunities match the search, present options — never silently pick one.
