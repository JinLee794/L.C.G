---
name: vault-settings
description: "Manage _lcg/ personalization configs directly in the live Obsidian vault — role, preferences, VIP list, communication style, operating rhythm, learning log, and templates. Reads, edits, validates, and adds entries via OIL tools. Triggers: update role, change persona, edit preferences, add VIP, remove VIP, update VIP list, edit communication style, update operating rhythm, add learning entry, add correction, personalize L.C.G, configure L.C.G, onboarding, edit _lcg, update _lcg, my preferences, triage labels, team model, forecast targets, add cadence, update cadence. DO NOT USE FOR: vault entity sync from CRM (use vault-sync), reading configs as Step 0 of another workflow (use internal-vault-config-gate), vault search or customer lookup (use internal-vault-routing), syncing repo artifacts to sidekick/ (use npm run vault:sync directly)."
---

# Vault Personalization

## Purpose

Create, read, update, and validate `_lcg/` configuration files in the live Obsidian vault.  
These files control how every L.C.G workflow behaves — triage priority, team scoping, communication tone, VIP routing, cadence scheduling, and learning corrections.

This is the **authoring** skill for `_lcg/` configs. Other skills (internal-vault-config-gate, internal-vault-routing) **consume** these files; this skill **manages** them.

## Config File Inventory

| File | Purpose | Key Sections |
|------|---------|--------------|
| `_lcg/role.md` | Persona, team model, territory/seller config, forecast targets | Persona, Team Discovery, Forecast Targets |
| `_lcg/preferences.md` | Working style, tool prefs, triage label taxonomy, corrections log | Working Style, Triage Labels, Corrections Log |
| `_lcg/vip-list.md` | Tiered VIP sender list for priority routing | Tier 1, Tier 2, Tier 3 |
| `_lcg/communication-style.md` | Tone, formatting defaults, preferred phrases | Tone, Defaults, Preferred Phrases |
| `_lcg/operating-rhythm.md` | Recurring cadences, key dates, channels, SLAs | Recurring Cadences, Key Dates, Channels, Service-Level Targets |
| `_lcg/learning-log.md` | Correction entries and pattern updates | Entries |
| `_lcg/templates/*.md` | Output templates for meeting briefs, update requests, etc. | Varies by template |

## Operations

### 1. Read — Show Current Config

Read the target file and present current state.

```
oil:read_note_section  path="_lcg/<file>.md"
```

For section-level reads:
```
oil:read_note_section  path="_lcg/<file>.md"  heading="<section>"
```

### 2. Edit — Update Config Content

**Full replacement** (structural changes, rewrite):
```
1. oil:get_note_metadata  path="_lcg/<file>.md"   → obtain mtime_ms
2. oil:atomic_replace     path="_lcg/<file>.md"    expected_mtime=<mtime_ms>  content=<new content>
```

**Section append** (add entries to an existing section):
```
1. oil:get_note_metadata  path="_lcg/<file>.md"   → obtain mtime_ms
2. oil:atomic_append      path="_lcg/<file>.md"    expected_mtime=<mtime_ms>  heading="<section>"  content=<new lines>
```

### 3. Create — Initialize Missing Config

If a file doesn't exist yet (new vault or deleted file):
```
oil:create_note  path="_lcg/<file>.md"  content=<starter content>
```

Use the starter templates from `vault-starter/_lcg/` in the repo as the baseline. Read them with `read_file` if needed to get the canonical structure.

### 4. Validate — Health Check

Run after any edit to confirm the file is well-formed and non-placeholder.

**Validation checks per file:**

| File | Check | Flag if |
|------|-------|---------|
| `role.md` | Persona section has non-placeholder values | `role: general-manager` with all `(add … here)` placeholders still present |
| `role.md` | `last-refreshed` freshness | Older than 7 days or `never` |
| `role.md` | Team discovery method has matching config | `method: territory` but `accounts:` is empty |
| `preferences.md` | Triage labels present | Priority or Type sections empty |
| `preferences.md` | Corrections Log exists | Section missing entirely |
| `vip-list.md` | At least one named entry per tier | Tier contains only placeholder text |
| `communication-style.md` | Tone section non-empty | Only starter placeholder content |
| `operating-rhythm.md` | At least one cadence entry | Table has no real rows |
| `learning-log.md` | Header structure intact | Missing `## Entries` section |

Present results as:
```
✔ _lcg/role.md — valid (last-refreshed: 2026-03-28)
⚠ _lcg/vip-list.md — Tier 1 has placeholder-only entries
✔ _lcg/preferences.md — valid
✔ _lcg/communication-style.md — valid
⚠ _lcg/operating-rhythm.md — no custom cadences added
✔ _lcg/learning-log.md — valid (3 entries)
```

## Common Workflows

### Add a VIP

1. Read `_lcg/vip-list.md` → find the correct tier section.
2. Append the new entry with: **name, role, relationship context, escalation rationale, downgrade conditions**.
3. Validate the update.

### Update forecast targets

1. Read `_lcg/role.md` section `## Forecast Targets`.
2. Replace with updated values: `quarterly-quota`, `coverage-target-multiple`, `last-refreshed` (set to today).
3. Validate.

### Add a triage correction

1. Append to `_lcg/preferences.md` under `## Corrections Log`:
   ```
   - YYYY-MM-DD: <what was corrected and why>
   ```

### Add a learning entry

1. Append to `_lcg/learning-log.md` under `## Entries`:
   ```
   - YYYY-MM-DD: <what was learned>
   ```

### Add a recurring cadence

1. Read `_lcg/operating-rhythm.md` section `## Recurring Cadences`.
2. Add a new row to the table with: Cadence, Day/Time, Required Prep.
3. Validate the table structure is preserved.

### Update communication tone

1. Read `_lcg/communication-style.md`.
2. Edit the relevant section (Tone, Defaults, or Preferred Phrases).
3. Validate.

### Full health check (all configs)

1. Read all 6 core `_lcg/` files.
2. Run validation checks from the table above.
3. Present consolidated status.

## Guardrails

- **Never delete** a `_lcg/` file. If the user wants to reset, replace content with the starter template.
- **Always read before writing.** Use `oil:get_note_metadata` to obtain `mtime_ms` before any `atomic_replace` or `atomic_append`.
- **Preserve file structure.** Edits must maintain the heading hierarchy and section order. Do not reorder sections.
- **Allowed file types in `_lcg/`:** `.md` and `.html` only. Do not create other file types.
- **Templates live in `_lcg/templates/`.** Do not create template files outside this subdirectory.
- **Starter content source:** When creating a missing file, read the canonical template from `vault-starter/_lcg/` in the repo workspace. Do not synthesize structure from memory.

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| **internal-vault-config-gate** | Reads `_lcg/` as Step 0 of every workflow. This skill manages what internal-vault-config-gate reads. |
| **internal-vault-routing** | Uses vault context including `_lcg/` for entity resolution. This skill manages the configs it references. |
| **vault-sync** | Syncs CRM entities to vault. Does not touch `_lcg/` configs. |
| **triage-outlook-rules** | Cross-references `_lcg/preferences.md` and `_lcg/vip-list.md`. Edits here propagate to rule behavior. |
| **powerbi-billed-pipeline-hygiene** | Uses `_lcg/role.md` for team scoping. Changes to role config affect pipeline scope. |
