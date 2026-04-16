---
agent: Chief of Staff
---
# Send Update Requests

Customer: {{customer}}
Run Date: {{run_date}}
Customer Slug: {{customer_file_slug}}

## Steps

1. Read vault context first:
   - _lcg/communication-style.md
   - _lcg/preferences.md
2. Load customer opportunitys from CRM.
3. Identify opportunitys that are past due, due in 7 days, or missing recent updates.
4. Draft one concise update request per opportunity owner, addressed to said owner.
5. Include opportunity name, due date, current risk, and exact ask.
6. Stage drafts only and list each draft for review.
7. Persist output via OIL:
   - Target: Daily/{{run_date}}-update-requests-{{customer_file_slug}}.md
   - Call `oil:get_note_metadata` for that path.
   - If the note exists: use `oil:atomic_replace` with `mtime_ms` as `expected_mtime`.
   - If the note does not exist: use `oil:create_note`.
   - Never use `create_file`.

## Guardrails

- Draft only. Never send.
- No CRM writes in this workflow.
- If opportunity owner is unknown, use "UNKNOWN - needs follow-up".

## Output Format

Use this exact structure:

# Update Request Drafts

## Run Metadata

- Date: {{run_date}}
- Customer Slug: {{customer_file_slug}}
- Draft Count: {n}
- Quality Bar: L.C.G edits <=2 sentences per draft

## Draft Queue

- [D] [Owner Name] - priority URGENT|HIGH - reason

## Draft 1

- To:
- Subject: [opportunity] Update Request - [Due Date]
- Body:
  Hi [Owner Name],

  [opportunity Name] is due on [Due Date]. Could you please send a status update by [Requested Date/Time] that includes:

  - Current status (on track / at risk / blocked)
  - Any blockers and owner
  - Revised date if at risk
  - Update notes with the most up-to-date context

  Thank you,
  L.C.G

## Draft N

- Repeat for each owner.

## Review Notes

- Any uncertainties or missing data to verify before sending.
