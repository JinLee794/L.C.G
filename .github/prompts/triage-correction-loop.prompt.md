---
agent: Chief of Staff
---
# Triage Correction Loop

Today is {{TODAY}}. Run the morning triage correction loop.

## Inputs
- Daily/{{TODAY}}.md
- _lcg/learning-log.md
- _lcg/preferences.md
- _lcg/vip-list.md

## Steps
1. Read today's morning triage brief.
2. Review explicit correction notes from L.C.G (if present in daily note annotations).
3. Extract corrections in this shape:
  - Original classification/assumption
  - Corrected classification/assumption
  - Why correction is needed
4. Append each correction to _lcg/learning-log.md via OIL:
  - Call `oil:get_note_metadata` for _lcg/learning-log.md to get `mtime_ms`.
  - Use `oil:atomic_append` with today's date as the heading and the correction entries as content, passing `mtime_ms` as `expected_mtime`.
  - Never use `create_file`.
5. Propose pattern promotions when the same correction repeats 3+ times:
  - VIP list promotion candidates
  - Instruction update candidates
6. Produce a concise review summary.

## Guardrails
- Never mutate instruction files automatically.
- Never send mail or post to Teams.
- Only append to _lcg/learning-log.md (no destructive edits).

## Output Format

# Triage Correction Review - {{TODAY}}

## Appended To Learning Log
- [entry summary]

## Promotion Candidates
- [candidate] target file - reason

## Needs Human Decision
- [decision] option A / option B

## Next Run Adjustments
- [expected change in classification behavior]
