---
agent: Chief of Staff
---
# Weekly Rhythm of Business

Today is {{TODAY}}. Produce the weekly ROB brief.

## Steps
1. Read vault context first:
	- _lcg/operating-rhythm.md
	- _lcg/preferences.md
	- _lcg/learning-log.md
2. Review this week's calendar outcomes and next week's risks.
3. Pull active opportunities — flag stage changes, close-date shifts, and forecast movement this week.
4. Summarize key CRM pipeline changes (new opportunities, stage advancement, slippage, wins, losses).
5. Run vault health scan for stale or missing customer/meeting context.
6. Cross-check operating rhythm for upcoming cadence requirements.
7. Build a deterministic weekly brief.
8. Persist via OIL to Weekly/{{TODAY}}-rob.md:
	- Call `oil:get_note_metadata` for that path.
	- If the note exists: use `oil:atomic_replace` with `mtime_ms` as `expected_mtime`.
	- If the note does not exist: use `oil:create_note`.
	- Never use `create_file`.

## Guardrails
- Never send mail or post to Teams.
- Never perform CRM writes.

## Output Format

# Weekly ROB - {{TODAY}}

## Outcomes This Week
- [w] [outcome]

## Upcoming Deadlines and Risks
- [*] [Opportunity/Item] owner - close date - risk - next action

## Pipeline Changes
- [i] [change]

## Operating Rhythm Checks
- [x] [Cadence] READY - note
- [!] [Cadence] AT RISK - note

## Action Queue by Owner
- [ ] [Owner] action - due signal - draft needed yes/no

## Open Questions
- [?] [question]

## Data Confidence
- High/Medium/Low - explain missing sources if any.
