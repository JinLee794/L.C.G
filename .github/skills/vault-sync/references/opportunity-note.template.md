<!-- vault-sync template: Opportunity Note
     Customize this template to change how CRM opportunity data is stored in your vault.
     Placeholders use {CRM_FIELD} syntax — the sync process replaces them with live values. -->

---
customer: "{CustomerName}"
opportunity: "{OpportunityName}"
opportunityId: "{GUID}"
opportunityNumber: "{msp_opportunitynumber}"
stage: "{msp_activesalesstage label}"
estClose: "{YYYY-MM-DD}"
dealValue: {estimatedvalue}
recurringACR: {msp_consumptionconsumedrecurring}
solutionPlay: "{msp_salesplay label}"
msxLink: "https://microsoftsales.crm.dynamics.com/main.aspx?etn=opportunity&id={GUID}&pagetype=entityrecord"
last_opp_sync: "{ISO date}"
icon: LiTarget
tags:
  - opportunity
  - crm-synced
---

# 🎯 {OpportunityName}

| | |
|---|---|
| **Opp #** | [{msp_opportunitynumber}]({msxLink}) |
| **Stage** | {stage} |
| **Est. Close** | {date} |
| **Solution Play** | {play} |
| **🔗 MSX** | [Open in MSX]({msxLink}) |

## 💰 ACR Summary

<!-- Auto-synced from MSX CRM. Do not edit manually — values refresh on next sync. -->

| | Name | Monthly Use (ACR) | Commitment | Status | 🔗 |
|---|------|-------------------|------------|--------|----|
| 🎯 **Opportunity** | {OppName — ESCAPE PIPES} | — | — | {best-available ACR} | [MSX]({oppUrl}) |
| 📋 Milestone | {MilestoneName — ESCAPE PIPES} | ${msp_monthlyuse}/mo | {commitment} | {status} | [MSX]({milestoneUrl}) |
| **Total Milestone ACR** | — | **${sum}/mo** | — | — | |

## 👤 Deal Team

<!-- Auto-synced from MSX CRM deal team. Do not edit manually. -->

| 👤 Name | Email | Title | Owner | <!-- userid --> |
|---------|-------|-------|-------|---|
| {FullName} | {email} | {title} | {✅ if msp_isowner} | <!-- userid:{systemuserid} --> |

## Opportunity Notes

<!-- Synced from CRM opportunity description field. -->

{description text, or "No description in CRM." if empty}

## 📝 Milestone Forecast Comments

<!-- Auto-synced from MSX CRM msp_forecastcomments. Most recent comment per milestone. -->

| 📋 Milestone | Latest Comment | Author | Date | 🔗 |
|-------------|----------------|--------|------|---|
| {MilestoneName} | {latest comment, truncated 200 chars} | {userId} | {modifiedOn} | [MSX]({milestoneUrl}) |
