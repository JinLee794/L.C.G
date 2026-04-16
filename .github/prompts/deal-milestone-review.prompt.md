---
agent: Chief of Staff
---
# CRM Milestone Review

Today is {{TODAY}}. Run a team milestone health review for {{manager_name}}.

## Inputs
- manager_name: {{manager_name}} (leave blank to use the authenticated CRM user)

## Steps
1. Load the deal-milestone-review skill for detailed procedure.
2. Resolve the manager:
   - If manager_name is provided, use `msx-crm:crm_query` on `systemusers` filtered by `contains(fullname,'{{manager_name}}')`.
   - If blank or "me", call `msx-crm:crm_whoami` and use the returned UserId.
3. Discover direct reports:
   - Query `systemusers` where `_parentsystemuserid_value eq '<manager-systemuserid>'`.
   - Select `systemuserid,fullname,internalemailaddress`.
4. For each direct report (and the manager), pull active milestones:
   - `msx-crm:get_milestones({ ownerId: "<id>", statusFilter: "active" })`
5. Analyze: flag OVERDUE, AT RISK, DUE THIS WEEK, UNCOMMITTED (≥$5K), HIGH VALUE (≥$50K).
6. Format the output using the structure defined in the deal-milestone-review skill.
7. Persist to vault:
   - Path: `Weekly/{{TODAY}}-milestone-review.md`
   - If file exists, replace it. If not, create it.

## Guardrails
- Read-only. Never execute CRM writes.
- Never send mail or post to Teams.
- If direct reports lookup fails, fall back to manager-only milestones and note the degradation.
