---
name: triage-outlook-rules
description: 'Manage Outlook inbox rules aligned with the L.C.G triage taxonomy (P0-P3, Type, Signal). Add/remove/update rules in scripts/setup-outlook-rules.ps1 and re-deploy via Exchange Online. Prevents rule sprawl by consolidating into a single idempotent script. Triggers: outlook rules, inbox rules, add rule, remove rule, update rule, email filter, categorize email, suppress sender, VIP sender, distro noise, rule cleanup, rule audit, setup-outlook-rules.'
argument-hint: 'Describe what rule change you need — add a customer domain, suppress a sender, change priority keywords, audit existing rules, or re-deploy'
---

# Outlook Rule Management

Manage Outlook inbox rules that auto-categorize mail and calendar items using L.C.G's triage taxonomy. All rules live in a single idempotent PowerShell script — edit the script, re-run, done.

## Purpose

Prevents rule sprawl by keeping all Outlook rules in one version-controlled script (`scripts/setup-outlook-rules.ps1`). The agent edits the configuration arrays in this script and the user re-runs it to deploy changes. Rules are prefixed with `[LCG]` so the script can safely remove and recreate its own rules without touching user-created rules.

## When to Use

- Adding a new customer or partner domain to auto-categorize
- Adding/removing VIP senders for P0 escalation handling
- Suppressing a noisy distro list or newsletter
- Adding keyword triggers for priority or type classification
- Auditing what rules currently exist
- Troubleshooting why an email wasn't categorized correctly
- After portfolio changes (new customer win, off-boarded account)

## When NOT to Use

- For one-time email searches or thread navigation → use `internal-mail-scoping`
- For calendar event categorization via Graph API → currently unsupported (categories field not exposed by Calendar MCP UpdateEvent)
- For manual Outlook client rules that don't go through Exchange Online

## Architecture

```
_lcg/preferences.md          ← Category taxonomy (P0-P3, Type, Signal)
_lcg/vip-list.md             ← Tier 1/2/3 VIP definitions
scripts/setup-outlook-rules.ps1 ← Rule definitions + deployment script
```

The script is the single source of truth. It:
1. Connects to Exchange Online (EXO V3.7+ with `-LoadCmdletHelp`)
2. Removes all existing `[LCG]`-prefixed rules (idempotent reset)
3. Recreates rules from configuration arrays
4. Rules run server-side — active even when Outlook is closed

## Rule Taxonomy Alignment

Rules map directly to `_lcg/preferences.md` labels:

| Rule Layer | Categories Applied | Source Config |
|---|---|---|
| P0 — Tier 1 VIP | `P0` | `$Tier1VIPs` array |
| P0 — Escalation Keywords | `P0`, `action-required` | `SubjectOrBodyContainsWords` |
| Customer domains | `customer`, `customer-facing` | `$CustomerDomains` array |
| Partner domains | `partner`, `customer-facing` | `$PartnerDomains` array |
| P1 — Customer meeting invites | `P1`, `prep-needed`, `customer-facing` | `$CustomerKeywords` array |
| P1 — Action required | `P1`, `action-required` | `SubjectContainsWords` |
| P2 — Internal meetings | `internal`, `P2` | `FromAddressContainsWords` |
| P2 — Enablement | `enablement`, `P2`, `fyi` | `SubjectContainsWords` |
| P2 — Ops | `ops`, `P2` | `SubjectContainsWords` |
| P3 — Newsletters/distro | `P3`, `fyi` + move to folder | `$SuppressSenders` array |
| P3 — Automated alerts | `P3`, `fyi` + move to folder | `$AutomatedSenders` array |
| FYI — CC only | `fyi` | `MyNameInCcBox` condition |

### Rule Ordering

Rules are created with ascending priority numbers. Lower number = higher priority. Categories **stack** (most rules have `StopProcessingRules = $false`) so an email from a VIP at a customer domain gets both `P0` and `customer`.

Only P3 suppression rules stop processing — once something is classified as noise, skip everything else.

## Modification Patterns

### Pattern 1: Add a New Customer Domain

**When:** New customer engagement starts.

1. Add to `$CustomerDomains` array:
   ```powershell
   $CustomerDomains = @(
       'customer-a.com',
       'customer-b.com',
       'newcustomer.com'   # ← new
   )
   ```
2. Add matching keywords to `$CustomerKeywords` for meeting invite matching:
   ```powershell
   $CustomerKeywords = @(
       'CUSTA', 'Customer A', 'CUSTB',
       'NewCust', 'NC'              # ← new
   )
   ```
