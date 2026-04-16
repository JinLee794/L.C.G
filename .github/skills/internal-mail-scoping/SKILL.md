---
name: internal-mail-scoping
description: 'Outlook Mail MCP query scoping: efficient email search, thread navigation, attachment handling, and reply patterns for the native Mail MCP server. Prevents unbounded searches, thread explosion, and attachment size surprises. Triggers: email search, find email, search Outlook, mail thread, email attachment, reply to email, forward email, send email, Outlook retrieval, Mail MCP, inbox search.'
argument-hint: 'Describe what email data you need — sender, subject, time range, attachments, or action (reply/forward/send)'
---

# Mail Query Scoping

Efficient patterns for the native `mail:*` MCP tools. Prevents search payload bloat, thread traversal waste, and attachment size surprises.

## Purpose

Frontloads Outlook mail topology knowledge and provides retrieval strategies that minimize tool calls and payload size when using the Mail MCP server directly.

## When to Use

- Searching for emails by sender, subject, date, or content
- Reading or navigating email threads
- Handling attachments (download, upload, size checks)
- Composing, replying, or forwarding emails
- Any direct `mail:*` tool call (not `workiq:ask_work_iq`)

## MCP Tools

### Critical Rule: SearchMessages vs SearchMessagesQueryParameters

**Always prefer `mail:SearchMessages` (KQL) over `mail:SearchMessagesQueryParameters` (OData `$filter`).** KQL handles sender, domain, subject, date range, and boolean filters natively and reliably.

`SearchMessagesQueryParameters` uses OData `$filter` syntax against the Graph `/messages` endpoint. Most useful OData filter functions (`endswith`, `startswith`, `contains`) are **NOT supported** on nested complex-type properties like `from/emailAddress/address`. This causes `ErrorInvalidUrlQueryFilter` errors.

| Scenario | Correct Tool | Query |
|---|---|---|
| Emails from a domain | `SearchMessages` | `from:contoso.com AND received:2026-03-01..2026-03-14` |
| Emails from a person | `SearchMessages` | `from:name@contoso.com AND received:>=2026-03-01` |
| Emails by date + sender + topic | `SearchMessages` | `from:contoso.com AND subject:"Review" AND received:2026-03-01..2026-03-14` |
| Simple date/read-status filter only | `SearchMessagesQueryParameters` | `?$filter=receivedDateTime ge 2026-03-01T00:00:00Z&$top=25&$orderby=receivedDateTime desc` |

**Never use `SearchMessagesQueryParameters` with `endswith()`, `startswith()`, or `contains()` on `from/emailAddress/address` or any nested complex type.** These are unsupported by Microsoft Graph and will fail.

### Read Tools

| Tool | Purpose | Payload Risk |
|---|---|---|
| `mail:SearchMessages` | KQL-powered search across mailbox — **primary search tool** | **HIGH** — unbounded queries return massive results |
| `mail:SearchMessagesQueryParameters` | OData `$filter` search — **use only for simple property filters** (date, isRead) | **HIGH** — invalid filters cause errors; see Critical Rule above |
| `mail:GetMessage` | Single message by ID | LOW-MEDIUM (depends on body size) |
| `mail:GetAttachments` | List attachments on a message | LOW |
| `mail:DownloadAttachment` | Download attachment content | **HIGH** — depends on file size |

### Write Tools

| Tool | Purpose | Notes |
|---|---|---|
| `mail:SendEmailWithAttachments` | Compose and send (with optional attachments) | Primary send tool |
| `mail:CreateDraftMessage` | Create a draft | For review-before-send workflows |
| `mail:SendDraftMessage` | Send an existing draft | After draft review |
| `mail:UpdateDraft` | Modify a draft | Edit before sending |
| `mail:ReplyToMessage` | Reply to sender only | |
| `mail:ReplyAllToMessage` | Reply to all recipients | |
| `mail:ReplyWithFullThread` | Reply with full quoted thread | Use when thread context matters |
| `mail:ReplyAllWithFullThread` | Reply-all with full quoted thread | |
| `mail:ForwardMessage` | Forward to new recipients | |
| `mail:ForwardMessageWithFullThread` | Forward with full quoted thread | |
| `mail:FlagEmail` | Flag/unflag a message | |
| `mail:UpdateMessage` | Update message properties | |
| `mail:DeleteMessage` | Delete a message | DESTRUCTIVE |
| `mail:AddDraftAttachments` | Add attachments to a draft | |
| `mail:UploadAttachment` | Upload attachment to a message | For small files |
| `mail:UploadLargeAttachment` | Upload large attachment (>3MB) | For files >3MB |
| `mail:DeleteAttachment` | Remove an attachment | |

