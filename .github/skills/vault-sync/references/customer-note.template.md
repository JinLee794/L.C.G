<!-- vault-sync template: Customer Note
     Customize this template to change how customer root notes are structured in your vault.
     Placeholders use {CRM_FIELD} syntax — the sync process replaces them with live values.
     The "Notes" section is user-authored and never overwritten by sync operations. -->

---
tags:
  - customer
aliases:
  - "{CRM Account Name}"
sticker: lucide//building-2
icon: LiBuilding2
parent_company:
subsidiaries:
has_unified: false
MSX:
  account: "{CRM Account Name}"
  accountId: "{account GUID if known}"
last_validated: "{ISO date}"
---

# {CustomerName}

## 🏢 Pipeline

<!-- Auto-populated by dataview. Do not edit manually. -->

```dataview
TABLE WITHOUT ID
  link(file.link, opportunity) AS "🎯 Opportunity",
  stage AS "Stage",
  "$" + string(recurringACR) + "/mo" AS "💰 ACR",
  estClose AS "Est. Close",
  solutionPlay AS "Solution Play"
FROM "Customers/{CustomerName}/opportunities"
WHERE contains(tags, "opportunity")
SORT recurringACR DESC
```

## 📋 Milestones

<!-- Auto-populated by dataview. Active milestones across all opportunities. -->

```dataview
TABLE WITHOUT ID
  link(file.link, milestone) AS "📋 Milestone",
  status AS "Status",
  "$" + string(monthlyUse) + "/mo" AS "💰 Monthly Use",
  commitment AS "Commitment",
  owner AS "Owner",
  milestoneDate AS "Due Date"
FROM "Customers/{CustomerName}/milestones"
WHERE contains(tags, "milestone") AND status != "Completed" AND status != "Cancelled"
SORT milestoneDate ASC
```

## Microsoft Team

- **STU:**
  -
- **ATU:**
  -
- **CSU:**
  -

## Stakeholders

| Name | Title | Email | Role |
|------|-------|-------|------|


## Summary



## Notes

<!-- User-authored section. Never overwritten by sync operations. -->



## Agent Insights

<!-- Consolidated by hygiene pass. Most recent first. Limit ~15 entries. -->



## Connect Hooks

<!-- Evidence captures for Connect attribution. See connect-hooks instructions. -->

