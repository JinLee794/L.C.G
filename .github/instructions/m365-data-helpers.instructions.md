---
applyTo: "**"
---
# M365 Data Helper Scripts

## Purpose

Reusable Node.js CLI tools in `scripts/helpers/` that normalize, score, and format raw MCP tool responses. **Use these instead of generating inline parsing code.**

## When to Use

Whenever a workflow receives raw JSON from `calendar:ListCalendarView`, `mail:SearchMessages`, or needs to construct a `workiq:ask_work_iq` query, pipe the data through the appropriate helper script rather than writing one-off parsing logic.

## Available Helpers

### normalize-calendar.js

Normalizes raw `calendar:ListCalendarView` JSON into compact event data.

- Resolves attendee response codes (2=accepted, 3=tentative, 4=declined)
- Identifies external (customer-facing) attendees by domain
- Converts UTC times to local times
- Flags declined/cancelled events

```bash
node scripts/helpers/normalize-calendar.js /tmp/cal-raw.json \
  --tz America/Chicago \
  --user-email jin.lee@microsoft.com
```

### score-meetings.js

Scores normalized calendar events and detects time conflicts.

- Applies deterministic priority scoring (+50 customer-facing, +25 VIP, +10 owner, -40 declined, -15 low-signal recurring)
- Groups overlapping events into conflict clusters
- Ranks conflicts by score with tie-breaking

```bash
node scripts/helpers/score-meetings.js /tmp/cal-normalized.json \
  --vip-list "$VAULT_DIR/_lcg/vip-list.md"
```

### normalize-mail.js

Normalizes raw `mail:SearchMessages` JSON into compact mail items.

- Extracts sender, subject, received date, snippet, webLink
- Classifies priority (URGENT/HIGH/NORMAL/LOW) using VIP list and importance signals
- Suppresses automated noise (noreply, notifications)

```bash
node scripts/helpers/normalize-mail.js /tmp/mail-raw.json \
  --vip-list "$VAULT_DIR/_lcg/vip-list.md"
```

### build-workiq-query.js

Builds properly scoped WorkIQ prompts from structured inputs. Prevents malformed queries by enforcing time bounds and entity constraints.

```bash
node scripts/helpers/build-workiq-query.js \
  --goal "action items from PriorAuth sync" \
  --sources meetings,chats \
  --entities "Adam Ziesmer,Blue KC" \
  --time-window 7d \
  --topic "PriorAuth" \
  --output-shape actions
```

## Standard Pipeline for Morning Triage

1. **Calendar**: Delegate to `@m365-actions` → save raw JSON to `/tmp/cal-raw-<date>.json` → normalize → score
2. **Mail**: Delegate to `@m365-actions` → save raw JSON to `/tmp/mail-raw-<date>.json` → normalize
3. **Assemble**: Use scored calendar + normalized mail + CRM data to build the triage note

```bash
# Full calendar pipeline
cat /tmp/cal-raw-2026-03-26.json \
  | node scripts/helpers/normalize-calendar.js --tz America/Chicago --user-email jin.lee@microsoft.com \
  | node scripts/helpers/score-meetings.js --vip-list "$VAULT_DIR/_lcg/vip-list.md" \
  > /tmp/cal-scored-2026-03-26.json

# Mail pipeline
node scripts/helpers/normalize-mail.js /tmp/mail-raw-2026-03-26.json \
  --vip-list "$VAULT_DIR/_lcg/vip-list.md" \
  > /tmp/mail-normalized-2026-03-26.json
```

## Rules

- **Always use these scripts** for M365 data processing — do not write inline parsing code.
- All scripts accept stdin or a file path argument.
- All scripts output JSON to stdout.
- Scripts are composable via Unix pipes.
- Date temp files use pattern `/tmp/<type>-<date>.json`.
