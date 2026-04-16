<!-- vault-sync template: Milestone Note
     Customize this template to change how CRM milestone data is stored in your vault.
     Placeholders use {CRM_FIELD} syntax — the sync process replaces them with live values.
     The "Notes" section below <!-- end-crm-sync --> is never overwritten by sync. -->

---
customer: "{CustomerName}"
opportunity: "{OpportunityName}"
opportunityId: "{opportunityGUID}"
milestone: "{MilestoneName}"
milestoneId: "{milestoneGUID}"
milestoneNumber: "{msp_milestonenumber}"
monthlyUse: {msp_monthlyuse}
status: "{msp_milestonestatus label}"
commitment: "{msp_commitmentrecommendation label}"
milestoneDate: "{YYYY-MM-DD}"
owner: "{owner fullname}"
ownerEmail: "{owner internalemailaddress}"
workload: "{msp_milestoneworkload label}"
deliveredBy: "{msp_deliveryspecifiedfield label}"
msxLink: "https://microsoftsales.crm.dynamics.com/main.aspx?etn=msp_engagementmilestone&id={milestoneGUID}&pagetype=entityrecord"
last_milestone_sync: "{ISO date}"
icon: LiFlag
tags:
  - milestone
  - crm-synced
---

# 📋 {MilestoneName}

| | |
|---|---|
| **Milestone #** | {msp_milestonenumber} |
| **💰 Monthly Use (ACR)** | ${msp_monthlyuse}/mo |
| **Status** | {status} |
| **Commitment** | {commitment} |
| **📅 Milestone Date** | {YYYY-MM-DD} |
| **👤 Owner** | {owner fullname} |
| **Workload** | {workload} |
| **Delivered By** | {deliveredBy} |
| **🔗 MSX** | [Open in MSX]({msxLink}) |
| **🎯 Parent Opp** | [[{OpportunityName}]] · [MSX]({oppMsxLink}) |

## 📝 Forecast Comments

<!-- Auto-synced from MSX CRM. Do not edit — refreshes on next sync. -->

| Date | Author | Comment |
|------|--------|---------|
| {modifiedOn YYYY-MM-DD} | {userId} | {comment, truncated 300 chars} |

> **Latest**: {msp_forecastcomments, or "No forecast comments." if empty}

## Notes

<!-- User-authored section. Sync never touches content below this line. -->
<!-- end-crm-sync -->


## Task Activity Log

<!-- Managed by task sync. Do not edit manually. -->

| Date | Action | Task | Owner | Link |
|------|--------|------|-------|------|
