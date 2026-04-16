# Outlook Draft Patterns

Rules for creating follow-up email drafts from pipeline hygiene results.

## When to Create Drafts

Only when the user explicitly requests it (e.g., "with drafts", "send follow-ups", "create emails").

## Delegation to @m365-actions

**Draft creation is delegated to the `@m365-actions` subagent.** The parent agent:
1. Composes all draft payloads (resolved names, HTML bodies, subjects, recipients) from exception results
2. Hands off the complete payload array to `@m365-actions`
3. The subagent creates drafts via `mail:CreateDraftMessage` and returns `webLink` URLs

The parent does NOT call `mail:CreateDraftMessage` directly. This isolates M365 write operations and keeps the parent's context focused on PBI analysis.

## Draft Grouping

Group by owner when an owner appears in multiple exceptions. One draft per owner covering all their flagged opportunities.

## Content Rules

| Field | Rule |
|---|---|
| **contentType** | Always `"HTML"`. |
| **body** | Clean HTML with inline styles. Never wrap in `<![CDATA[...]]>` or XML tags. |
| **to** | Resolved owner email. See Owner Resolution below. |
| **subject** | `<Priority Label>: <Opp Name or Owner Theme> — <reason>` |

## Owner Resolution

PBI returns `Opportunity[Opportunity Owner]` as a Microsoft alias. **Resolve every alias to a display name before drafting.**

### Batch Resolution (preferred)

Collect all unique owner aliases from the combined exception detail results (Step 2), then resolve them in bulk:

1. **Batch vault lookup:** Search `People/` notes for all aliases in one pass. Use `oil:search_vault` with a query covering all aliases, or check known alias patterns. Cache every hit.
2. **Batch Graph fallback:** For any aliases not found in vault, construct a single `mail:SearchMessages` query (e.g., `from:{alias1}@microsoft.com OR from:{alias2}@microsoft.com`, limit:5) to resolve display names. One call covers multiple misses.
3. **Fallback:** For any remaining unresolvable aliases, greet with "Hi," (no name). Never use a raw alias in greetings or body text.
4. **Cache for session:** Store all resolved alias → display name mappings. Do not re-resolve within the same run.

> **⚠️ Do NOT resolve aliases one-at-a-time.** The old pattern of N sequential vault lookups + N sequential mail searches for N owners is an N+1 anti-pattern. Always batch.

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

`Opportunity[CRM URL]` provides direct MSX deep links. **Every opportunity in a draft MUST be hyperlinked to its CRM URL.** If CRM URL is missing, reference by name and append "(CRM link unavailable)".

## Subject Patterns

| Severity | Pattern | Example |
|---|---|---|
| 🔴 CRITICAL | `URGENT: <Opp Name> — <reason>` | `URGENT: Microsoft Federal — Past-Due Stage 3 Opportunity` |
| 🟡 HIGH (stale) | `Action Needed: <Opp/Account> — <N> Days in Stage` | `Action Needed: FY26 AT&T MACC — 446 Days in Stage` |
| 🟡 HIGH (at-risk) | `Forecast Review: <Account> — Committed At Risk (<$value>)` | `Forecast Review: EY GLOBAL — Committed At Risk ($2.07B)` |
| 🟠 MEDIUM (fields) | `CRM Hygiene: Missing <Field> on Active Opportunities` | `CRM Hygiene: Missing Sales Play Field on Active Opportunities` |
| 🟠 MEDIUM (desc) | `Data Hygiene: Missing Forecast Comments on High-Value Opps` | |

## Body Template (HTML)

```html
<div style="font-family: Segoe UI, Calibri, Arial, sans-serif; font-size: 14px; color: #333;">
  <p>Hi <strong>{First Name or "team"}</strong>,</p>

  <p>{1-2 sentence context: what triggered this email and why it matters.}</p>

  <p>The following opportunity requires attention:</p>

  <table style="border-collapse: collapse; width: 100%; margin: 12px 0;">
    <thead>
      <tr style="background-color: #f4f4f4; text-align: left;">
        <th style="padding: 8px; border: 1px solid #ddd;">Opportunity</th>
        <th style="padding: 8px; border: 1px solid #ddd;">Account</th>
        <th style="padding: 8px; border: 1px solid #ddd;">Stage</th>
        <th style="padding: 8px; border: 1px solid #ddd;">Revenue</th>
        <th style="padding: 8px; border: 1px solid #ddd;">Flag</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd;"><a href="{CRM URL}">{Opp Name}</a></td>
        <td style="padding: 8px; border: 1px solid #ddd;">{Account}</td>
        <td style="padding: 8px; border: 1px solid #ddd;">{Stage} ({Days in Stage}d)</td>
        <td style="padding: 8px; border: 1px solid #ddd;">{$Revenue}</td>
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

  <p>You can update these records directly in <a href="{CRM URL}">MSX</a>.</p>

  <p style="margin-top: 24px;">
    Best regards,<br/>
    <strong>{Sender Full Name}</strong><br/>
    <span style="color: #666;">{Sender Title}</span><br/>
    <span style="color: #666;">{sender-alias}@microsoft.com</span>
  </p>
</div>
```

**Multi-opportunity drafts:** Add one row per opp in the table. Each name linked to its CRM URL.

## Ask Patterns by Exception Type

| Exception | Asks |
|---|---|
| Stage staleness | Current engagement status, next milestone date, stage accuracy |
| Close-date drift | Corrected close date, current deal status, forecast recommendation validity |
| Missing fields | Update the specific field(s) in CRM |
| Committed at risk | Blockers and mitigation, expected resolution date, forecast adjustment needed |
| Concentration risk | _(Usually no draft — informational only)_ |

## webLink Requirement

Every draft MUST capture `data.webLink` from `mail:CreateDraftMessage` response:

```markdown
## Outlook Drafts Created

| # | Subject | To | Opps Covered | Draft Link |
|---|---|---|---|---|
| 1 | <subject> | <name> (<alias>) | [Opp 1](CRM URL), [Opp 2](CRM URL) | [Open in Outlook](<webLink>) |
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
| 🔴 CRITICAL | `🔴 Past-Due Stage 3+` or `🔴 Close-Date Overdue` |
| 🟡 HIGH | `🟡 Stale {N}d` or `🟡 Committed At Risk` |
| 🟠 MEDIUM | `🟠 Missing {Field}` or `🟠 Stage Inflation` |
