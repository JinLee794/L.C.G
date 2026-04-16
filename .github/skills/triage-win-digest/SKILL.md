---
name: triage-win-digest
description: 'Build reusable executive summaries from Win Room / Winning Wednesdays, Win Wire, Patty D deal recaps, and STU/HLS channel updates using bounded retrieval and evidence-backed formatting. Triggers: winning wednesdays summary, patty d deal summary, win wire digest, STU highlights, HLS channel recap, weekly wins summary.'
argument-hint: 'Provide time window, target streams (Winning Wednesdays, Patty D, Win Wire, STU/HLS), and preferred output (email draft, markdown brief, or table).'
---

# Executive Win Digest

Create a concise, leadership-ready summary from mixed mail and Teams signals while preserving evidence and confidence.

## Use When

- User asks for Winning Wednesdays summary or Win Room recap
- User asks for Patty D deal summaries or similar variants
- User asks for Win Wire digest
- User asks for STU/HLS highlights with action-oriented output

## Source Rules

1. Vault-first context:
   - Read `_lcg/preferences.md`, `_lcg/communication-style.md`, and `_lcg/operating-rhythm.md`.
2. Bounded retrieval:
   - Default to last 7 days unless user specifies otherwise.
   - Expand to 30/120 days only when asked or when sparse.
3. Multi-source correlation:
   - Mail for recap narratives and deal-level announcements.
   - Teams for operating signals, blockers, asks, and execution status.
   - CRM is read-only validation when needed.

## Query Variants To Include

- Winning Wednesdays: "Winning Wednesdays", "Win Room", "WW recap", "Winning Weds"
- Patty D: "Patty D", "Patty Dilger", "Patty Dilger-Vivian", "Patty Carrolo"
- Deal summary variants: "deal summary", "deal overview", "commercial summary", "MACC summary"
- Win wire variants: "Win Wire", "WinWire", "HLS Win Wire", "wins wire"
- STU variants: "STU highlights", "STU recap", "STU update", "Friday Huddle", "STU/CSU sync"

## Canonical Output Shape

Always produce this deterministic structure:

1. `Headline`
2. `Executive Highlights`
3. `Scoreboard/Table` (customer, motion, metric, impact, owner, source)
4. `Risks and Escalations`
5. `Decisions and Asks`
6. `Owner Action Queue`
7. `Confidence and Gaps`
8. `Evidence Links`

## Visual Structure Guidance

- Prefer compact markdown tables for dense metrics.
- Use one-line bullets with explicit owner and next action.
- Include confidence tags (`High|Medium|Low`) and missing-data notes.
- Keep to one headline and one takeaway per section.

## Quality Guardrails

- No sends/posts; drafts only.
- No CRM writes.
- Mark inferred fields clearly.
- De-duplicate repeated cross-posts.

## Fallback Behavior

If one stream is sparse:

- Continue with available streams and publish a partial digest.
- Explicitly list missing channels and confidence reduction.