## Search Patterns

### KQL Syntax for `SearchMessages`

`SearchMessages` uses Keyword Query Language (KQL). Build queries using these fields:

| KQL Property | Example | Notes |
|---|---|---|
| `from:` | `from:satyan@microsoft.com` | Sender email or display name |
| `to:` | `to:jinle@microsoft.com` | Recipient |
| `subject:` | `subject:"Quarterly Review"` | Subject line (quote phrases) |
| `body:` | `body:proposal` | Message body content |
| `received:` | `received:2026-03-01..2026-03-14` | Date range (ISO format) |
| `sent:` | `sent:>=2026-03-01` | Sent date with comparison |
| `hasattachment:true` | | Messages with attachments |
| `kind:email` | | Restrict to emails (not meetings) |
| `importance:high` | | High-importance messages |
| `isflagged:true` | | Flagged messages |

**Combine with AND/OR:**
```
from:contoso.com AND subject:"project update" AND received:2026-03-01..2026-03-14
```

**Domain-based sender search** — KQL `from:` accepts full emails OR just the domain:
```
from:r1rcm.com AND received:2026-03-16..2026-03-30
```
This is the correct way to find all emails from a company domain. Do NOT use `SearchMessagesQueryParameters` with `endswith(from/emailAddress/address,'r1rcm.com')` — it will fail.

### Pattern 1: Targeted Person + Topic Search (Preferred)

```
1. mail:SearchMessages({
     query: "from:<email> subject:<topic> received:<date-range>",
     top: 10
   })
2. Review subjects and snippets to identify relevant threads
3. mail:GetMessage({ messageId }) for full content of specific matches
```

**Key**: Always include at least two KQL filters (person + date, or person + topic).

### Pattern 2: Thread Navigation

```
1. mail:SearchMessages to find a message in the thread
2. Extract conversationId from the result
3. mail:SearchMessages({ query: "conversationid:<id>" }) to get all messages in thread
   — OR use GetMessage on each known messageId
```

**Ordering**: Thread messages are typically returned newest-first. For chronological reading, reverse the results.

### Pattern 3: Attachment Discovery

```
1. mail:SearchMessages({ query: "hasattachment:true from:<sender> received:<range>", top: 10 })
2. mail:GetAttachments({ messageId }) → review names and sizes before downloading
3. mail:DownloadAttachment({ messageId, attachmentId }) only for specific needed files
```

**Always check size before download.** Attachments over 3MB can exceed context limits.

### Pattern 4: Recent Unread/Flagged (Quick Scan)

```
1. mail:SearchMessages({ query: "isflagged:true received:>=2026-03-13", top: 10 })
   — OR —
   mail:SearchMessages({ query: "isread:false received:>=2026-03-13", top: 10 })
```

## Payload Management

### Search Result Sizing

`SearchMessages` returns message previews including body snippets. Mitigations:

1. **Always use `top`** — start with 5-10.
2. **Use KQL date ranges** — never search without a time boundary.
3. **Combine filters** — `from:` + `received:` + `subject:` narrows dramatically.
4. **Two-pass**: search first (top: 5), then `GetMessage` for specific IDs.

### Thread Bloat

`ReplyWithFullThread` and `ForwardMessageWithFullThread` include the entire quoted conversation. For long threads:

1. Prefer `ReplyToMessage` / `ForwardMessage` (without thread) when the recipient has context.
2. Use `*WithFullThread` variants only when the recipient needs history.

### Attachment Size Awareness

Before downloading any attachment:
1. Call `GetAttachments` to list names and sizes.
2. Skip attachments over 5MB unless explicitly requested.
3. For large files, report the attachment name and size, and ask whether to proceed.

## Decision Logic

