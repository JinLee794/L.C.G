---
name: internal-teams-scoping
description: 'Teams MCP query scoping: efficient chat discovery, message search, channel navigation, and chat-type disambiguation for the native Teams MCP server. Prevents oversized payloads, multi-hop sprawl, self-chat confusion, and meeting-chat-vs-direct-chat mistakes. Triggers: Teams search, find chat, search Teams messages, list chats, Teams channel, self-chat, 48:notes, Teams message, post to Teams, chat discovery, Teams retrieval, Teams MCP, 1:1 chat, direct message, meeting chat, send to person, find direct chat.'
argument-hint: 'Describe what Teams data you need — chat messages, channel posts, specific person, topic, or time range'
---

# Teams Query Scoping

Efficient patterns for the native `teams:*` MCP tools. Prevents payload bloat, unnecessary hops, and confusion around Teams chat topology.

## Purpose

Frontloads chat/channel topology knowledge and provides retrieval strategies that minimize tool calls and payload size when using the Teams MCP server directly (not WorkIQ).

## When to Use

- Retrieving Teams messages for a specific person, topic, or time range
- Discovering which chat or channel contains a conversation
- Posting messages to chats or channels
- Any direct `teams:*` tool call (not `workiq:ask_work_iq`)

## MCP Tools

| Tool | Purpose | Payload Risk |
|---|---|---|
| `teams:SearchTeamsMessages` | Full-text search across all Teams messages | **HIGH** — can return 20KB+ |
| `teams:ListChats` | Lists all chats (1:1, group, meeting) | **MEDIUM** — many results |
| `teams:ListChatMessages` | Messages in a specific chat | **MEDIUM** — unbounded without top/skip |
| `teams:GetChat` | Single chat metadata by ID | LOW |
| `teams:GetChatMessage` | Single message by chat + message ID | LOW |
| `teams:ListTeams` | All joined teams | LOW |
| `teams:ListChannels` | Channels in a specific team | LOW |
| `teams:ListChannelMessages` | Messages in a channel | **MEDIUM** |
| `teams:ListChannelMembers` | Members of a channel | LOW |
| `teams:ListChatMembers` | Members of a chat | LOW |
| `teams:PostMessage` | Send message to a chat | WRITE |
| `teams:PostChannelMessage` | Send message to a channel | WRITE |
| `teams:ReplyToChannelMessage` | Reply in a channel thread | WRITE |
| `teams:CreateChat` | Create a new chat | WRITE |
| `teams:CreateChannel` | Create a team channel | WRITE |
| `teams:CreatePrivateChannel` | Create a private channel | WRITE |

## Teams Chat Topology

Understanding chat types prevents wasted discovery calls and posting to the wrong destination.

| Chat Type | `chatType` Value | Discoverable via `ListChats`? | Notes |
|---|---|---|---|
| **1:1 direct chat** | `oneOnOne` | Yes | Between exactly two people; permanent, not tied to a meeting |
| **Group chat** | `group` | Yes | 3+ named participants |
| **Meeting chat** | `meeting` | Yes | Auto-created for a scheduled calendar event; **NOT a direct 1:1 chat** |
| **Self-chat** | N/A (`48:notes`) | **No** | Personal notepad; NOT in `ListChats` results |

### Chat Type Disambiguation — ID Format is the Ground Truth

**CRITICAL**: Meeting chats are frequently named "1:1 - [Name] | [Role] - [alias]" because the calendar event title used that format. This display name looks like a direct chat but is a meeting chat. **Never rely on display names alone to determine chat type.**

The most reliable signal is the **chat ID format**:

| Chat Type | ID Pattern | Example |
|---|---|---|
| **1:1 direct chat** | `19:<hex-only-no-meeting_>@thread.v2` or `19:<user-guid>_<user-guid>@unq.gbl.spaces` | `19:a1b2c3d4...@thread.v2` |
| **Group chat** | `19:<hex-string>@thread.v2` (same as 1:1 — disambiguate via `chatType` field or member count) | `19:9ec4...@thread.v2` |
| **Meeting chat** | `19:meeting_<base64>@thread.v2` — **always contains `meeting_`** | `19:meeting_NGVm...@thread.v2` |
| **Self-chat** | `48:notes` | `48:notes` |

**Rule**: If a chat ID contains `meeting_`, it is a **meeting chat** regardless of its display name.

