---
agent: Chief of Staff
---
# Presentation Builder

Build a presentation package for:

- Purpose: {{purpose}}
- Audience: {{audience}}
- Format hint: {{format_hint}}
- Due date: {{due_date}}

## Steps

1. Gather and scope context using existing skills:

- Use `internal-vault-routing` to retrieve durable customer/topic context from the vault (CRM prefetch, customer roster, prior notes).
- Use `deal-evidence-pack` when meeting/email/chat evidence is needed for this deck.
- Use `internal-mail-scoping`, `internal-calendar-scoping`, `internal-teams-scoping`, and `internal-workiq-scoping` to keep retrieval bounded and relevant.

2. Resolve reporting inputs using existing skills (only when metrics are needed):

- Use `powerbi-navigator` to route to the correct existing PBI prompt.
- If no matching PBI prompt exists, use `dev-powerbi-prompt-builder` to scaffold one before continuing.

3. Build a deterministic slide blueprint:

- Target 6-12 slides unless format_hint says otherwise.
- One headline takeaway per slide.
- Supporting bullets only, no paragraph walls.
- Include evidence/source notes for each slide.

4. Generate artifacts using existing presentation skill:

- Use `doc-slides` to create the PPTX.
- Persist slide plan markdown via OIL to Weekly/{{due_date}}-{{purpose_slug}}-deck-plan.md:
  - Call `oil:get_note_metadata` for that path.
  - If the note exists: use `oil:atomic_replace` with `mtime_ms` as `expected_mtime`.
  - If the note does not exist: use `oil:create_note`.
- Write PPTX to `.copilot/docs/{{due_date}}-{{purpose_slug}}.pptx` via `create_file` (binary artifacts stay in the workspace).

5. If PPTX generation is blocked:

- Still write the full slide plan.
- Emit explicit blocker notes and the exact missing skill/dependency.

## Guardrails

- Never fabricate metrics or dates.
- Every numerical claim must include a source note.
- Never post or send deck content automatically.
- Prefer existing skills over direct ad-hoc tool chains.

## Output Format

Use this exact shape:

# Presentation Plan:

## Deck Metadata

- Audience: {{audience}}
- Format: {{format_hint}}
- Due: {{due_date}}
- Slide Count Target: [n]

## Slide Blueprint

- Slide 1: [title] - [single takeaway]
- Slide 2: [title] - [single takeaway]
- Slide N: [title] - [single takeaway]

## Slide Content

### Slide 1 - [title]

- Takeaway: [one sentence]
- Bullets:
  - [bullet]
  - [bullet]
  - [bullet]
- Source notes: [vault|crm|mail references]

### Slide N - [title]

- Repeat structure

## Generation Result

- Deck plan path: Weekly/{{due_date}}-{{purpose_slug}}-deck-plan.md
- PPTX path: Weekly/{{due_date}}-{{purpose_slug}}.pptx
- Status: GENERATED|PLAN_ONLY_BLOCKED
- Blockers (if any):
  - [blocker]
- Skills used:
- [skill name]
