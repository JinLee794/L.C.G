---
name: dev-powerbi-prompt-builder
description: 'Interactive Power BI prompt builder: discovers semantic models, explores schema, drafts DAX queries from natural-language questions, validates them live, and outputs a ready-to-use multi-file Power BI skill folder. Triggers: build PBI prompt, create Power BI report prompt, scaffold PBI workflow, map Power BI report, generate PBI prompt, new PBI query, Power BI prompt template, what data can I pull.'
argument-hint: 'Describe the questions you want to answer, or provide a semantic model name/ID to explore'
---

## Purpose

Guides users through building a reusable **multi-file Power BI skill** (`powerbi-<name>/`) by interactively discovering what data is available, drafting DAX queries for their questions, validating them against live data, and assembling the result into a skill folder that follows the proven `powerbi-billed-pipeline-hygiene` structure.

## When to Use

- User wants to create a new PBI-backed workflow (incentive tracking, gap analysis, pipeline scoring, consumption review)
- User knows the questions but not the DAX or schema
- User wants to map an existing Power BI report into a repeatable agent skill
- Manager wants to customize a PBI skill for their team

## Freedom Level

**High** — Discovery and question refinement require judgment. DAX generation uses `powerbi-remote:GenerateQuery`. Output structure is **Low freedom** (must follow multi-file template exactly).

## Runtime Contract

- **Tools**: `powerbi-remote:DiscoverArtifacts`, `powerbi-remote:GetSemanticModelSchema`, `powerbi-remote:GetReportMetadata`, `powerbi-remote:GenerateQuery`, `powerbi-remote:ExecuteQuery`
- **Auth convention**: Follow `powerbi-mcp.instructions.md` § Auth Pre-Check Pattern
- **Output convention**: Multi-file skill folder in `.github/skills/powerbi-<name>/`

## Output Structure — Multi-File Skill Folder

Every generated skill MUST produce a folder at `.github/skills/powerbi-<name>/` with these files:

```
.github/skills/powerbi-<name>/
├── SKILL.md              # Main flow — orchestrator that references sub-files on-demand
├── schema-mapping.md     # Table/column mapping, relationship model, DAX filter patterns
├── query-rules.md        # All DAX queries — parameterized, with scoped/unscoped variants
├── output-template.md    # Vault persistence format (frontmatter schema + body template)
└── draft-patterns.md     # (optional) Outlook follow-up email templates, if applicable
```

This matches the structure of `powerbi-billed-pipeline-hygiene/`, which is the reference implementation.

### File Responsibilities

| File | Purpose | Load Timing |
|---|---|---|
| **SKILL.md** | Flow orchestrator. Contains Purpose, When to Use, Freedom Level, Runtime Contract, Configuration, Flow steps, Decision Logic, Output Schema, Guardrails. References sub-files by relative link — does NOT inline their content. | Always loaded first |
| **schema-mapping.md** | Complete table/column inventory from `GetSemanticModelSchema`. Includes data types, relationship model (with FK columns), known filter values, scope filter patterns (CALCULATETABLE vs SUMMARIZECOLUMNS guidance), CROSSFILTER rules if bridge tables exist. | On-demand (Step 1) |
| **query-rules.md** | All DAX queries used by the skill. Each query has: description, parameters, scoped & unscoped variants, sort/limit, skip-logic conditions. Aggregate queries listed first, then detail queries. | On-demand (Step 3+) |
| **output-template.md** | Vault note path pattern, frontmatter schema (every field typed and ruled), body template with exact heading names and section order, revenue/value formatting rules. Freedom Level: Low. | On-demand (final step) |
| **draft-patterns.md** | *(Optional)* Outlook draft templates with subject patterns, body HTML, owner resolution sequence, CRM deep-link rules, signature format. Only created when the workflow includes follow-up emails. | On-demand (draft step) |

### SKILL.md Load-Order Banner

Every generated `SKILL.md` MUST include this banner after the Purpose section:

```markdown
> **⚠️ Load Order:** Read **SKILL.md first** for the full flow. Sub-files are loaded on-demand:
> - [schema-mapping.md](schema-mapping.md) — table/column mapping, relationship model, DAX filter patterns
> - [query-rules.md](query-rules.md) — all DAX queries (aggregate + detail)
> - [output-template.md](output-template.md) — vault persistence format
> - [draft-patterns.md](draft-patterns.md) — Outlook follow-up email templates (if applicable)
```

