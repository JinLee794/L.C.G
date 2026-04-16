---
agent: Chief of Staff
description: Interactive onboarding wizard that guides a new user through configuring their L.C.G role, team discovery method, forecast targets, and vault preferences
---

# L.C.G Onboarding

Walk the user through initial L.C.G configuration so workflows are personalized from day one. This is conversational and non-technical — explain each choice in plain language.

## When to Use

- First-time setup after cloning the repo and running `node scripts/init.js`
- When a user wants to reconfigure their role, team, or targets
- Triggered by: "onboarding", "set up L.C.G", "configure my role", "who am I in L.C.G"

## Step 1 — Welcome

> Welcome to L.C.G! I'm going to help you set up your personal configuration so L.C.G's workflows match how you work. This takes about 5 minutes and you can change any of these settings later.
>
> Everything we configure here lives in your Obsidian vault under `_lcg/` — you can edit those files directly anytime.

## Step 2 — Role Selection

Ask the user:

> **What best describes your role?**
>
> 1. **General Manager / GM** — You manage a portfolio of opportunities, coach sellers, run forecast calls, and prepare leadership updates.
> 2. **CSAM / Specialist** — You execute on milestones, manage customer deliveries, and track workload commitments.
> 3. **M1 Manager** — You manage a team of CRMs or specialists and review their milestone health weekly.
>
> (Pick a number, or describe your role in your own words.)

Based on their answer, determine:
- `role`: general-manager | csam | specialist | m1-manager
- `primary-entity`: opportunity (GM) | milestone (CSAM/Specialist/M1)
- `pipeline-view`: stage-funnel (GM) | milestone-timeline (CSAM/Specialist/M1)

## Step 3 — Industry

Ask the user:

> **What industry or segment do you cover?**
>
> For example: Healthcare, Financial Services, Retail, Manufacturing, Education, Public Sector, etc.
>
> This helps L.C.G scope CRM queries, PBI reports, and account filters to your segment. If you cover multiple industries, list the primary one.

Store the answer as `industry` in `_lcg/role.md` under `## Persona`. Use the canonical name (e.g., "Healthcare" not "HLS" or "Health and Life Sciences") — L.C.G uses this value to filter CRM and PBI queries.

**Persist immediately after this step.** Read `_lcg/role.md` via `oil:get_note_metadata` + `oil:read_note_section`, add `- industry: {value}` to the Persona section, and write back via `oil:atomic_replace`. Do not wait until the end of onboarding — downstream skills (pipeline hygiene, PBI queries) need industry scope even if the user abandons the wizard early.

## Step 4 — Team Discovery

Ask the user:

> **How should L.C.G find "your team" when running portfolio reviews or coaching briefs?**
>
> 1. **By territory** — I own a set of named accounts or a territory segment.
> 2. **By seller list** — I manage specific sellers and want to review their pipelines.
> 3. **By direct reports** — L.C.G can discover my team from the CRM org hierarchy automatically.
> 4. **Just me** — I only review my own pipeline.
>
> (Pick a number.)

Based on their answer:
- If **territory**: Ask for a list of account names or TPIDs. Write them to `_lcg/role.md` under `### Territory`.
- If **seller list**: Ask for seller names or aliases. Write them to `_lcg/role.md` under `### Seller List`.
- If **direct reports**: No additional input needed — note that L.C.G resolves this from CRM.
- If **just me**: Set method to `self`.

## Step 5 — Forecast Targets

Ask the user:

> **Do you track a quarterly quota or pipeline coverage target?**
>
> If so, L.C.G can flag coverage gaps during forecast prep. You can also skip this and L.C.G will pull targets from CRM when available.
>
> - **Quarterly quota** (in dollars, e.g., $2M): ___
> - **Coverage target multiple** (default is 3×): ___

If they provide values, write to `_lcg/role.md` under `## Forecast Targets`.
If they skip, leave defaults (`quarterly-quota: 0`, `coverage-target-multiple: 3`) and note that L.C.G will attempt to refresh from CRM weekly.

## Step 6 — VIP List Quick Check

> L.C.G prioritizes items from VIP senders. You have a VIP list at `_lcg/vip-list.md`.
>
> Want to add anyone to your Tier 1 (always URGENT) or Tier 2 (always HIGH) list right now? You can also do this later by editing the file directly.

If they provide names, update `_lcg/vip-list.md` via OIL tools.

## Step 7 — Operating Rhythm Confirmation

Read `_lcg/operating-rhythm.md` and present the default cadences:

> Here's your default operating rhythm. Let me know if any of these need adjusting:
>
> - **Morning triage**: Mon–Fri 7:00 AM
> - **Pipeline review**: Wednesday 2:00 PM
> - **Forecast lock**: Last business day 1:00 PM
> - **Weekly planning reset**: Friday 3:00 PM
>
> You can change these anytime in `_lcg/operating-rhythm.md`.

## Step 8 — Summary & Next Steps

Summarize what was configured and where the files live:

> **Your L.C.G configuration is set!** Here's what I saved:
>
> | Setting | Value | File |
> |---------|-------|------|
> | Role | {role} | `_lcg/role.md` |
> | Industry | {industry} | `_lcg/role.md` |
> | Team method | {method} | `_lcg/role.md` |
> | Primary entity | {entity} | `_lcg/role.md` |
> | Quota | {quota} | `_lcg/role.md` |
> | Coverage target | {target}× | `_lcg/role.md` |
>
> **Where to edit later:**
> - Role & team: `_lcg/role.md`
> - VIP list: `_lcg/vip-list.md`
> - Triage labels & preferences: `_lcg/preferences.md`
> - Operating rhythm: `_lcg/operating-rhythm.md`
> - Communication style: `_lcg/communication-style.md`
>
> **Ready to go?** Try `/morning-triage` to see L.C.G in action, or `/schedule-automations` to set up recurring tasks.

## Persistence Rules

- All writes go through OIL tools (never `create_file`).
- Use `oil:get_note_metadata` → `oil:atomic_replace` for existing files.
- Use `oil:create_note` for new files.
- If the vault is not yet bootstrapped (files don't exist), instruct the user to run `node scripts/bootstrap-lcg-vault.js` first.

## Guardrails

- Never send email or post to Teams.
- Never execute CRM writes.
- This is a configuration workflow only — no data retrieval beyond checking file existence.
