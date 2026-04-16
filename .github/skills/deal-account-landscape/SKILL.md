---
name: deal-account-landscape
description: 'Account landscape brief for executive reviews: assembles all opportunities, key contacts, recent engagement signals, competitive posture, and expansion potential for a single account into a one-page executive summary. Triggers: account review, account landscape, customer portfolio, exec account brief, account summary, QBR prep, account health, customer overview.'
argument-hint: 'Provide account name, TPID, or GUID for the target account'
---

# Account Landscape Brief

## Purpose

Produce a one-page account landscape for executive reviews — aggregating all opportunities, key stakeholder relationships, recent engagement signals, competitive posture, and expansion potential.

## When to Use

- Pre-QBR or pre-executive-review preparation
- Account landscape overview for new team members
- User asks "account landscape", "account summary", or "QBR prep for [account]"

## Runtime Contract

### Required MCP Tools

| Tool | Purpose |
|------|---------|
| `msx-crm:crm_whoami` | Resolve authenticated user identity |
| `msx-crm:list_accounts_by_tpid` | Resolve account from TPID |
| `msx-crm:list_opportunities` | Pull all opportunities for the account |

### Optional MCP Tools

| Tool | Purpose |
|------|---------|
| `msx-crm:get_milestones` | Drill into active milestones by opportunity |
| `oil:search_vault` / `oil:read_note_section` | Pull vault context for the account |
| `oil:create_note` / `oil:atomic_replace` | Persist output to vault |

## Flow

### Step 1: Resolve Account

If TPID provided:
```
msx-crm:list_accounts_by_tpid({ tpid: "<tpid>" })
```

If name provided, resolve via vault context first, then CRM query as fallback.

### Step 2: Pull All Opportunities

```
msx-crm:list_opportunities({ accountId: "<accountid>" })
```

### Step 3: Pull Vault Context

Read account notes from vault for:
- Stakeholder map (decision makers, sponsors, blockers, champions)
- Relationship history and prior meeting notes
- Known competitive landscape
- Historical risk patterns

### Step 4: Pull Recent Engagement

Delegate to `@m365-actions`:
- Recent email threads involving account contacts (last 14 days)
- Recent meetings with account attendees (last 14 days)

### Step 5: Assemble Landscape

Synthesize CRM, vault, and M365 data into the output format.

## Output Format

```markdown
# Account Landscape: <Account Name>

## Account Snapshot
- **Account:** <name>
- **TPID:** <tpid>
- **Segment / Industry:** <segment>
- **Active Opportunities:** <count> totaling $<value>
- **Relationship Health:** Strong | Stable | At Risk | Unknown

## Opportunity Portfolio
| Opportunity | Stage | Close Date | Value | Win % | Owner | Status |
|-------------|-------|------------|-------|-------|-------|--------|
| [name](recordUrl) | 2 | date | $X | 60% | owner | On Track |

## Key Stakeholders
- 👤 **<Name>** · <Title> · <Role: Sponsor|DM|Champion|Blocker>
  - Last contact: <date> via <channel>
  - Sentiment: Positive | Neutral | Cautious | Unknown

## Recent Engagement Signals
- 📧 **[thread subject](webLink)** — <date> — <one-line summary>
- 📅 **[meeting title](webLink)** — <date> — <one-line summary>

## Competitive Landscape
- **Known competitors:** <list or "None identified">
- **Competitive posture:** Leading | Competitive | Defensive | Unknown

## Expansion Potential
- [I] **<expansion area>** — evidence and opportunity
- [u] **<positive signal>** — what it means

## Risks
- [!] **<risk>** — impact and mitigation

## Recommended Actions
- [ ] 👤 **Owner** · action · ⏰ **by when**

## Source Links
- 📊 CRM: [opportunity/account](recordUrl)
- 📧 Mail: [thread](webLink)
- 📅 Calendar: [event](webLink)
- 📝 Vault: [note references]
```

## Guardrails

- Read-only. Never execute CRM writes.
- Never send mail or post to Teams.
- If vault context is unavailable, proceed with CRM + M365 data and note the gap.
- If M365 data is unavailable, proceed with CRM + vault and note the degradation.