## Flow

### Phase 1 — Intent Gathering

Ask the user (skip items they've already provided):

1. **What questions do you want to answer?** — Collect 1–5 natural-language questions. Examples:
   - "What is my gap to target for account X?"
   - "Which opportunities in my pipeline have the highest conversion likelihood?"
   - "Show me accounts trending below consumption threshold"
   - "How is my team tracking against incentive Y?"

2. **Which Power BI report or semantic model?** — Options:
   - User provides a dataset ID (GUID) → use directly
   - User provides a report/model name → call `powerbi-remote:DiscoverArtifacts` to resolve
   - User doesn't know → call `powerbi-remote:DiscoverArtifacts` with keywords from their questions, present matches

3. **Account scope** — Where do TPIDs/account identifiers come from?
   - A vault file (e.g., `.docs/AccountReference.md`)
   - CRM (`msx-crm:get_my_active_opportunities`)
   - User will provide inline
   - Not applicable (model-wide query)

4. **Business rules or reference docs** — Any program rules, incentive definitions, or threshold documents to embed? (Optional — stored in `.github/documents/`)

5. **Follow-up drafts** — Will this workflow ever produce Outlook follow-up emails? If yes → `draft-patterns.md` will be generated.

### Phase 2 — Schema Discovery

1. **Auth pre-check** — per `powerbi-mcp.instructions.md`:
   ```dax
   EVALUATE TOPN(1, 'Dim_Calendar')
   ```
   If this fails → stop and show the auth recovery message. Do not proceed.

2. **Get schema** — call `powerbi-remote:GetSemanticModelSchema({ artifactId })`.

3. **Inspect report** (if user referenced a report) — call `powerbi-remote:GetReportMetadata({ reportObjectId })` to understand how the model is used in practice: which tables, filters, and measures the report author intended.

4. **Present a plain-language summary** of what's in the model:
   - Key tables and what they represent
   - Available measures (pre-built calculations)
   - Important filter dimensions (calendar, account, segment, etc.)
   - Any custom instructions or verified answers from the model author

5. **Map questions to schema** — for each user question, identify:
   - Which tables/columns are needed
   - Which measures apply
   - What filters are required
   - Flag any questions that can't be answered by this model

6. **Identify relationship model** — document:
   - Fact vs. dimension tables
   - FK columns and directionality (unidirectional vs. bidirectional)
   - Bridge tables that require CROSSFILTER
   - Any cross-filtering constraints (e.g., two dimensions on the same fact with no direct relationship)

Present the mapping and ask: *"Does this look right? Any questions to add, change, or drop?"*

### Phase 3 — DAX Generation & Validation

For each confirmed question:

1. **Generate DAX** — call `powerbi-remote:GenerateQuery` with:
   - `artifactId`: the semantic model ID
   - `userInput`: the user's natural-language question
   - `schemaSelection`: the table/column/measure mapping from Phase 2
   - `valueSearchTerms`: any specific account names, product names, etc.

2. **Test-run** — call `powerbi-remote:ExecuteQuery` with the generated DAX, limited to a small result set (`maxRows: 10`) to validate it returns data.

3. **Show results** — present the sample data to the user. Ask:
   - "Is this the data you expected?"
   - "Should we add/remove columns?"
   - "Any filters to adjust?"

4. **Iterate** — if the user wants changes, re-generate with updated `userInput` or `schemaSelection`. Use `chatHistory` parameter to carry prior DAX context forward.

5. **Parameterize** — replace hardcoded values (specific TPIDs, dates) with placeholders that the prompt workflow will fill dynamically:
   - TPID lists → `{"<TPID1>", "<TPID2>", ...}` (injected from account roster)
   - Dates → `RelativeFM` offsets or computed values
   - Thresholds → Configuration table variables

6. **Classify queries** — categorize each validated query as:
   - **Aggregate** — summary/count/overview queries (run first, gate detail queries)
   - **Detail** — row-level queries with sort/limit (run conditionally based on aggregate results)
   - **Scope resolution** — auth checks, label lookups, filter value discovery

7. **Build scoped variants** — if the model has bridge tables or cross-dimension filtering:
   - Create **unscoped** variant using `SUMMARIZECOLUMNS`
   - Create **scoped** variant using `CALCULATETABLE`/`CALCULATE` + `CROSSFILTER`
   - Document which variant to use when and why
   - Test both variants against live data

### Phase 4 — Skill Folder Assembly

Generate the multi-file skill folder at `.github/skills/powerbi-<name>/`.

#### 4.1 — schema-mapping.md

Persist the full schema discovered in Phase 2:

```markdown
# Schema Mapping — <Model Name>

Semantic model `<GUID>`. Schema fully resolved — skip `GetSemanticModelSchema` unless model ID changes or a query fails with an unknown column error.

---

## Tables & Key Columns

### <Table Name> (<fact|dimension>)

| Column | Type | Notes |
|---|---|---|
| `<column>` | <type> | <notes> |

## Relationship Model

<ASCII diagram showing fact→dimension relationships with FK columns and directionality>

**Key constraints:**
<bullet list of cross-filtering rules, RELATED limitations, bridge behavior>

## Scope Filter Patterns

### Known Filter Values
<table of discovered filter values from EVALUATE DISTINCT queries>

### Filter Mechanics
<CALCULATETABLE vs SUMMARIZECOLUMNS guidance, CROSSFILTER rules if applicable>

### CROSSFILTER Syntax Rules (if applicable)
<column pair, capitalization, VAR prohibition>
```

**Rules:**
- Include every table and column returned by `GetSemanticModelSchema`, grouped by fact/dimension
- Document columns that are expected but missing, with workarounds
- Test and document at least one scope filter pattern before writing

#### 4.2 — query-rules.md

Persist all validated DAX queries from Phase 3:

```markdown
# Query Rules — <Skill Name>

All queries inherit mandatory filters from [schema-mapping.md](schema-mapping.md).

---

## Scope Filtering in Queries

<Explain scoped vs unscoped variants and when each applies>

---

## Aggregate Query (run FIRST)

<Description, purpose, skip-logic gates>

### Unscoped
<DAX block>

### Scoped
<DAX block with CROSSFILTER>

---

## <N>. <Query Name>

<Description>

| Parameter | Value |
|---|---|
| Filter | <filter condition> |
| Sort | <sort column and direction> |
| Limit | Top <N> |

### Unscoped
<DAX block>

### Scoped
<DAX block with CROSSFILTER>
```

**Rules:**
- Every query that was test-run successfully in Phase 3 goes here
- Aggregate queries listed first, then detail queries
- Each query includes: description, parameters table, both scoped/unscoped variants (if applicable), skip-logic condition
- Use placeholder tokens for dynamic values (`<CQ-1>`, `<CQ>`, `<TPID>`, etc.)

#### 4.3 — output-template.md

Define the vault persistence format:

```markdown
# Output Template — <Skill Name>

> **Freedom Level: Low** — Use this template exactly.

## Vault Path

<path pattern with date tokens>

## Frontmatter Schema

<YAML block with every field typed and ruled>

### Field Rules

<table explaining each frontmatter field>

## Body Template

<full markdown template with exact heading names, tables, section order>

## Revenue/Value Formatting

<formatting rules for currency display>
```

**Rules:**
- Every frontmatter field must have a type and formatting rule
- Body template heading names are exact — do not improvise
- Include empty-section handling (e.g., "None detected" vs. omit)
- Include revenue/value formatting rules

#### 4.4 — draft-patterns.md (optional)

Only create if the user confirmed follow-up drafts in Phase 1.5:

```markdown
# Outlook Draft Patterns

## When to Create Drafts
<trigger condition>

## Draft Grouping
<grouping strategy>

## Content Rules
<table: contentType, body format, to resolution, subject pattern>

## Owner Resolution
<resolution sequence: vault → Graph → fallback>

## Subject Patterns
<severity → pattern table>

## Body Template (HTML)
<HTML template with inline styles>

## Sender Signature
<signature format>

## CRM Deep Links
<linking rules>
```

#### 4.5 — SKILL.md

The main orchestrator file. Structure:

```markdown
---
name: powerbi-<name>
description: '<one-line description>. Triggers: <trigger phrases>.'
argument-hint: '<scope/input hint>'
---

# <Title>

## Purpose

<what this skill does>

> **⚠️ Load Order:** Read **SKILL.md first** for the full flow. Sub-files are loaded on-demand:
> - [schema-mapping.md](schema-mapping.md) — table/column mapping, relationship model, DAX filter patterns
> - [query-rules.md](query-rules.md) — all DAX queries (aggregate + detail)
> - [output-template.md](output-template.md) — vault persistence format
> - [draft-patterns.md](draft-patterns.md) — Outlook follow-up email templates (if applicable)

## When to Use
<bullet list>

## Freedom Level
<Low|Medium|High with rationale>

## Runtime Contract
<tool table>

## Configuration
<settings table with Report ID, Semantic Model ID, scope defaults, vault path>

---

## Flow

### Step 0 — Scope Resolution (mandatory)
<scope resolution logic, referencing role.md and pbi-analyst agent protocol>

### Step 1 — Auth & Label Resolution
<auth pre-check, skip schema note since schema-mapping.md is authoritative>

### Step 2 — Construct Filter Set
<mandatory + scope filter layers, referencing schema-mapping.md for patterns>

### Step 3 — <Primary Query Step>
<aggregate/overview query, referencing query-rules.md>

### Step 3.5 — <Conditional Gate> (if applicable)
<aggregate counts that gate detail queries>

### Step 4 — <Detail Queries> (conditional)
<detail query table with skip-logic, referencing query-rules.md>

### Step 5 — <Analysis/Synthesis>
<severity tiers, risk summary, or insight generation>

### Step 6 — Output
<present to user per output-template.md>

### Step 7 — <Draft Step> (optional, user-requested)
<referencing draft-patterns.md>

### Step 8 — Vault Persistence
<Freedom Level: Low — use output-template.md exactly>

---

## Decision Logic
<condition → action table>

## Output Schema
<structured output fields>

## Guardrails
<safety rules: scope required, read-only, draft-only-on-request, row caps>
```

**Rules for SKILL.md:**
- SKILL.md is the **orchestrator** — it references sub-files, never inlines their content
- DAX queries appear ONLY in `query-rules.md`, not in SKILL.md (except the auth pre-check one-liner)
- Schema details appear ONLY in `schema-mapping.md`, not in SKILL.md
- Output template appears ONLY in `output-template.md`, not in SKILL.md
- SKILL.md says "see [file](file) § Section" to point the agent to the right sub-file at the right step
- The Flow section uses the same step-numbering pattern as `powerbi-billed-pipeline-hygiene`

### Phase 5 — Write & Confirm

1. **Create the skill folder** — `.github/skills/powerbi-<name>/`
2. **Write all files** — SKILL.md, schema-mapping.md, query-rules.md, output-template.md, and optionally draft-patterns.md
3. **Register in skill list** — Add a `<skill>` entry to the skills section of the agent's instructions if applicable
4. **Summary** — show what was created:
   - Folder path and file inventory
   - Trigger phrases to invoke the skill
   - Customization notes (Configuration table, scope defaults)
   - "To refine DAX queries, edit `query-rules.md`. To change output format, edit `output-template.md`."

## Decision Logic

| Situation | Action |
|---|---|
| Model has no relevant tables for a question | Drop the question; explain what the model *can* answer |
| `GenerateQuery` produces invalid DAX | Retry with broader `schemaSelection`; if still fails, hand-write DAX using schema |
| `ExecuteQuery` returns empty results | Check filters — may be scoping too narrowly. Show the user and ask for guidance |
| User wants cross-medium data (PBI + CRM) | Add CRM steps to the workflow; reference `shared-patterns.instructions.md` |
| User wants to use vault for account scoping | Add vault read step; reference `obsidian-vault.instructions.md` |
| Multiple semantic models needed | Create one skill folder per model, or a multi-step skill with separate query-rules per model |
| Model has bridge tables (fact connecting two dimensions) | Document CROSSFILTER requirement in schema-mapping.md; create scoped query variants in query-rules.md |
| No bridge table / direct relationships only | Scoped variants use SUMMARIZECOLUMNS with TREATAS; note this in schema-mapping.md |
| User does not need Outlook drafts | Omit draft-patterns.md entirely; remove draft step from SKILL.md flow |

## Output Schema

- `skill_folder_path`: path to the created skill folder
- `files_created`: list of files in the folder
- `questions_mapped`: list of questions → DAX query pairings (in query-rules.md)
- `questions_dropped`: any questions the model couldn't answer (with explanation)
- `trigger_phrases`: phrases that invoke the new skill
- `next_action`: "Skill created at `.github/skills/powerbi-<name>/`. Invoke with: `<trigger phrase>`. To refine queries, edit `query-rules.md`."
