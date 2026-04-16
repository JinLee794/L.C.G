---
agent: Chief of Staff
---
# Winning Wednesdays Channel Summary

Today is {{TODAY}}. Build the weekly channel summary for high-signal wins and risks.

## Steps
1. Read vault context first:
  - _lcg/preferences.md
  - _lcg/communication-style.md
  - _lcg/operating-rhythm.md
  - Prior summary note for continuity (if available)
2. Pull channel data from the last 7 days for target channels:
  - Winning Wednesdays
  - Patty D Deal Summaries
  - STU team channels
  - Win wire / HLS channels (when accessible)
3. Extract only high-signal items:
  - Customer wins
  - Material deal movement
  - Risks/escalations needing leadership attention
  - Notable asks/decisions
4. De-duplicate cross-posts and consolidate repeated updates into one canonical bullet.
5. Rank by impact and urgency.
6. Enrich with mail evidence for missing context:
  - Search matching recap emails and win-wire emails from the same period.
  - Prefer subject lines that include recap language, deal size, and customer outcome.
7. Where available, cross-check CRM read-only signals:
  - Opportunity/milestone movement tied to the same customer or deal.
  - Never perform CRM writes.
8. Persist output via OIL to Weekly/{{TODAY}}-winning-wednesdays.md:
  - Call `oil:get_note_metadata` for that path.
  - If the note exists: use `oil:atomic_replace` with `mtime_ms` as `expected_mtime`.
  - If the note does not exist: use `oil:create_note`.
  - Never use `create_file`.

## Guardrails
- Never post back into Teams from this workflow.
- Do not include private/sensitive details that are not needed for summary.
- If Teams data is unavailable, still produce a partial summary with explicit gaps.

## Output Format
Use this exact shape:

# Winning Wednesdays Summary - {{TODAY}}

## Headline
- [Single-line headline with the most important portfolio signal]

## Executive Highlights
- [Top highlight with metric and owner]
- [Top highlight with metric and owner]

## Wins Scoreboard
| Customer | Motion | Metric | Why It Matters | Owner | Source |
|---|---|---:|---|---|---|
| [name] | [AI|Data|Infra|Copilot|Security] | [$ / seats / %] | [impact line] | [name] | [mail/teams ref] |

## Wins (Ranked)
- [Customer/Deal] impact=[High|Medium|Low] owner=[name] evidence=[channel/message ref]

## Risks and Escalations
- [Risk] owner=[name] due=[date or signal] action=[next step]

## Decisions and Asks
- [Decision/Ask] owner=[name] needed_by=[date or signal]

## Action Queue
- [Owner] action=[next step] by=[date/signal] draft_needed=[yes|no]

## Channel Coverage
- Winning Wednesdays: COVERED|MISSING
- Patty D Deal Summaries: COVERED|MISSING
- STU channels: COVERED|MISSING
- Win wire / HLS: COVERED|MISSING

## Confidence and Gaps
- Confidence: High|Medium|Low
- Missing data:
  - [gap]

## Evidence Links
- [mail subject or teams thread title] -> [url]
- [mail subject or teams thread title] -> [url]
