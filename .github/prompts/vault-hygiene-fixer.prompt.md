---
agent: Chief of Staff
---
# Hygiene Fixer

Today is {{TODAY}}.

Repair the **{{artifact_type}}** artifact so it is structurally valid and deterministic.

---

## Universal Rules

1. Read the existing artifact file.
2. Preserve all factual content; discard only malformed structure.
3. Rewrite to match the **exact** template for the selected artifact type (below).
4. If a section has no items, include one bullet: `- None.`
5. If evidence is missing, write `UNKNOWN - needs follow-up` — never invent facts.
6. Persist via OIL:
   - Call `oil:get_note_metadata` for the target path to get `mtime_ms`.
   - If the note exists → `oil:atomic_replace` with `mtime_ms` as `expected_mtime`.
   - If it does not exist → `oil:create_note`.
   - **Never use `create_file`.**

## Guardrails

- Never send email or post to Teams.
- Never execute CRM writes.
- Never modify vault preference files, instruction files, or sections outside the repair target.
- Bold key scan-points on every primary bullet; push detail into sub-bullets.
- Follow Visual Formatting Policy in copilot-instructions.md.

---

## Artifact Templates

Select the matching template based on `{{artifact_type}}`.

---

### morning-triage

**Target file:** Daily/{{TODAY}}.md (rewrite only the `## Morning Triage` section)

**Extra inputs:** _lcg/vip-list.md · _lcg/preferences.md · _lcg/operating-rhythm.md

**Sort rules:** MEETING PREP STATUS → chronological by meeting time. ACTION QUEUE → earliest deadline first.

**Template:**

```markdown
## Morning Triage

### URGENT
- [f] **[Sender/Topic]** — why urgent
	- ⏭️ **Next:** action description

### HIGH
- [!] **[Sender/Topic]** — why high
	- ⏭️ **Next:** action description

### MEETING PREP STATUS
- [x] **HH:MM AM** · [Meeting name] READY - summary
	- ✅ next action
- [/] **HH:MM AM** · [Meeting name] PARTIAL - gap summary
	- ⚠️ what's incomplete or at risk
	- ⏭️ **Next:** action by **deadline**
- [ ] **HH:MM AM** · [Meeting name] MISSING - what's needed
	- ❌ what's missing
	- ⏭️ **Next:** action by **deadline**

### PIPELINE ALERTS
- [*] **[Opportunity](recordUrl)** · Stage {n} · 📅 close **date** · {exception type}
	- 📉 risk description
	- ⏭️ **Follow-up:** proposed action

### ACTION QUEUE
- [ ] 👤 **Owner** · action description · ⏰ **by when**
	- Draft needed: yes/no

### FYI
- [i] **[Thread/topic]** — summary

### RUN METADATA
- Section counts: URGENT={n}; HIGH={n}; MEETING PREP STATUS={n}; PIPELINE ALERTS={n}; ACTION QUEUE={n}; FYI={n}
- Assumptions to validate:
  - [assumption 1]
  - [assumption 2]
  - [assumption 3]
```

---

### meeting-brief

**Target file:** Meetings/{{meeting_date}}-{{meeting_file_slug}}.md

**Extra inputs:** meeting_name: {{meeting_name}} · customer: {{customer}}

**Template:**

```markdown
# Meeting Brief: {{meeting_name}}

## Meeting
- **Title:** {{meeting_name}}
- **Date/Time:** {{meeting_date}}
- **Customer/Topic:** {{customer}}
- **Attendees:**
	- 👤 **Name** · Role

## Why This Matters
- **[single most important thing L.C.G should know]**
- supporting context

## What Changed Since Last Touchpoint
- **[change summary]**
	- 💡 detail or implication

## Key Attendee Context
- 👤 **[name]** · [role]
	- [relevant recent interaction]

## Open Items and Milestone Status
- [/] **[item]** · 👤 **owner** · 📅 **due date** · `status`
	- blocker/risk detail

## Risks and Decision Points
- [!] **[risk or decision]**
	- 💡 context or mitigation

## Prep Checklist
- [ ] [item]

## Recommended Talk Track
1. [opening/framing]
2. [key point]
3. [ask/close]
```

---

### meeting-followup

**Target file:** Meetings/{{meeting_date}}-{{meeting_file_slug}}-followup.md

**Extra inputs:** meeting_name: {{meeting_name}} · customer: {{customer}}

**Template:**

```markdown
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
- 📧 mail: [message/thread references]
- 📅 calendar: [event reference]
- 📊 crm: [milestone/opportunity references]
- 📝 vault: [note references]
```

---

### learning-review

**Target file:** Daily/{{TODAY}}-learning-review.md

**Extra inputs:** _lcg/learning-log.md

**Template:**

```markdown
## Learning Review

### PROMOTION CANDIDATES
- **Pattern:** [description]
- **Evidence:** [count] entries from [date range]
  - [entry summary]
- **Target file:** _lcg/[filename].md
- **Proposed change:**
  ```
  [exact text]
  ```
- **Status:** PENDING APPROVAL

### WATCHING
- [topic] — [count] entries — needs [n] more before promotion

### STALE ENTRIES
- [date]: [entry summary] — reason flagged

### REVIEW METADATA
- Total learning-log entries: {n}
- Promotion candidates: {n}
- Watching patterns: {n}
- Stale entries: {n}
- Review date: {{TODAY}}
```

---

### update-request

**Target file:** Daily/{{run_date}}-update-requests-{{customer_file_slug}}.md

**Extra inputs:** customer: {{customer}} · run_date: {{run_date}} · customer_file_slug: {{customer_file_slug}}

**Template:**

```markdown
# Update Request Drafts: {{customer}}

## Run Metadata
- Date: {{run_date}}
- Customer Slug: {{customer_file_slug}}
- Draft Count: {n}
- Quality Bar: L.C.G edits <=2 sentences per draft

## Draft Queue
- [D] [Owner Name] - priority URGENT|HIGH - reason

## Draft 1
- To:
- Subject: [Milestone] Update Request - [Due Date]
- Body:
	Hi [Owner Name],

	[Milestone Name] is due on [Due Date]. Could you please send a status update by [Requested Date/Time] that includes:
	- Current status (on track / at risk / blocked)
	- Any blockers and owner
	- Revised date if at risk

	Thank you,
	L.C.G

## Draft N
- Repeat for each owner.

## Review Notes
- Any uncertainties or missing data to verify before sending.
```
