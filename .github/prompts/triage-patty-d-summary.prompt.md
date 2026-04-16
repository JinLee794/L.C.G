---
agent: Chief of Staff
---
# Patty D Deal Summary Draft

Today is {{TODAY}}. Build a deal-summary draft package in Patty D style from the last {{WINDOW_DAYS}} days.

## Steps

1. Read vault context first:

- _lcg/preferences.md
- _lcg/communication-style.md

2. Pull source candidates from mail and Teams using name and alias variants:

- pattycarrolo
- Patty Carrolo
- Patty D

3. Include naming variants for artifacts:

- deal summary, deal overview, commercial summary, MACC summary, win wire.

4. Keep only items with concrete commercial movement:

- value changes, close movement, milestone shifts, escalation asks.

5. Build one concise summary card per deal.
6. Persist output via OIL to Weekly/{{TODAY}}-patty-d-deal-summary.md:

- Call `oil:get_note_metadata` for that path.
- If the note exists: use `oil:atomic_replace` with `mtime_ms` as `expected_mtime`.
- If the note does not exist: use `oil:create_note`.
- Never use `create_file`.

## Guardrails

- Draft only. Never send.
- No CRM writes.
- If direct Patty D phrasing is missing, produce best-match output and label it as inferred-source pattern.

## Output Format

# Patty D Deal Summary -

## Headline

- [Most important portfolio movement]

## Deal Cards

### [Customer / Deal]

- Value: [amount or range]
- Motion: [renewal|expansion|new|risk]
- Stage Change: [what changed]
- Why It Matters: [1 line]
- Risk Level: [High|Medium|Low]
- Owner: [name]
- Ask: [specific decision or support needed]
- Evidence: [mail/teams ref]

## Escalations

- [deal] escalation=[what] owner=[name] needed_by=[date/signal]

## Suggested Draft Subject Lines

- [Subject 1]
- [Subject 2]

## Confidence and Gaps

- Confidence: High|Medium|Low
- Missing data:
  - [gap]
