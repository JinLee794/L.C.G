# L.C.G Skill Index

**35 skills** organized by domain. Updated 2026-04-16.

---

## User-Facing Skills (24)

### deal-* — CRM / Deal Lifecycle

| Skill | Purpose |
|---|---|
| `deal-opportunity-review` | Single-deal deep dive: CRM fields, milestones, deal team, engagement signals |
| `deal-portfolio-review` | Portfolio-wide sweep by seller/territory/stage (CRM-sourced, no PBI) |
| `deal-milestone-review` | Weekly/bi-weekly milestone health for M1 managers and direct reports |
| `deal-forecast-prep` | Pre-forecast-call data assembly: commit/upside/best-case breakdown |
| `deal-coaching-brief` | Pre-1:1 coaching brief for GMs meeting with sellers |
| `deal-account-landscape` | Executive account summary: all opportunities, contacts, engagement, expansion |
| `deal-lifecycle` | Unified MCEM stage spine, diagnostics, gates, handoffs, loopbacks |
| `deal-qualification` | Inbound signal scoring + draft opportunity scaffolding |
| `deal-evidence-pack` | Evidence compilation (email, chat, calendar) for governance prep |
| `deal-outcome-scoping` | KPI/success-plan workshops during early engagement |
| `deal-value-realization` | Post-delivery outcome measurement and ROI evidence |
| `deal-unified-check` | Unified Support dispatch readiness and accreditation validation |

### powerbi-* — Power BI Analytics

| Skill | Purpose |
|---|---|
| `powerbi-billed-pipeline-hygiene` | Billed pipeline exception detection (PBI) + correction staging. Think "what's broken in billed pipeline?" |
| `powerbi-consumption-pipeline-hygiene` | Consumption pipeline exception detection (PBI). Think "what's broken in consumption pipeline?" |
| `powerbi-sql600-hls` | SQL600 HLS executive readout: ACR, pipeline, trends, renewals, modernization, GCP leakage, industry ranking |
| `powerbi-navigator` | Routes natural-language PBI questions to the right `powerbi-*.prompt.md` |

### vault-* — Vault Operations

| Skill | Purpose |
|---|---|
| `vault-settings` | Manage `_lcg/` configs: role, VIP list, preferences, communication style |
| `vault-sync` | CRM → vault entity sync (opportunities, milestones, people, projects, tasks) |

### doc-* — Document Processing

| Skill | Purpose |
|---|---|
| `doc-word` | Read, create, edit Word documents (.docx) via Node.js |
| `doc-pdf` | Read, extract, create, merge, split, OCR PDF files |
| `doc-slides` | Read, create, modify PowerPoint (.pptx) presentations |
| `doc-spreadsheet` | Read, create, edit spreadsheets (.xlsx, .csv, .tsv) |

### triage-* — Inbox & Communications

| Skill | Purpose |
|---|---|
| `triage-win-digest` | Win Room / Winning Wednesdays executive summaries |
| `triage-outlook-rules` | Outlook inbox rule management aligned with triage taxonomy |

### m365-* — M365 Search

| Skill | Purpose |
|---|---|
| `m365-search` | Meeting action items, channel digest, daily triage, email analytics via WorkIQ |

### dashboard-* — Visualization

| Skill | Purpose |
|---|---|
| `dashboard-obsidian` | Obsidian dashboard components: KPI cards, grids, timelines, CSS |

---

## Internal Skills (6)

> Prefixed with `internal-`. These are agent-consumed plumbing — not for direct user invocation.

| Skill | Purpose |
|---|---|
| `internal-vault-config-gate` | Auto-loads `_lcg/` configs as Step 0 of every workflow |
| `internal-vault-routing` | Vault read/search/correlate contract for entity resolution |
| `internal-calendar-scoping` | Calendar MCP efficient query patterns |
| `internal-mail-scoping` | Mail MCP efficient query patterns |
| `internal-teams-scoping` | Teams MCP efficient query patterns |
| `internal-workiq-scoping` | WorkIQ query bounding patterns |

---

## Developer Skills (4)

> Prefixed with `dev-`. These serve skill developers and platform builders.

| Skill | Purpose |
|---|---|
| `dev-skill-authoring` | Skill audit, optimization, and creation guide |
| `dev-mcp-security` | MCP server security guardrails and risk assessment |
| `dev-powerbi-prompt-builder` | Interactive PBI prompt scaffolding for new reports |
| `dev-task-scheduler` | Windows scheduled task management |

---

## "I want to…" Quick Reference

| I want to… | Use |
|---|---|
| Check pipeline health / cleanup | `powerbi-billed-pipeline-hygiene` (billed) or `powerbi-consumption-pipeline-hygiene` (consumption) |
| Review my portfolio | `deal-portfolio-review` |
| Deep-dive a single deal | `deal-opportunity-review` |
| Review team milestones | `deal-milestone-review` |
| Prepare for a forecast call | `deal-forecast-prep` |
| Prep for a seller 1:1 | `deal-coaching-brief` |
| Get an account overview | `deal-account-landscape` |
| Qualify a new inbound signal | `deal-qualification` |
| Check MCEM stage / gates | `deal-lifecycle` |
| Build an evidence pack | `deal-evidence-pack` |
| Define customer KPIs | `deal-outcome-scoping` |
| Measure delivered value | `deal-value-realization` |
| Check Unified dispatch readiness | `deal-unified-check` |
| Query a Power BI report | `powerbi-navigator` |
| Create a new PBI prompt | `dev-powerbi-prompt-builder` |
| Update my preferences / VIP list | `vault-settings` |
| Sync CRM data to vault | `vault-sync` |
| Create a Word document | `doc-word` |
| Work with PDFs | `doc-pdf` |
| Build a slide deck | `doc-slides` |
| Create a spreadsheet | `doc-spreadsheet` |
| Summarize win wires | `triage-win-digest` |
| Manage Outlook rules | `triage-outlook-rules` |
| Search meetings / channels / email | `m365-search` |
| Build a vault dashboard | `dashboard-obsidian` |
