# Detection Rules — SQL600 Sales Play Tagging Audit

> **Freedom Level: None** — These patterns and mappings are exact. Do not add, remove, or modify workload patterns or sales play expectations without updating this file.

---

## SQL Workload Patterns

Milestone workloads (from `_msp_workloadlkid_value` in CRM or `'✽ Pipeline'[MilestoneWorkload]` in PBI) that indicate SQL600-relevant work. Match is **case-insensitive prefix/contains**.

### Tier 1 — Core SQL Workloads (always SQL600-relevant)

| Workload Pattern | Description |
|---|---|
| `Data: SQL Modernization to Azure SQL MI with AI (PaaS)` | SQL Server → Azure SQL Managed Instance |
| `Data: SQL On-prem to Azure SQL VM (IaaS)` | SQL Server → SQL on Azure VM |
| `Data: SQL to Azure SQL Hyperscale (AI Apps & Agents)` | SQL Server → Azure SQL Hyperscale |
| `Data: SQL Server on Azure VM (Migrate & Modernize)` | SQL VM migration |

**Detection rule:** If `MilestoneWorkload` starts with `"Data: SQL"`, it is Tier 1.

### Tier 2 — Adjacent SQL Workloads (contextually relevant)

| Workload Pattern | SQL600 Relevance |
|---|---|
| `Data: MySQL Flexible Server (Migrate & Modernize)` | MySQL migration — may qualify depending on account context |
| `Data: MySQL Flexible Server (AI Apps & Agents)` | MySQL for new apps — lower SQL600 relevance |
| `Data: PostgreSQL Flexible Server (Migrate & Modernize)` | PostgreSQL — only if migrating from SQL Server |

**Detection rule:** If `MilestoneWorkload` contains `"MySQL"` or `"PostgreSQL"`, classify as Tier 2. Include in report but with lower severity.

### Tier 3 — Modernization Flag (PBI-only)

| Signal | Source |
|---|---|
| `'✽ Pipeline'[Modernization Workload Flag] = 1` | PBI Pipeline fact |

**Detection rule:** If Modernization Workload Flag = 1 AND workload is not Tier 1/2, still include as potentially SQL600-relevant. Cross-reference with account SQL Cores.

---

## Expected Sales Play Mapping

The `msp_salesplay` field on the opportunity. Expected values for SQL600 work:

### ✅ Correct Sales Plays

| Sales Play | Code | When Expected |
|---|---|---|
| **Migrate and Modernize Your Estate** | `861980067` | Primary play for any SQL migration/modernization opp |
| **Build and Modernize AI Apps** | `861980037` | Valid when SQL workload is part of an AI app modernization |

### 🟡 Adjacent (Flag as Warning)

| Sales Play | Code | When Flagged |
|---|---|---|
| Innovate with Azure AI Apps and Agents | `861980098` | Commonly set but not ideal for SQL-first modernization opps |
| Unify Your Data Platform | `861980038` | Valid for SQL → Fabric/analytics scenarios but verify intent |
| Scale with Cloud and AI Endpoints | `861980056` | Unusual for SQL modernization — likely mistagged |

### 🔴 Incorrect (Flag as Critical)

Any sales play NOT in the ✅ or 🟡 lists above when the opp has Tier 1 SQL workloads. Common mismatches:

| Sales Play | Code | Why Wrong |
|---|---|---|
| Data Security | `861980027` | Security play — not SQL modernization |
| Modern SecOps with Unified Platform | `606820006` | Security ops play |
| Copilot and Agents at Work | `861980097` | M365/Copilot play |
| Sales Transformation with AI | `861980020` | BizApps play |
| Drive Cloud Success through Unified with Enhanced Solutions | `861980087` | Unified delivery play |
| ERP Transformation with AI | `861980026` | BizApps play |
| Not Applicable | `861980040` | Must be set to a real play |
| `null` / empty | — | Must be set |

### Mapping Decision Tree

```
Is MilestoneWorkload Tier 1 (starts with "Data: SQL")?
├── YES → Expected salesplay: "Migrate and Modernize Your Estate" (861980067)
│         OR "Build and Modernize AI Apps" (861980037)
│         ├── Match → ✅ Clean
│         ├── Adjacent play (🟡 list) → ⚠️ Warning
│         └── Other play or null → 🔴 Critical
│
├── Tier 2 (MySQL/PostgreSQL)?
│   └── Flag as 🟡 Warning regardless of salesplay — needs human review
│
└── Modernization Flag = 1 (Tier 3)?
    └── Report for awareness — no auto-classification
```

---

## Severity Classification

### 🔴 Critical

- Tier 1 SQL workload on milestone + `msp_salesplay` is null, empty, or in the 🔴 Incorrect list
- Priority escalation: include in executive exception summary

### 🟡 Warning

- Tier 1 SQL workload + `msp_salesplay` is in the 🟡 Adjacent list (valid but non-ideal)
- Tier 2 workload (MySQL/PostgreSQL) regardless of sales play
- Priority: include in detail section, recommend review

### ⚪ Gap Account

- SQL600 HLS account with `SQLCores > 0` but zero Tier 1 SQL workload opportunities
- SQL600 HLS account with zero open opps in PBI pipeline
- Priority: include in gap section with SQL Cores count for sizing

### ✅ Clean

- Tier 1 SQL workload + `msp_salesplay` is in the ✅ Correct list
- Report count only — do not list individual clean opps unless in Account Drill mode

---

## CRM Field Reference

### Opportunity Fields

| CRM Field | Display Name | Type | How Used |
|---|---|---|---|
| `msp_salesplay` | Sales Play | OptionSet (int) | Primary audit target — compare against expected values |
| `name` | Opportunity Name | Text | Display in report |
| `msp_activesalesstage` | Active Sales Stage | Text | Context for severity (early stage vs. late stage) |
| `msp_opportunitynumber` | Opportunity Number | Text | Reference link |
| `_ownerid_value` | Owner | Lookup | Contact for remediation |
| `_parentaccountid_value` | Parent Account | Lookup | Account context |

### Milestone Fields

| CRM Field | Display Name | Type | How Used |
|---|---|---|---|
| `_msp_workloadlkid_value` | Workload | Lookup | Primary SQL workload identification |
| `msp_milestoneworkload` | Workload Type | OptionSet | Workload type enum (Azure/D365/Security/MW) |
| `msp_name` | Milestone Name | Text | Display context |
| `msp_milestonestatus` | Status | OptionSet | Filter active milestones |
| `msp_monthlyuse` | Monthly Use | Currency | Pipeline sizing |
| `msp_commitmentrecommendation` | Commitment | OptionSet | Pipeline commitment level |
| `msp_milestoneazurecapacitytype` | Azure Capacity Type | MultiSelect | Azure capacity context |

### PBI Pipeline Fields (from `'✽ Pipeline'` fact)

| PBI Column | Maps To | Notes |
|---|---|---|
| `MilestoneWorkload` | `_msp_workloadlkid_value` display value | Workload name string |
| `Modernization Workload Flag` | Computed | 1 = modernization workload |
| `OpportunityID` | `opportunityid` | CRM GUID for cross-reference |
| `OpportunityName` | `name` | Display name |
| `OpportunityLink` | `recordUrl` | CRM deep link |
| `StrategicPillar` | Product dimension | Service category |
