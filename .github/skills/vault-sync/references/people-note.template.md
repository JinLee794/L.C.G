<!-- vault-sync template: People Note
     Customize this template to change how CRM deal team members are stored in your vault.
     Placeholders use {CRM_FIELD} syntax — the sync process replaces them with live values.
     The "Notes" and "Meetings" sections are user-authored and never overwritten. -->

---
tags:
  - people
title: "{CRM title}"
email: "{internalemailaddress}"
company: "Microsoft"
customers:
  - "{CustomerName}"
org: internal
icon: LiUser
---

tags:: [[👥 People MOC]]

# {Full Name}

## Notes
- Category: Internal Account Team
- Organization: Microsoft
- Discovered via CRM deal team on [[{OpportunityName}]]

## Meetings

```dataview
Table file.cday as Created, summary AS "Summary"
FROM "Timestamps/Meetings" where contains(file.outlinks, [[{Full Name}]])
SORT file.cday DESC
```