### Safeguard Before Posting or Using a Chat ID

When a chatId comes from search results or message attributions (not from a direct `ListChats` call with type filtering), **always verify it before using it**:

```
1. Check the chatId string itself:
   - Contains "meeting_"? → this is a meeting chat, NOT a direct chat
   - Is "48:notes"? → self-chat (personal notepad)
   - Format "19:<hex>_<hex>@unq.gbl.spaces"? → likely a 1:1 direct chat
   - Otherwise ambiguous → call teams:GetChat({ chatId }) to read the chatType field

2. Confirm intent matches type:
   - User wants to message a person directly? → require chatType == "oneOnOne"
   - User wants to send to a meeting thread? → chatType == "meeting" is correct
   - Wrong type found? → resolve the correct chatId via ListChats (filter by chatType)
```

**Sample `GetChat` response fields to check:**
- `chatType`: `oneOnOne` | `group` | `meeting`
- `topic`: display name (unreliable for type determination)
- `members`: use to confirm the right person is in the chat

### Self-Chat (`48:notes`)

The Teams self-chat (personal notepad / "chat with yourself") uses the special ID format `48:notes`. It is **not** discoverable through `ListChats` or `SearchTeamsMessages`.

**To read self-chat**: `teams:ListChatMessages` with chatId `48:notes` — this may or may not be supported by the MCP server. If it fails, self-chat is not accessible via MCP tools.

**To post to self-chat**: `teams:PostMessage` with chatId `48:notes` — same caveat.

**Fallback**: If the user has a personal scratchpad channel (e.g., a private channel in a team), discover it via `ListTeams` → `ListChannels` (filter by name like "sandbox", "notes", "personal").

## Vault-First UPN Resolution

Teams operations that target a specific person (chat lookup, message send, chat creation) require a **UPN** (User Principal Name) or Teams user ID. UPN is the user's actual sign-in address — it is often **different from** the user's alias or corporate email shorthand.

**CRITICAL: UPN ≠ alias.** For example:
- Alias: `jinle` → guessing `jinle@microsoft.com` **FAILS**
- Actual UPN: `jin.lee@microsoft.com` → **WORKS**
- Display name in Teams: "Jin Lee (HLS US SE)" → does not reveal UPN

**Never guess UPNs from aliases or display names.** Always resolve through the flow below.

### Resolution Flow

```
Person name known?
  ├─ [1] oil:get_person_context({ name }) → check email / teams_id fields
  │   ├─ email or teams_id present? → USE IT (skip all Teams discovery)
  │   └─ Not present? → fall through to discovery
  │
  ├─ [2] teams:SearchTeamsMessages({ message: "<person name>" }) → find chats
  │   └─ Found chatIds? → teams:ListChatMembers({ chatId })
  │       └─ Extract email + userId from member metadata → USE IT
  │       └─ Persist to vault (see below)
  │
  ├─ [3] calendar:ListCalendarView (recent events) → extract UPN from attendees
  │   └─ Found UPN? → use it AND persist to vault (see below)
  │
  ├─ [4] teams:ListChats() → filter by member displayName
  │   └─ Found userId? → use it AND persist to vault (see below)
  │
  ├─ [5] All automated methods failed → ASK THE USER
  │   └─ "I found [Display Name] but couldn't resolve their UPN.
  │       Do you know their email address? (e.g., first.last@microsoft.com)"
  │   └─ User confirms → USE IT and persist to vault
  │
  └─ User doesn't know → report gap; do not guess UPNs
```

**Key principle**: The `ListChatMembers` response returns the **real UPN** in the `email` field and the **Teams GUID** in `userId`. These are the authoritative values — always prefer them over alias guessing.

### Persisting Resolved UPNs to Vault

When a UPN or Teams ID is discovered through chat member lists, calendar events, or user confirmation, **write it back to the vault** so future lookups are instant and API-free:

```
oil:patch_note({
  path: "People/<Person Name>.md",
  heading: "frontmatter",
  content: "email: user@domain.com\nteams_id: <teams-user-id>"
})
```

**Vault person file frontmatter fields:**
- `email` — UPN / email address (e.g., `jin.lee@microsoft.com` — NOT `jinle@microsoft.com`)
- `teams_id` — Teams-specific user ID (GUID from chat member metadata, e.g., `c4259a64-c028-47b8-bd06-fe2041db8325`)

