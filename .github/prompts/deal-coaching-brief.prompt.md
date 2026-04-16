---
agent: Chief of Staff
---
# Seller Coaching Brief

Prepare a 1:1 coaching brief for {{seller_name}} on {{TODAY}}.

## Inputs
- seller_name: {{seller_name}}

## Steps
1. Load the deal-coaching-brief skill for detailed procedure.
2. Resolve the seller:
   - `msx-crm:crm_query` on `systemusers` filtered by `contains(fullname,'{{seller_name}}')`.
3. Pull the seller's opportunities:
   - `msx-crm:list_opportunities({ ownerId: "<seller-systemuserid>" })`
4. Pull vault context:
   - Prior 1:1 notes, coaching themes, and carry-forward actions.
5. Analyze pipeline:
   - Stage distribution, deal movement, close-date accuracy, activity recency.
6. Identify coaching opportunities:
   - Stale pipeline, close-date drift, thin coverage, concentration risk, missing exec engagement.
7. Format output per the deal-coaching-brief skill template.
8. Persist to vault:
   - Path: `Meetings/{{TODAY}}-1on1-{{seller_slug}}.md`
   - If file exists, replace it. If not, create it.

## Guardrails
- Read-only. Never execute CRM writes.
- Never send mail or post to Teams.
- Frame coaching suggestions as questions, not directives.