```
Need to find specific emails? → SearchMessages with KQL
  └ Know sender? → add from: filter
  └ Know topic? → add subject: or body: filter
  └ Know time range? → add received: filter (ALWAYS recommended)
  └ Too many results? → tighten KQL filters, reduce top
  └ Too few? → broaden date range, then relax topic filter

Need full email content? → GetMessage by messageId
  └ From search results? → extract messageId, call GetMessage
  └ Need attachments? → GetAttachments first, then DownloadAttachment selectively

Need to send/reply? → See Write Patterns below
  └ New email → SendEmailWithAttachments
  └ Reply to existing → ReplyToMessage or ReplyAllToMessage
  └ Forward → ForwardMessage
  └ Want review first → CreateDraftMessage → UpdateDraft → SendDraftMessage
```

## Write Patterns

### Sending a New Email
```
mail:SendEmailWithAttachments({
  to: "recipient@example.com",
  subject: "Subject line",
  body: "Message body",
  contentType: "text"  // or "html"
})
```

### Reply Workflow
```
1. Identify messageId (from search or prior read)
2. mail:ReplyToMessage({ messageId, comment: "Reply text" })
   — OR for reply-all —
   mail:ReplyAllToMessage({ messageId, comment: "Reply text" })
```

### Draft-Review-Send Workflow
```
1. mail:CreateDraftMessage({ to, subject, body })
2. (optional) mail:UpdateDraft({ messageId, body: "revised content" })
3. (optional) mail:AddDraftAttachments({ messageId, attachments })
4. mail:SendDraftMessage({ messageId })
```

### Forward Workflow
```
1. mail:ForwardMessage({ messageId, to: "recipient@example.com", comment: "See below" })
```

## Common Pitfalls

| Pitfall | Prevention |
|---|---|
| Unbounded `SearchMessages` | Always include `top` AND at least one date filter in KQL. |
| Searching by body text alone | Body search is slow and noisy. Combine with `from:` or `subject:` filters. |
| Downloading large attachments blindly | Always `GetAttachments` first to check sizes. |
| Using `*WithFullThread` by default | Prefer non-thread variants unless the recipient genuinely lacks context. |
| Assuming message order | Search results are relevance-ranked, not chronological. Sort by date if needed. |
| Missing KQL quoting | Multi-word phrases in KQL must be quoted: `subject:"Project Update"`. |
| Using `SearchMessagesQueryParameters` for sender/domain filtering | Graph OData does NOT support `endswith()`, `startswith()`, or `contains()` on `from/emailAddress/address`. Use `SearchMessages` with KQL `from:domain.com` instead. |
| Using `$filter` with nested complex types | OData filter functions on nested properties (e.g., `from/emailAddress/address`) are unsupported. Stick to KQL for any sender/recipient/subject filtering. |

## Post-Retrieval Processing

After retrieving raw mail search results, **always pipe through the helper script** instead of writing inline classification logic.

```bash
# Save raw SearchMessages response to a temp file, then normalize
node scripts/helpers/normalize-mail.js /tmp/mail-raw-<date>.json \
  --vip-list "$VAULT_DIR/_lcg/vip-list.md" \
  > /tmp/mail-normalized-<date>.json
```

**What `normalize-mail.js` handles:**
- Extracts sender, subject, received date, snippet, webLink
- Classifies priority (URGENT/HIGH/NORMAL/LOW) using VIP list and importance signals
- Suppresses automated noise (noreply, notifications, newsletters)
- Sorts by received time (newest first)

**Rule:** Do not write inline sender-classification, VIP-matching, or noise-suppression code. The helper applies consistent rules from the VIP list and suppression patterns.

## Chaining

- **From WorkIQ**: If `workiq:ask_work_iq` identified relevant emails but you need full content, extract identifiers and use `mail:GetMessage`.
- **To vault**: After retrieving important email decisions, persist via `oil:write_note` or `oil:patch_note`.
- **To CRM**: If an email reveals milestone/task status changes, use `msx-crm` dry-run write-intent tools.
- **From calendar**: If a meeting has email context (pre-reads, follow-ups), use `mail:SearchMessages` with the meeting subject as KQL `subject:` filter.