3. User re-runs: `.\scripts\setup-outlook-rules.ps1`

### Pattern 2: Remove an Off-Boarded Customer

**When:** Engagement ends or account transitions to another team.

1. Remove the domain from `$CustomerDomains`
2. Remove keywords from `$CustomerKeywords`
3. User re-runs script — old rules are cleaned up automatically

### Pattern 3: Add a VIP Sender

**When:** New executive contact or leadership change.

1. Add to `$Tier1VIPs`:
   ```powershell
   $Tier1VIPs = @(
       'existing-vip@microsoft.com',
       'new-exec@microsoft.com'       # ← new
   )
   ```
2. Cross-reference with `_lcg/vip-list.md` — update both.
3. User re-runs script.

### Pattern 4: Suppress a Noisy Sender

**When:** A distro list or newsletter is creating inbox noise.

1. Add to `$SuppressSenders`:
   ```powershell
   $SuppressSenders = @(
       'noisy-distro@microsoft.com'   # ← new
   )
   ```
2. Mail from this sender will be categorized `P3` + `fyi` and moved to `_Low Priority` folder.
3. User re-runs script.

### Pattern 5: Add Priority Keywords

**When:** A new signal phrase should trigger P0 or P1 classification.

1. Edit the relevant rule's word list in Section 5 of the script.
2. Example — add "board review" as P0 keyword:
   ```powershell
   SubjectOrBodyContainsWords = @('escalation', 'executive sponsor', 'critical blocker', 'P0', 'board review')
   ```
3. User re-runs script.

### Pattern 6: Audit Existing Rules

**When:** User asks "what rules do I have?" or debugging why something wasn't categorized.

1. Read `scripts/setup-outlook-rules.ps1` Section 4 (configuration arrays) and Section 5 (rule definitions).
2. Compare against the taxonomy in `_lcg/preferences.md`.
3. Flag gaps: customers in vault notes that aren't in `$CustomerDomains`, VIPs missing from `$Tier1VIPs`.
4. Present a diff-style summary of what's covered vs. what's missing.

## Anti-Patterns

| Anti-Pattern | Why It's Wrong | Do This Instead |
|---|---|---|
| Creating rules directly in Outlook UI | Drift from script, can't version-control | Edit the script, re-run |
| Adding rules one-at-a-time via separate scripts | Rule sprawl, conflicting priorities | Add to the consolidated script |
| Using `-like "[LCG]*"` in PowerShell | `[ ]` is a wildcard character class — matches wrong rules | Use `.StartsWith($RulePrefix)` |
| Forgetting to update `$CustomerKeywords` when adding a domain | Meeting invites won't get P1 + prep-needed | Always update both arrays together |
| Setting `StopProcessingRules = $true` on type/signal rules | Prevents category stacking | Only use stop-processing on P3 suppression rules |

## Deployment Commands

```powershell
# Full deploy (remove + recreate all L.C.G rules)
.\scripts\setup-outlook-rules.ps1

# Dry run — see what would change without touching Exchange
.\scripts\setup-outlook-rules.ps1 -WhatIf

# Remove all LCG-managed rules (clean slate)
.\scripts\setup-outlook-rules.ps1 -RemoveOnly

# Connect with specific UPN
.\scripts\setup-outlook-rules.ps1 -UPN you@microsoft.com
```

## Sync Checklist

After modifying rules, verify consistency across:
- [ ] `$CustomerDomains` ↔ Type `customer` entries in `_lcg/preferences.md`
- [ ] `$PartnerDomains` ↔ Type `partner` entries in `_lcg/preferences.md`
- [ ] `$Tier1VIPs` ↔ Tier 1 entries in `_lcg/vip-list.md`
- [ ] `$CustomerKeywords` ↔ `$CustomerDomains` (every domain should have matching keywords)
- [ ] Suppressed senders aren't accidentally blocking VIP or customer mail

## EXO Compatibility Notes

- **EXO V3.7+**: Requires `-LoadCmdletHelp` on `Connect-ExchangeOnline` for `Get-Help` to work.
- **`New-InboxRule`**: No `Enabled` parameter — rules are enabled by default.
- **`-like` with brackets**: PowerShell `-like` treats `[LCG]` as a character class. Use `.StartsWith()` for literal prefix matching.
- **Server-side rules**: Created via EXO run on the server — active even when Outlook is closed. Limit is ~256 rules per mailbox.
