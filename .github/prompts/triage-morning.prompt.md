---
agent: Chief of Staff
---
# Morning Triage

Today is {{TODAY}}. Run L.C.G's morning triage.

## Execution Model

You do NOT have mail or calendar tools. All M365 operations (mail, calendar, Teams, SharePoint) MUST be delegated to `@m365-actions` using a handoff. Do not attempt to call `mail:*` or `calendar:*` tools directly — they will fail. Instead, delegate each M365 step to `@m365-actions` with a clear objective and constraints.

## Steps
1. Read vault preference context first:
  - _lcg/role.md (determines persona, team model, primary entity, forecast targets)
  - _lcg/vip-list.md
  - _lcg/preferences.md
  - _lcg/operating-rhythm.md
  - _lcg/learning-log.md
2. Inbox scan (delegate to `@m365-actions`):
  - Delegate a mail search to `@m365-actions`: retrieve unread and recently active email from the last 24 hours. The sub-agent should use `mail:SearchMessages` with KQL `received:>=<yesterday-ISO> AND isread:false`.
  - Save the raw response to `/tmp/mail-raw-{{TODAY}}.json`.
  - Run the normalizer to classify, prioritize, and suppress noise:
    ```bash
    node scripts/helpers/normalize-mail.js /tmp/mail-raw-{{TODAY}}.json \
      --vip-list "$VAULT_DIR/_lcg/vip-list.md" \
      > /tmp/mail-normalized-{{TODAY}}.json
    ```
  - Use the normalized output (pre-classified as URGENT/HIGH/NORMAL/LOW with noise suppressed) to build the triage sections.
3. Calendar scan (delegate to `@m365-actions`):
  - Delegate a calendar pull to `@m365-actions`: retrieve today's meetings with attendees. The sub-agent should use `calendar:ListCalendarView` with today's start/end datetimes.
  - Save the raw response to `/tmp/cal-raw-{{TODAY}}.json`.
  - Run the normalize → score pipeline:
    ```bash
    cat /tmp/cal-raw-{{TODAY}}.json \
      | node scripts/helpers/normalize-calendar.js --tz America/Chicago --user-email jin.lee@microsoft.com \
      | node scripts/helpers/score-meetings.js --vip-list "$VAULT_DIR/_lcg/vip-list.md" \
      > /tmp/cal-scored-{{TODAY}}.json
    ```
  - Use the scored output (priority-ranked, conflicts grouped, externals flagged) to build MEETING PREP STATUS.
  - Mark each meeting's prep state as READY, PARTIAL, or MISSING based on scored priority and vault context.
  - Add one-line reason and next action for PARTIAL/MISSING.
4. CRM pulse — opportunity hygiene:
  - Read `_lcg/role.md` for team-model and forecast targets. Scope the CRM pull accordingly (self, territory, seller-list, or direct-reports).
  - Pull active opportunities (Stage 2–3) via `msx-crm:get_my_active_opportunities` (or scoped per role config).
  - Flag exceptions: stage staleness (no activity beyond governance threshold), close-date slippage (past or within 14 days with no active tasks), missing required fields (`msp_salesplay` null, `msp_monthlyuse` empty), pipeline coverage below target (if `quarterly-quota` and `coverage-target-multiple` are set in role config), and low qualification signals.
  - If forecast targets in `_lcg/role.md` are stale (last-refreshed > 7 days), note it in run metadata and skip coverage calculations.
  - Rank by proximity × severity. Surface only the top exceptions (max 5) to keep the brief scannable.
5. Build the Start Here brief with deterministic ordering:
  - URGENT
  - HIGH
  - MEETING PREP STATUS
  - PIPELINE ALERTS
  - ACTION QUEUE
  - FYI
6. Add run metadata for correction loops:
  - Include one line for each section count: URGENT/HIGH/MEETING PREP STATUS/PIPELINE ALERTS/ACTION QUEUE/FYI.
  - Include one line listing top 3 assumptions that could be wrong.
7. Persist output via OIL:
  - Target: Daily/{{TODAY}}.md
  - Call `oil:get_note_metadata` for that path.
  - If the note exists: use `oil:atomic_append` (with `mtime_ms` as `expected_mtime`, heading "Morning Triage") to replace the section content. If the section already exists, first use `oil:atomic_replace` with the full note content after updating the section in-memory.
  - If the note does not exist: use `oil:create_note` with the heading and brief body.
  - Never use `create_file` — the vault is outside this workspace.

## Guardrails
- Never send email or post to Teams.
- Never execute CRM writes from this workflow.
- If a source is unavailable, still produce the brief with clear degradation notes.

## Output Format
- Start with one status line in this exact shape:
  - ✅ Vault | ✅ CRM | ✅ Mail/Calendar — Ready
  - If any source failed, replace ✅ with ⚠️ and include a short reason.
- Format every item for rapid scanning — see Visual Formatting Policy in copilot-instructions.md.
- Bold the key scan-point on every primary bullet; push detail into sub-bullets.
- Sort MEETING PREP STATUS chronologically by meeting time.
- Sort ACTION QUEUE by deadline (earliest first).
- Use this exact template:

## Morning Triage

### URGENT
- [f] **[Sender/Topic]** — why urgent [Source](webLink)
	- ⏭️ **Next:** action description

### HIGH
- [!] **[Sender/Topic]** — why high [Source](webLink)
	- ⏭️ **Next:** action description

### MEETING PREP STATUS
- [x] **HH:MM AM** · [Meeting name](webLink) READY - summary
	- ✅ next action
- [/] **HH:MM AM** · [Meeting name](webLink) PARTIAL - gap summary
	- ⚠️ what's incomplete or at risk
	- ⏭️ **Next:** action by **deadline**
- [ ] **HH:MM AM** · [Meeting name](webLink) MISSING - what's needed
	- ❌ what's missing
	- ⏭️ **Next:** action by **deadline**

### PIPELINE ALERTS
- [*] **[Opportunity](recordUrl)** · Stage {n} · 📅 close **date** · {exception type}
	- 📉 risk description (e.g., stale stage, date drift, missing fields)
	- ⏭️ **Follow-up:** proposed action or field fix

### ACTION QUEUE
- [ ] 👤 **Owner** · action description · ⏰ **by when** [Source](webLink)
	- Draft needed: yes/no

### FYI
- [i] **[Thread/topic](webLink)** — summary

Note: Every mail, calendar, and Teams reference MUST include the `webLink` or `webUrl` returned by M365 tools. CRM items use the `recordUrl`. See M365 Source Linking Policy in copilot-instructions.md.

### RUN METADATA
- Section counts: URGENT={n}; HIGH={n}; MEETING PREP STATUS={n}; PIPELINE ALERTS={n}; ACTION QUEUE={n}; FYI={n}
- Assumptions to validate:
  - [assumption 1]
  - [assumption 2]
  - [assumption 3]