**Best source for UPN + teams_id**: `teams:ListChatMembers({ chatId })` returns both fields definitively in every member entry.

### Why Vault-First?

| Approach | Reliability | Latency | Token Cost |
|---|---|---|---|
| **Vault lookup** (`get_person_context`) | High — local file | ~50ms | Minimal |
| Calendar attendee extraction | Medium — depends on recent events | ~500ms | Low |
| `ListChats` → member filter | Medium — intermittent failures, throttling | ~1-3s | Medium |
| Pattern guessing (`first.last@domain`) | Low — fails for non-standard aliases | N/A | None |

## Retrieval Patterns

### Pattern 1: Find Messages by Topic (Narrowest)

```
1. teams:SearchTeamsMessages({ query: "<topic keywords>", top: 10 })
2. If results are large → tighten query with more specific terms
3. Extract chatId/channelId from results for targeted follow-up
```

**Key**: Always use `top` parameter to limit results. Start with 5-10, increase only if needed.

### Pattern 2: Find Messages from a Specific Person (Direct Chat Only)

```
1. oil:get_person_context({ name }) → extract email or teamsId
2. If vault has UPN/teamsId → teams:ListChats() → filter by userId (exact match) AND chatType == "oneOnOne"
3. If vault miss → teams:ListChats() → filter by member displayName AND chatType == "oneOnOne"
4. Verify the matched chatId does NOT contain "meeting_" (belt-and-suspenders; see Topology section)
5. teams:ListChatMessages({ chatId, top: 20 })
6. If UPN was discovered in step 3 → persist to vault via oil:patch_note
```

**Why filter by chatType?** `SearchTeamsMessages` and listing calls return meeting chats whose display names look like "1:1 - [Name] | [Role]" — these are calendar-meeting threads, not direct message chats. Always filter `chatType == "oneOnOne"` when seeking a direct chat.

**Why vault-first?** `ListChats` + displayName filtering is unreliable under throttling and returns ambiguous matches for common names. Vault-cached UPNs skip the discovery hop entirely.

### Pattern 3: Channel Message Retrieval

```
1. teams:ListTeams() → find team by displayName
2. teams:ListChannels({ teamId }) → find channel by displayName
3. teams:ListChannelMessages({ teamId, channelId, top: 20 })
```

Three hops are unavoidable for channels. Cache `teamId` and `channelId` after first discovery.

### Pattern 4: Broad Topic Discovery (Last Resort)

```
1. teams:SearchTeamsMessages({ query: "<broad terms>", top: 5 })
2. Review summaries/snippets to identify which chats/channels are relevant
3. Drill into specific chats via ListChatMessages
```

**Warning**: This is the pattern most likely to produce oversized payloads. Always cap `top` at 5-10 for discovery.

## Payload Management

### The 28KB Problem

`SearchTeamsMessages` frequently returns payloads exceeding 20KB because message bodies include HTML formatting, adaptive cards, and inline images.

**Mitigations**:
1. **Always set `top`** — never call `SearchTeamsMessages` without a result limit.
2. **Start small** — `top: 5` for discovery, `top: 10-15` for targeted retrieval.
3. **Extract IDs, then drill** — use search results only to identify relevant chatIds/messageIds, then retrieve specific messages individually.
4. **Prefer `GetChatMessage`** — for known message IDs, single-message retrieval avoids payload bloat.

### Chat List Management

`ListChats` returns all chats the user participates in (potentially hundreds). Filtering strategies:

1. **Topic filter**: If the tool supports a `topic` or `filter` parameter, use it.
2. **By chat type**: Filter results by `chatType` (oneOnOne, group, meeting) to narrow.
3. **By member**: If looking for a specific person's chat, match on `members` array after retrieval.
4. **Recency**: Most tools return chats sorted by last activity — the first 10-20 are typically sufficient.

## Decision Logic

### Choosing the Right Retrieval Path

