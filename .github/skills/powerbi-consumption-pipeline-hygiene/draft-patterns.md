# Outlook Draft Patterns — Consumption Pipeline Hygiene

Rules for creating follow-up email drafts from consumption pipeline hygiene results.

## When to Create Drafts

Only when the user explicitly requests it (e.g., "with drafts", "send follow-ups", "create emails").

## Draft Grouping

Group by owner when an owner appears in multiple exceptions. One draft per owner covering all their flagged items.

## Content Rules

| Field | Rule |
|---|---|
| **contentType** | Always `"HTML"`. |
| **body** | Clean HTML with inline styles. Never wrap in `<![CDATA[...]]>` or XML tags. |
| **to** | Resolved owner email. See Owner Resolution below. |
| **subject** | `<Priority Label>: <Account or Owner Theme> — <reason>` |

## Owner Resolution

PBI returns `'✽ Pipeline'[OpportunityOwner]` and `'✽ Pipeline'[MilestoneOwner]` as Microsoft aliases. **Resolve every alias to a display name before drafting.**

### Resolution Sequence

1. **Vault People/ lookup:** Check `People/<name>.md` — `aliases` or `email` frontmatter may contain the alias. Use `file.name` as display name.
2. **Microsoft Graph:** If vault misses, call `mail:SearchMessages` with `from:{alias}@microsoft.com` (limit:1) to get sender display name.
3. **Fallback:** If unresolvable, greet with "Hi," (no name). Never use a raw alias in greetings or body text.

### Rules

- `to`: Always `{alias}@microsoft.com`.
- Greeting: `Hi <First Name>,` using resolved display name. For grouped multi-owner drafts: "Hi team,".
- Cache resolved names for session to avoid repeated lookups.

## Sender Signature

Every draft includes a signature. Resolve sender identity from user profile.

```
Best regards,
<Sender Full Name>
<Sender Title> (from vault _lcg/role.md or Graph; omit if unknown)
<sender-alias>@microsoft.com
```

## CRM Deep Links

`'✽ Pipeline'[OpportunityLink]` and `'✽ Pipeline'[MilestoneLink]` provide direct MSX deep links. **Every opportunity or milestone in a draft MUST be hyperlinked.** If link is missing, reference by name and append "(CRM link unavailable)".

## Subject Patterns

| Severity | Pattern | Example |
|---|---|---|
| 🔴 CRITICAL | `URGENT: <Account> — <reason>` | `URGENT: Contoso Health — ACR Declining 15% MoM, No Pipeline` |
| 🟡 HIGH (stale) | `Action Needed: <Account> — <N> Days in Stage` | `Action Needed: Blue KC — FY26 Optimization Opp 87 Days in Stage` |
| 🟡 HIGH (milestone) | `Milestone Overdue: <Account> — <milestone name>` | `Milestone Overdue: Humana — Cloud Migration Phase 2` |
| 🟡 HIGH (help-needed) | `Help Request: <Account> — <milestone name>` | `Help Request: BCBS — Data Platform Blockers` |
| 🟠 MEDIUM (coverage) | `Pipeline Gap: <Account> — $<ACR> with No Active Pipeline` | `Pipeline Gap: Aetna — $1.2M ACR with No Active Pipeline` |
| 🟠 MEDIUM (milestoneless) | `Execution Gap: <Account> — Pipeline with No Milestones` | `Execution Gap: Cigna — $450K Pipeline, No Milestones` |

## Body Template (HTML)

```html
<div style="font-family: Segoe UI, Calibri, Arial, sans-serif; font-size: 14px; color: #333;">
  <p>Hi <strong>{First Name or "team"}</strong>,</p>

  <p>{1-2 sentence context: what triggered this email and why it matters.}</p>

  <p>The following item(s) require attention:</p>

  <table style="border-collapse: collapse; width: 100%; margin: 12px 0;">
    <thead>
      <tr style="background-color: #f4f4f4; text-align: left;">
        <th style="padding: 8px; border: 1px solid #ddd;">Item</th>
        <th style="padding: 8px; border: 1px solid #ddd;">Account</th>
        <th style="padding: 8px; border: 1px solid #ddd;">Type</th>
        <th style="padding: 8px; border: 1px solid #ddd;">Value</th>
        <th style="padding: 8px; border: 1px solid #ddd;">Flag</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd;"><a href="{CRM Link}">{Opp/Milestone Name}</a></td>
        <td style="padding: 8px; border: 1px solid #ddd;">{Account}</td>
        <td style="padding: 8px; border: 1px solid #ddd;">{Opportunity / Milestone}</td>
        <td style="padding: 8px; border: 1px solid #ddd;">{$PipelineACR or ACR}</td>
        <td style="padding: 8px; border: 1px solid #ddd;">{Exception type}</td>
      </tr>
    </tbody>
  </table>

  <p><strong>Requested by end of week:</strong></p>
  <ol>
    <li>{Ask 1}</li>
    <li>{Ask 2}</li>
    <li>{Ask 3}</li>
  </ol>

  <p>You can update these records directly in <a href="{CRM Link}">MSX</a>.</p>

  <p style="margin-top: 24px;">
    Best regards,<br/>
    <strong>{Sender Full Name}</strong><br/>
    <span style="color: #666;">{Sender Title}</span><br/>
    <span style="color: #666;">{sender-alias}@microsoft.com</span>
  </p>
</div>
```

**Multi-item drafts:** Add one row per item in the table. Each name linked to its CRM URL.

## Ask Patterns by Exception Type

| Exception | Asks |
|---|---|
| Stale opportunity (>60d) | Current engagement status, next milestone date, stage accuracy |
| Past-due milestone | Updated completion estimate, blockers, need for reassignment |
| Help-needed milestone | Specific help needed, escalation path, timeline expectation |
| Milestone-less opportunity | Add milestones to track execution, or confirm if opp should be closed |
| Pipeline coverage gap (declining ACR) | Is customer engaged? Any planned workloads? Pipeline expansion plan? |
| Concentration risk | _(Usually no draft — informational only)_ |

## webLink Requirement

Every draft MUST capture `data.webLink` from `mail:CreateDraftMessage` response:

```markdown
## Outlook Drafts Created

| # | Subject | To | Items Covered | Draft Link |
|---|---|---|---|---|
| 1 | <subject> | <name> (<alias>) | [Item 1](CRM Link), [Item 2](CRM Link) | [Open in Outlook](<webLink>) |
```

## Revenue Formatting

| Range | Format | Example |
|---|---|---|
| < $1M | `$750K` | `$454.8K` |
| $1M–$999M | `$1.70M` | `$42.5M` |
| ≥ $1B | `$1.70B` | `$2.07B` |

## Severity Indicators

| Severity | Flag Text |
|---|---|
| 🔴 CRITICAL | `🔴 Declining ACR + No Pipeline` or `🔴 Declining + Stale >90d` |
| 🟡 HIGH | `🟡 Stale {N}d` or `🟡 Past-Due Milestone` or `🟡 Help Needed` |
| 🟠 MEDIUM | `🟠 No Pipeline Coverage` or `🟠 No Milestones` |
