---
name: internal-vault-config-gate
description: "Implicit vault config prefetch gate — resolves which _lcg/ configuration files are authoritative for the current task domain and loads them before execution begins. Fires for any operational task: triage, inbox, meeting prep, CRM, pipeline, milestone, forecast, coaching, drafting, communication, scheduling, learning review, portfolio, update request, win digest, ROB, vault hygiene, nomination, account review. Triggers: triage, prep, brief, draft, pipeline, forecast, CRM, milestone, portfolio, coaching, meeting, schedule, inbox, email, update request, win wire, ROB, learning review, vault hygiene, nomination, account landscape, correction, follow-up, send email, reply, delegate, action items. DO NOT USE FOR: vault entity sync (use vault-sync), vault search or customer lookup (use internal-vault-routing), dashboard or visualization creation (use dashboard-obsidian)."
---

# Vault Config Gate

## Purpose

Ensure `_lcg/` configuration files are read before any operational task begins.  
This skill is the **single source of truth** for which config is authoritative in which domain.

Every workflow — prompt, skill, agent, or CLI invocation — MUST resolve its config dependencies through this contract. Do not hardcode config reads in individual skills; reference this mapping instead.

## When This Fires

Implicitly, as Step 0 of any operational task. If the current request touches any domain in the table below, load the required configs before proceeding.

## Config-Domain Contract

### Always-Read Configs

These two files provide identity and global preferences. Read them for **every** operational task:

| Config | Purpose | OIL Read |
|--------|---------|----------|
| `_lcg/role.md` | Persona, team-model, territory, seller-list, direct-reports, forecast targets | `oil:read_note_section` path=`_lcg/role.md` |
| `_lcg/preferences.md` | Triage labels (P0-P3), type/signal taxonomy, working style, corrections log, suppression rules | `oil:read_note_section` path=`_lcg/preferences.md` |

### Domain-Specific Configs

Layer these on top of the always-read set based on the task domain:

| Domain | Additional Configs | When |
|--------|-------------------|------|
| **Triage / Inbox** | `vip-list.md`, `operating-rhythm.md`, `learning-log.md` | Any inbox scan, priority classification, morning triage |
| **Meeting Prep** | `operating-rhythm.md`, `templates/meeting-brief.md` | Any meeting brief, prep, or pre-meeting context assembly |
| **Meeting Follow-up** | `communication-style.md` | Post-meeting action items, follow-up drafts |
| **CRM / Pipeline** | _(base set sufficient — `role.md` provides team scoping)_ | Portfolio review, pipeline hygiene, milestone review, opportunity review |
| **Forecast** | _(base set sufficient — `role.md` provides targets)_ | Forecast prep, commit/upside breakdown, coverage analysis |
| **Coaching / 1:1 Prep** | `communication-style.md` | Seller coaching briefs, 1:1 prep |
| **Drafting / Email** | `communication-style.md`, `vip-list.md` | Any draft, reply, update request, follow-up email |
| **Win Digest / ROB** | `communication-style.md`, `operating-rhythm.md` | Win wires, Winning Wednesdays, weekly ROB, STU highlights |
| **Scheduling / Cadence** | `operating-rhythm.md` | Automation scheduling, cadence checks |
| **Learning / Corrections** | `learning-log.md`, `vip-list.md` | Triage correction loop, learning review, vault hygiene |
| **Account / Customer** | `vip-list.md` | Account landscape briefs, customer evidence packs |

### Multi-Domain Requests

Many tasks span multiple domains (e.g., morning triage = Triage + Meeting Prep + Drafting). Union all required configs for the detected domains. Deduplicate reads.

## Prefetch Procedure

```
1. Classify → detect which domain(s) the request falls into
2. Union   → merge always-read + domain-specific config sets
3. Load    → read each config via OIL (batch when possible)
4. Validate → check each config is non-empty and non-placeholder
5. Proceed → pass resolved context to the executing workflow
```

### Step 1: Classify

Map the user's intent to one or more domains from the table above. Use keywords, skill triggers, and prompt names as signals. When ambiguous, default to the broadest applicable domain set.

### Step 2: Union

Combine the always-read set (`role.md`, `preferences.md`) with every domain-specific config for the detected domains. Remove duplicates.

### Step 3: Load

Read each config file via OIL tools:

```
oil:read_note_section  path="_lcg/role.md"
oil:read_note_section  path="_lcg/preferences.md"
oil:read_note_section  path="_lcg/vip-list.md"         # if domain requires it
oil:read_note_section  path="_lcg/operating-rhythm.md"  # if domain requires it
oil:read_note_section  path="_lcg/communication-style.md"  # if domain requires it
oil:read_note_section  path="_lcg/learning-log.md"      # if domain requires it
```

For templates, read the full note:
```
oil:read_note_section  path="_lcg/templates/meeting-brief.md"
```

### Step 4: Validate

For each loaded config:

| Check | Action |
|-------|--------|
| File not found | Log warning; continue with degraded context. Do NOT block the workflow. |
| File is empty or contains only YAML frontmatter with no body | Flag as `⚠️ placeholder-only` in output; recommend running onboarding or vault-hygiene. |
| `role.md` → `team-model` missing | Fall back to `method: self` (authenticated user only). |
| `role.md` → `last-refreshed` older than 7 days | Flag stale; recommend refresh. |
| `vip-list.md` → no tier entries | Flag empty; all senders treated as NORMAL priority. |

### Step 5: Proceed

Attach resolved configs to the workflow context. Do NOT echo config contents to the user unless they explicitly ask. Configs are operational inputs, not conversational output.

## Fallback: No OIL Available

If OIL tools are not available (e.g., Copilot CLI without MCP, or vault not mounted):

1. Check if `vault-starter/_lcg/` files exist locally in the workspace.
2. If yes, read them via filesystem as read-only reference (not live vault state).
3. If no, proceed statelessly. Log: `⚠️ No vault config available — operating without _lcg/ context.`
4. Never block a workflow because configs are unavailable. Degrade gracefully.

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `internal-vault-routing` | Complementary. internal-vault-routing handles CRM entity reads/writes and vault protocol phases. This skill handles config governance only. |
| `vault-sync` | No overlap. vault-sync writes CRM data to vault. This skill reads config. |
| Individual workflow skills | This skill provides their config inputs. They should NOT independently hardcode `_lcg/` reads — reference this contract instead. |

## Config File Quick Reference

| File | Key Contents | Updated By |
|------|-------------|------------|
| `role.md` | Persona, team-model, territory, sellers, forecast targets, quota | `onboarding.prompt.md`, `deal-portfolio-review` (auto-refresh) |
| `preferences.md` | P0-P3 labels, Type taxonomy, Signal labels, suppression rules | `onboarding.prompt.md`, `learning-review` (promotion) |
| `vip-list.md` | Tier 1/2/3 sender lists | `onboarding.prompt.md`, `learning-review` (promotion) |
| `operating-rhythm.md` | Recurring cadences, key dates, monitoring channels, SLA targets | `onboarding.prompt.md`, manual edits |
| `communication-style.md` | Tone, formality defaults, preferred phrases | `onboarding.prompt.md`, `learning-review` (promotion) |
| `learning-log.md` | Append-only correction journal | `triage-correction-loop` (append), `learning-review` (read + promote) |