```
Need specific topic? → SearchTeamsMessages (top: 5-10)
  └ Found relevant chatId/channelId? → drill into specific chat/channel
  └ Too many results? → add more keywords, reduce top
  └ No results? → try ListChats + filter by member

Need person's messages (direct chat)? → oil:get_person_context (vault UPN) → ListChats (filter chatType == "oneOnOne") → ListChatMessages
  └ Vault has email/teamsId? → filter ListChats by userId (exact) AND chatType == "oneOnOne"
  └ Vault miss? → filter by displayName AND chatType == "oneOnOne", then persist resolved UPN to vault
  └ Only have display name? → match on chat member displayName; verify chatId does NOT contain "meeting_"
  └ SearchTeamsMessages returned a chatId? → ALWAYS verify via GetChat before using — may be meeting chat

Need person's messages (from a meeting thread)? → SearchTeamsMessages → filter results for chatId containing "meeting_" or chatType == "meeting"

Need channel content? → ListTeams → ListChannels → ListChannelMessages
  └ Know team name? → filter ListTeams by displayName
  └ Don't know team? → ListTeams first, present options

Need to post? → See Write Patterns below
```

## Write Patterns

### Posting to a Chat
```
1. Identify chatId (via ListChats or from prior read results)
2. VERIFY chat type before posting:
   a. Does the chatId contain "meeting_"? → STOP — this is a meeting chat, not a direct chat
   b. Unsure? → teams:GetChat({ chatId }) → confirm chatType == "oneOnOne" or "group" as intended
3. teams:PostMessage({ chatId, content: "<message>", contentType: "text" })
```

**Why verify?** Search results and attributions often surface meeting chat IDs. Posting to a meeting thread when the user intended a direct message is incorrect and potentially visible to unexpected attendees.

### Posting to a Channel
```
1. Identify teamId + channelId (via ListTeams → ListChannels)
2. teams:PostChannelMessage({ teamId, channelId, content: "<message>" })
```

### Replying in a Channel Thread
```
1. Identify teamId + channelId + messageId (parent message)
2. teams:ReplyToChannelMessage({ teamId, channelId, messageId, content: "<reply>" })
```

### Creating a New Chat
```
1. oil:get_person_context({ name }) → extract email or teamsId
2. If vault has userId → use it directly
3. If vault miss → resolve via calendar/ListChats, then persist to vault
teams:CreateChat({ chatType: "oneOnOne", members: [{ userId: "<resolved-user-id>" }] })
```

For group chats, use `chatType: "group"` with multiple members. Resolve all member UPNs via vault before calling CreateChat.

## Common Pitfalls

| Pitfall | Prevention |
|---|---|
| **Meeting chat mistaken for 1:1 direct chat** | Meeting chats are auto-named "1:1 - [Name] \| [Role]" but their IDs contain `meeting_`. Always check chatId for `meeting_` prefix and filter `chatType == "oneOnOne"` when seeking a direct message chat. |
| **Using search attribution IDs without verification** | `SearchTeamsMessages` attributions return chatIds from any context (channels, meeting threads, group chats). Never post to a chatId from search results without first verifying its type via `GetChat` or the `meeting_` ID check. |
| Searching for self-chat via `ListChats` | Self-chat (`48:notes`) is not in `ListChats`. Use direct ID or find a personal channel. |
| `SearchTeamsMessages` without `top` | Always set `top`. Default responses are unbounded and can exceed 20KB. |
| Assuming search filters by sender | `SearchTeamsMessages` is full-text only. Filter by sender after retrieval, or use chat-first discovery. |
| Multi-hop channel discovery on every call | Cache `teamId` + `channelId` after first resolution. Reuse for the session. |
| Posting to wrong chat type | 1:1 chats use `PostMessage` with chatId; channels use `PostChannelMessage` with teamId + channelId. Always verify intent matches type before writing. |
| Guessing UPNs without vault check | Always check `oil:get_person_context` first. Pattern-guessed UPNs fail for non-standard aliases and waste API calls. |
| Assuming alias == UPN | `jinle` != `jin.lee@microsoft.com`. Many users have different alias and UPN formats. The only reliable source is `ListChatMembers.email` or vault-cached `email` frontmatter. |

## Chaining

- **From OIL (vault-first UPN)**: Before person-targeted Teams calls, `oil:get_person_context({ name })` returns cached `email` and `teamsId`. If resolved via Teams API, write back with `oil:patch_note` to prevent future lookup failures.
- **From WorkIQ**: If `workiq:ask_work_iq` identified a relevant Teams conversation but you need the actual messages → extract identifiers and use `teams:ListChatMessages` or `teams:GetChatMessage`.
- **To vault**: After retrieving important Teams decisions, persist via `oil:write_note` or `oil:patch_note`.
- **To CRM**: If a Teams conversation reveals milestone/task status changes, use `msx-crm` (dry-run) write-intent tools.
