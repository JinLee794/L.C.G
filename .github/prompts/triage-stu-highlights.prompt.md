---
agent: Chief of Staff
---
# STU Channel Highlights

Today is {{TODAY}}. Build an STU highlights summary from the last {{WINDOW_DAYS}} days.

## Steps
1. Read vault context first:
  - _lcg/preferences.md
  - _lcg/communication-style.md
  - _lcg/operating-rhythm.md
2. Pull Teams messages with STU context:
  - STU updates, STU recap, STU highlights, Friday Huddle, STU/CSU sync.
3. Pull related emails only if they add missing context.
4. Keep only high-signal items:
  - execution movement, blockers, milestone asks, leadership decisions.
5. Group output into operating buckets:
  - Highlights, Risks, Decisions, Asks, Owner Actions.
6. Persist output via OIL to Weekly/{{TODAY}}-stu-highlights.md:
  - Call `oil:get_note_metadata` for that path.
  - If the note exists: use `oil:atomic_replace` with `mtime_ms` as `expected_mtime`.
  - If the note does not exist: use `oil:create_note`.
  - Never use `create_file`.

## Guardrails
- No Teams posting from this workflow.
- No mail sending.
- If source quality is mixed, state confidence and gaps explicitly.

## Output Format

# STU Highlights - {{TODAY}}

## Headline
- [Most important STU signal this week]

## Highlights
- [w] [What changed] impact=[High|Medium|Low] owner=[name] evidence=[ref]

## Risks and Blockers
- [!] [risk] owner=[name] due_signal=[date/signal] unblock=[next step]

## Decisions and Asks
- [k] [decision/ask] owner=[name] needed_by=[date/signal]

## Owner Action Queue
- [ ] [Owner] action=[specific next step] by=[date/signal]

## Channel Coverage
- Friday Huddle: COVERED|MISSING
- STU/CSU Recurring Sync: COVERED|MISSING
- STU Backchannel Threads: COVERED|MISSING

## Confidence and Gaps
- Confidence: High|Medium|Low
- Missing data:
  - [gap]
