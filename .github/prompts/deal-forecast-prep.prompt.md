---
agent: Chief of Staff
---
# Forecast Preparation

Today is {{TODAY}}. Assemble a forecast-ready pipeline snapshot.

## Inputs
- scope: {{scope}} (leave blank for full portfolio; or specify account name or time horizon like "this-quarter")

## Steps
1. Load the deal-forecast-prep skill for detailed procedure.
2. Read `_lcg/role.md` from the vault for forecast targets (quarterly-quota, coverage-target-multiple, last-refreshed).
3. If `last-refreshed` is older than 7 days or "never", plan to refresh targets from CRM.
4. Resolve identity via `msx-crm:crm_whoami`.
5. Pull active opportunities:
   - `msx-crm:get_my_active_opportunities({ maxResults: 200 })`
6. Categorize each opportunity:
   - **Commit**: Stage 4+ or win probability ≥ 80%
   - **Upside**: Stage 3, win probability 50–79%
   - **Best Case**: Stage 2–3, win probability 20–49%
   - **Pipeline**: Stage 1–2, win probability < 20%
7. Compute forecast metrics: totals by category, close-date distribution, top 5 deals.
8. Pipeline coverage = weighted pipeline ÷ quarterly-quota. Flag if below coverage-target-multiple.
9. If targets were stale, refresh from CRM and update `_lcg/role.md` via OIL.
10. Read prior snapshot (most recent `Weekly/*-portfolio-review.md` or `Weekly/*-forecast.md`) for delta comparison.
11. Flag forecast risks: concentration, close-date clustering, stage regression, coverage gaps, stale commits.
12. Format output per the deal-forecast-prep skill output template.
13. Persist to vault:
   - Path: `Weekly/{{TODAY}}-forecast.md`
   - If file exists, replace it. If not, create it.

## Guardrails
- Read-only. Never execute CRM writes.
- Never send mail or post to Teams.
- If no prior snapshot exists, skip delta and note it.
