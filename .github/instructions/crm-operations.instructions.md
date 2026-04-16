---
applyTo: "**"
---
# CRM Operations Rules

## Read Operations
- Read CRM data autonomously when needed for prep and triage.
- Prefer human-readable names over raw IDs.
- Use vault-known IDs for precise scoping whenever available.

## Write Operations
- Stage all creates/updates for human approval.
- Show before/after diff for updates.
- Confirm final write result with record link when available.

## Milestone Monitoring
Flag milestones that are:
- Past due and stale.
- Missing tasks.
- Owned by contacts who have not replied to recent follow-ups.

## Opportunity Monitoring
Flag opportunities that are:
- Stage-stale (no activity beyond governance threshold).
- Close-date drifting (past due or within 14 days with no active tasks).
- Missing required fields (`msp_salesplay` null, `msp_monthlyuse` empty).
- Pipeline coverage below target for the period.

## Update Request Drafting
- Draft update request emails only.
- Include opportunity or milestone name, due date, and exact ask.
- Use L.C.G's follow-up tone guidance.
