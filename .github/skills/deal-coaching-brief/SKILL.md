---
name: deal-coaching-brief
description: 'Pre-1:1 coaching brief for GMs meeting with sellers: assembles the seller''s pipeline, recent deal movement, overdue actions, win/loss patterns, and coaching opportunities into a structured brief. Triggers: seller 1:1 prep, rep coaching, pipeline by seller, seller review, 1:1 prep, coaching brief, seller pipeline, rep pipeline review.'
argument-hint: 'Provide seller name or alias for the target seller'
---

# Seller Coaching Brief

## Purpose

Produce a focused coaching brief for a GM's 1:1 with a seller — covering their pipeline, recent deal movement, activity patterns, and coaching opportunities.

## When to Use

- Pre-1:1 meeting prep with a direct report or team member
- User asks "seller 1:1 prep", "coaching brief for [name]", or "pipeline by seller"
- Identifying coaching moments across a seller's portfolio

## Role Configuration

Read `_lcg/role.md` from the vault. If the user's `method` is `seller-list`, the configured sellers are available for quick resolution without CRM lookups. Otherwise, resolve the seller by name via CRM query.

## Runtime Contract

### Required MCP Tools

| Tool | Purpose |
|------|---------|
| `msx-crm:crm_whoami` | Resolve authenticated user identity |
| `msx-crm:crm_query` | Look up seller by name/alias |
| `msx-crm:list_opportunities` | Pull opportunities owned by the seller |

### Optional MCP Tools

| Tool | Purpose |
|------|---------|
| `msx-crm:get_milestones` | Drill into milestone execution |
| `oil:search_vault` / `oil:read_note_section` | Pull prior 1:1 notes and coaching context |
| `oil:create_note` / `oil:atomic_replace` | Persist output to vault |

## Flow

### Step 1: Resolve Seller

```
msx-crm:crm_query({
  entitySet: "systemusers",
  filter: "contains(fullname,'<seller-name>')",
  select: "systemuserid,fullname,internalemailaddress",
  top: 5
})
```

### Step 2: Pull Seller's Opportunities

```
msx-crm:list_opportunities({ ownerId: "<seller-systemuserid>" })
```

### Step 3: Pull Vault Context

Read prior 1:1 notes, coaching themes, and carry-forward action items from vault.

### Step 4: Analyze Pipeline

- Stage distribution and total value
- Deals advancing vs. stalling
- Close-date accuracy (how often does the seller push dates?)
- Activity recency per deal (days since last CRM activity)

### Step 5: Identify Coaching Opportunities

| Pattern | Signal | Coaching Question |
|---------|--------|-------------------|
| Stale pipeline | >30 days at same stage, no activity | "What's the next step to move [deal] forward?" |
| Close-date drift | Date pushed 2+ times | "What's blocking the close? Is the timeline realistic?" |
| Thin pipeline | <3× coverage | "Where are we sourcing new pipeline this month?" |
| Concentration | Single deal >40% of pipeline | "What's our backup if [deal] slips?" |
| No exec engagement | Stage 3+ without exec sponsor contact | "Have we mapped the power structure at [account]?" |

### Step 6: Format and Persist

Write to vault at `Meetings/<today>-1on1-<seller-slug>.md`.

## Output Format

```markdown
# 1:1 Coaching Brief: <Seller Name>

## Seller Snapshot
- **Name:** <name>
- **Active Opportunities:** <count> totaling $<value>
- **Weighted Pipeline:** $<weighted>
- **Pipeline Coverage:** <ratio>× (vs 3× target)

## Pipeline Overview
| Opportunity | Stage | Close Date | Value | Win % | Days in Stage | Last Activity |
|-------------|-------|------------|-------|-------|---------------|---------------|
| [name](recordUrl) | 2 | date | $X | 60% | 15 | 3/25 |

## Recent Movement
- [u] **<deal>** — advanced from Stage {n} to {n+1}
- [d] **<deal>** — close date pushed from <old> to <new>
- [-] **<deal>** — lost/removed; reason: <reason>

## Carry-Forward from Last 1:1
- [ ] **<action from prior 1:1>** — status
- [x] **<completed action>**

## Coaching Opportunities
- [?] **<pattern>** — <coaching question>
  - 💡 Evidence: <specific deal or data point>

## Recommended Discussion Topics
1. <topic — most impactful>
2. <topic>
3. <topic>

## Source Links
- 📊 CRM: [opportunities](recordUrl)
- 📝 Vault: [prior 1:1 notes]
```

## Guardrails

- Read-only. Never execute CRM writes.
- Never send mail or post to Teams.
- Coaching suggestions are advisory — frame as questions, not directives.
- If vault has no prior 1:1 notes, skip carry-forward section and note it.
