---
agent: Chief of Staff
---
# Win Wire Digest

Today is {{TODAY}}. Build an executive-ready Win Wire digest from the last {{WINDOW_DAYS}} days.

## Steps
1. Read vault context first:
  - _lcg/preferences.md
  - _lcg/communication-style.md
2. Pull mail threads with Win Wire naming variants:
  - "Win Wire", "WinWire", "WIN WIRE", "HLS Win Wire"
3. Pull matching Teams references for the same window:
  - Win wire references in channels/chats tied to execution, risk, or follow-up asks.
4. Remove newsletters and non-deal noise.
5. Normalize each candidate into: customer, metric, motion, why won, owner, and explicit next ask.
6. Rank by strategic impact:
  - deal size / enterprise footprint / competitive displacement / reusable story value.
7. Persist output via OIL to Weekly/{{TODAY}}-win-wire-digest.md:
  - Call `oil:get_note_metadata` for that path.
  - If the note exists: use `oil:atomic_replace` with `mtime_ms` as `expected_mtime`.
  - If the note does not exist: use `oil:create_note`.
  - Never use `create_file`.

## Guardrails
- No mail sends, no Teams posts.
- CRM read-only cross-check allowed; no writes.
- Mark inferred values as inferred.

## Output Format

# Win Wire Digest - {{TODAY}}

## Headline
- [Portfolio-level one-line takeaway]

## Top Wins Table
| Customer | Value | Motion | Compete | Why We Won | Executive Signal | Source |
|---|---:|---|---|---|---|---|
| [name] | [$] | [Copilot|Azure|Data|Security] | [AWS|Google|Other|None] | [1 line] | [quote or endorsement] | [Source](webLink) |

## Pattern Readout
- [Pattern 1: what repeats across wins]
- [Pattern 2: what changed this cycle]

## Risks / Fragility
- [!] [risk] owner=[name] mitigation=[next step]

## Reusable Story Blocks
- [w] [Customer] -> problem / move / outcome / proof point

## Action Queue
- [ ] [Owner] [ask] by [date/signal]

## Confidence and Gaps
- Confidence: High|Medium|Low
- Gaps:
  - [missing context]
