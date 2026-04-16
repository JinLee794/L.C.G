---
agent: Chief of Staff
---
# Meeting Follow-Up

Capture action items and stage follow-through after {{meeting_name}} on {{meeting_date}}.

## Inputs

- meeting_name: {{meeting_name}}
- meeting_date: {{meeting_date}}
- customer_or_topic: {{customer}}
- meeting_file_slug: {{meeting_file_slug}}

## Steps

1. Read vault context first:

- _lcg/preferences.md
- _lcg/communication-style.md
- Prior note: Meetings/{{meeting_date}}-{{meeting_file_slug}}.md (if it exists)

2. Pull post-meeting context:

- Meeting invite details and attendee list.
- Relevant emails from the last 48 hours tied to the meeting topic.
- CRM opportunities and milestones linked to {{customer}} (or best-match topic).

3. Extract action items with deterministic fields:

- Action
- Owner
- Due signal (date or "not specified")
- Evidence source (mail, meeting note, CRM)

4. Tag each action item:

- CRM_TASK_CANDIDATE when it should become a CRM task.
- EMAIL_FOLLOWUP_NEEDED when owner confirmation is needed.

5. Stage follow-through only (do not execute):

- Build a staged CRM task queue for review.
- Draft owner follow-up emails for unresolved items.

6. Persist follow-up record via OIL:

- Target: Meetings/{{meeting_date}}-{{meeting_file_slug}}-followup.md
- Call `oil:get_note_metadata` for that path.
- If the note exists: use `oil:atomic_replace` with `mtime_ms` as `expected_mtime`.
- If the note does not exist: use `oil:create_note`.
- Never use `create_file`.

## Guardrails

- Never send messages.
- Never execute CRM writes.
- If a source is unavailable, continue and record degraded confidence.

## Output Format

Use this exact shape:

# Meeting Follow-Up:

## Run Metadata

- Date: {{meeting_date}}
- Meeting Slug: {{meeting_file_slug}}
- Quality Bar: Action owner and due signal captured for every item

## Meeting

- Title: {{meeting_name}}
- Date: {{meeting_date}}
- Customer/Topic: {{customer}}
- Confidence: High|Medium|Low

## Action Items

- [ ] **[Action]** · 👤 **owner** · 📅 **due** · source: mail|meeting|crm
  - Tags: `CRM_TASK_CANDIDATE` | `EMAIL_FOLLOWUP_NEEDED` | `NONE`

## Staged CRM Task Queue

- [<] **[Action]** · 👤 **owner** · 📅 **due** · `STAGED`
  - 💡 reason: why it belongs in CRM

## Draft Follow-Up Queue

- [D] 👤 **[Owner Name]** · subject: **[topic]**
  - 💡 reason: missing update | risk | decision needed

## Risks and Blockers

- [!] **[blocker]**
  - 💡 context or mitigation

## Open Questions

- [?] **[question]**
  - needed from: [person/team]

## Evidence Trace

- 📧 mail: [thread subject](webLink)
- 📅 calendar: [event title](webLink)
- 💬 teams: [chat/channel name](webUrl)
- 📊 crm: [milestone/opportunity](recordUrl)
- 📝 vault: [note references]

Note: Every M365 and CRM reference in this note MUST be hyperlinked using the `webLink`, `webUrl`, or `recordUrl` returned by the respective tools. See M365 Source Linking Policy.
