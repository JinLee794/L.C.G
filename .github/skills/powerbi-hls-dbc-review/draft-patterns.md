# Draft Patterns — HLS DBC Outlook Follow-Ups

> Loaded on-demand by `powerbi-hls-dbc-review` Step 5 only when the user requests "with drafts" or "draft follow-ups".
> Drafts are CREATED, never sent. Always delegate `mail:CreateDraftMessage` execution to `@m365-actions` with pre-resolved recipients.

## When to Draft

For every CRITICAL or HIGH item from § Risk Summary. MEDIUM items: only if user explicitly asks.

## Recipient Resolution

1. Collect unique `OpptyOwnerAlias` from CRITICAL + HIGH items.
2. **Single vault `People/` search** for matches → resolve to UPN.
3. For misses: **single batched** `mail:SearchMessages` query — `from:<alias1>@microsoft.com OR from:<alias2>@microsoft.com ...` — extract sender UPN from results.
4. If still unresolved: skip the draft and surface "⚠️ Could not resolve <alias>" in Recommended Actions instead.

## Subject Templates

| Tier | Subject pattern |
|---|---|
| CRITICAL | `[HLS DBC] Help needed on <OpportunityName>` |
| HIGH | `[HLS DBC] Quick check-in on <OpportunityName>` |
| Stale > 60d | `[HLS DBC] Stale milestone on <OpportunityName> — status?` |
| Negative WoW pipe | `[HLS DBC] Pipeline movement on <OpportunityName>` |

## HTML Body Template (single opp)

```html
<p>Hi {{FirstName}},</p>

<p>Looking at the HLS Database Catalyst portfolio this week and wanted to flag <strong>{{OpportunityName}}</strong> at <strong>{{CRMAccountName}}</strong>:</p>

<ul>
  <li><strong>Stage:</strong> {{SalesStageName}} ({{DaysInSalesStage}} days)</li>
  <li><strong>Pipe:</strong> {{PipeACR}} (Committed: {{PipeCommittedACR}})</li>
  <li><strong>Est. completion:</strong> {{MilestoneCompletionDateEstimated}}</li>
  <li><strong>Status:</strong> {{MilestoneStatus}}</li>
  {{#if RiskBlockerDetails}}<li><strong>Risk:</strong> {{RiskBlockerDetails}}</li>{{/if}}
  {{#if HelpNeeded}}<li><strong>Help needed:</strong> {{HelpNeeded}}</li>{{/if}}
</ul>

<p>{{TierAsk}}</p>

<p>Open in CRM: <a href="{{CRMLink}}">{{OpportunityName}}</a></p>

<p>Thanks,<br/>STU</p>
```

### `TierAsk` clauses

| Tier | Ask |
|---|---|
| CRITICAL | "Can you give me a quick read on what's blocking, and whether you need executive air cover or partner / specialist help?" |
| HIGH | "Where do you need help to keep this moving?" |
| Stale > 60d | "Is this still active? If yes, what's the next gate? If no, OK to close-lost or re-stage?" |
| Negative WoW pipe | "Saw the pipeline number drop this week — was that intentional re-forecast or a slip? Anything I can help unblock?" |

## HTML Body Template (multi-opp digest for one owner)

If a single owner has 2+ flagged items, send ONE consolidated email instead of multiple:

```html
<p>Hi {{FirstName}},</p>

<p>Quick HLS Database Catalyst check-in — flagging {{Count}} items in your book this week:</p>

<table border="1" cellpadding="6" cellspacing="0">
  <thead>
    <tr><th>Tier</th><th>Opportunity</th><th>Account</th><th>Stage</th><th>Pipe</th><th>Issue</th><th>Link</th></tr>
  </thead>
  <tbody>
    {{#each items}}
    <tr>
      <td>{{Tier}}</td>
      <td>{{OpportunityName}}</td>
      <td>{{CRMAccountName}}</td>
      <td>{{SalesStageName}}</td>
      <td>{{PipeACR}}</td>
      <td>{{IssueSummary}}</td>
      <td><a href="{{CRMLink}}">CRM</a></td>
    </tr>
    {{/each}}
  </tbody>
</table>

<p>Where do you need help? Happy to jump on a 15-min sync if useful.</p>

<p>Thanks,<br/>STU</p>
```

## Delegation Payload to `@m365-actions`

For each draft, hand off:

```json
{
  "to": "<resolved UPN>",
  "subject": "<from subject template>",
  "contentType": "HTML",
  "body": "<rendered HTML>",
  "importance": "Normal",
  "saveToSentItems": false
}
```

`@m365-actions` calls `mail:CreateDraftMessage` and returns the `webLink` for each draft. The skill records these in § 10 of [output-template.md](output-template.md).

## Guardrails

- **Never send.** `mail:CreateDraftMessage` only — never `mail:SendDraftMessage` or `mail:SendEmailWithAttachments`.
- **Never to external.** All recipients must be `@microsoft.com`.
- **Never CC distros.** No CC, no BCC.
- **HTML always.** `contentType: "HTML"`.
- **Every draft surfaces its `webLink`** in the output — required for auditability per copilot-instructions.md M365 Source Linking Policy.
- One draft per owner (consolidated digest) preferred over per-opp blasts when count ≥ 2.
- **Tone:** match `_lcg/communication-style.md` — direct, warm, professional. No generic AI phrasing.
