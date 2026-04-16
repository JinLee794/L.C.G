---
agent: Chief of Staff
---
# Learning Review & Promotion

Today is {{TODAY}}. Run the weekly learning review.

## Purpose
Scan _lcg/learning-log.md for recurring correction patterns and propose promotions into permanent vault rules. This closes the loop between daily corrections and durable system improvement.

## Inputs
- _lcg/learning-log.md
- _lcg/vip-list.md
- _lcg/preferences.md
- _lcg/operating-rhythm.md
- _lcg/communication-style.md

## Steps
1. Read _lcg/learning-log.md in full.
2. Group corrections by topic (person, sender, classification pattern, suppression, or process).
3. For each group with 3 or more entries:
   a. Identify the target vault file for promotion:
      - Person/sender priority changes → _lcg/vip-list.md
      - Classification or suppression rules → _lcg/preferences.md
      - Cadence or timing adjustments → _lcg/operating-rhythm.md
      - Tone or drafting feedback → _lcg/communication-style.md
   b. Read the current target file content.
   c. Draft the exact text to add or change in the target file.
   d. Include a before/after diff for each proposed change.
4. For groups with fewer than 3 entries, list them as "watching" — accumulating but not yet ready.
5. Identify any learning-log entries older than 30 days that were never promoted — flag as stale.
6. Persist the review artifact via OIL:
  - Target: Daily/{{TODAY}}-learning-review.md
  - Call `oil:get_note_metadata` for that path.
  - If the note exists: use `oil:atomic_replace` with `mtime_ms` as `expected_mtime`.
  - If the note does not exist: use `oil:create_note`.
  - Never use `create_file`.

## Guardrails
- NEVER modify instruction files (.instructions.md) automatically.
- NEVER modify vault preference files automatically — only propose changes.
- Never send email or post to Teams.
- Never execute CRM writes.
- Only create/write the review artifact file.

## Output Format
Write to Daily/{{TODAY}}-learning-review.md using this exact structure:

## Learning Review

### PROMOTION CANDIDATES
For each candidate:
- **Pattern:** [description of the recurring correction]
- **Evidence:** [count] entries from [date range]
  - [entry 1 summary]
  - [entry 2 summary]
  - [entry 3+ summary]
- **Target file:** _lcg/[filename].md
- **Proposed change:**
  ```
  [exact text to add or replace in the target file]
  ```
- **Status:** PENDING APPROVAL

### WATCHING
- [topic] — [count] entries — needs [n] more before promotion

### STALE ENTRIES
- [date]: [entry summary] — no pattern match, older than 30 days

### REVIEW METADATA
- Total learning-log entries: {n}
- Promotion candidates: {n}
- Watching patterns: {n}
- Stale entries: {n}
- Review date: {{TODAY}}
