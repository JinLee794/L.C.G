---
agent: Chief of Staff
---
# Account Landscape Brief

Produce an account landscape brief for {{account}} for executive review.

## Inputs
- account: {{account}} (account name, TPID, or GUID)

## Steps
1. Load the deal-account-landscape skill for detailed procedure.
2. Resolve the account:
   - If TPID: `msx-crm:list_accounts_by_tpid({ tpid: "{{account}}" })`
   - If name: search vault first, then CRM query as fallback.
3. Pull all opportunities for the account:
   - `msx-crm:list_opportunities({ accountId: "<resolved-id>" })`
4. Pull vault context:
   - Stakeholder map, relationship history, competitive landscape, prior notes.
5. Pull recent engagement (delegate to `@m365-actions`):
   - Email threads involving account contacts (last 14 days).
   - Meetings with account attendees (last 14 days).
6. Assemble the landscape per the deal-account-landscape skill output template.
7. Persist to vault:
   - Path: `customers/{{account_slug}}/landscape-{{TODAY}}.md`
   - If file exists, replace it. If not, create it.

## Guardrails
- Read-only. Never execute CRM writes.
- Never send mail or post to Teams.
- If a data source is unavailable, proceed with what's available and note degradation.
