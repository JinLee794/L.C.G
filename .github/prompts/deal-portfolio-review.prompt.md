---
agent: Chief of Staff
---
# CRM Portfolio Review

Today is {{TODAY}}. Run a portfolio health review.

## Inputs
- scope: {{scope}} (leave blank to use the authenticated CRM user's portfolio; or provide an account name, TPID, or seller alias)

## Steps
1. Load the deal-portfolio-review skill for detailed procedure.
2. Read `_lcg/role.md` from the vault for team-model, team discovery method, and forecast targets.
3. If forecast targets are stale (`last-refreshed` > 7 days or "never"), plan to refresh from CRM.
4. Resolve identity:
   - Call `msx-crm:crm_whoami` and use the returned UserId.
   - Apply team discovery from `_lcg/role.md`: territory → resolve accounts, seller-list → resolve sellers, direct-reports → query org hierarchy, self → use WhoAmI only.
   - If scope is explicitly provided, it overrides role config.
5. Pull active opportunities (scoped per role config or explicit scope):
   - For self: `msx-crm:get_my_active_opportunities({ maxResults: 100 })`
   - For territory accounts: `msx-crm:list_opportunities({ accountId: "<id>" })` per account
   - For sellers: `msx-crm:list_opportunities({ ownerId: "<seller-id>" })` per seller
   - For direct reports: `msx-crm:list_opportunities({ ownerId: "<report-id>" })` per report + self
6. Compute pipeline metrics:
   - Total pipeline value, weighted pipeline, stage distribution, close-date distribution.
   - Pipeline coverage = weighted pipeline ÷ quarterly-quota (from role config). Flag if below coverage-target-multiple.
7. If forecast targets were stale, refresh them from CRM and update `_lcg/role.md`.
8. Flag exceptions:
   - STAGE STALE: opportunity in current stage >30 days with no activity.
   - CLOSE DATE PAST DUE: `estimatedclosedate` < today and still active.
   - CLOSE DATE IMMINENT: `estimatedclosedate` within 14 days.
   - MISSING FIELDS: `msp_salesplay` null, `description` empty, `estimatedvalue` = 0.
   - LOW WIN PROBABILITY: Stage 2+ but win probability < 20%.
   - HIGH VALUE: estimated revenue ≥ $500K.
   - COVERAGE GAP: weighted pipeline below target multiple (if quota is set).
9. Format the output using the structure defined in the deal-portfolio-review skill.
10. At the end of the output, add: "Need milestone-level detail? Ask me to drill into milestones for any opportunity above."
11. Persist to vault:
   - Path: `Weekly/{{TODAY}}-portfolio-review.md`
   - If file exists, replace it. If not, create it.

## Guardrails
- Read-only. Never execute CRM writes.
- Never send mail or post to Teams.
- If scoped lookup fails, fall back to full portfolio and note the degradation.
