# M365 Data Helpers

Reusable Node.js CLI scripts for normalizing, scoring, and formatting M365 data from MCP tool responses. Eliminates inline code generation during agent workflows.

## Scripts

| Script | Purpose | Input | Output |
|---|---|---|---|
| `normalize-calendar.js` | Normalize raw `ListCalendarView` JSON | MCP calendar JSON | Compact event array |
| `score-meetings.js` | Priority-score events + detect conflicts | Normalized calendar JSON | Scored events + conflict groups |
| `normalize-mail.js` | Normalize raw `SearchMessages` JSON | MCP mail JSON | Compact mail items + summary |
| `build-workiq-query.js` | Build properly scoped WorkIQ prompts | CLI flags | Structured query text |
| `classify-sql-pipeline.js` | Classify PBI SQL600 pipeline by workload tier | PBI Q1+Q2 JSON | Tiered SQL opps + gap accounts |
| `audit-sales-play.js` | Cross-ref classified pipeline with CRM sales play + detect wins | Classified JSON + CRM JSON (+ optional previous + normalized mail) | Exception report (JSON or Markdown) with wins |
| `generate-next-steps.js` | LLM-generated SQL modernization next steps per account | SQL600 data JSON (post-enrich) | Mutated JSON with `NextStep` per account + `_aiInsight.modernizationOutlook` |
| `resolve-deal-teams.js` | Join CRM bulk data into compact account summaries with named deal team roles and risk signals | Combined CRM JSON (opps + deal teams + milestones + systemusers) | Grouped accounts with resolved names, signals, summary |
| `normalize-aio.js` | Normalize raw AIO PBI daxQueries response for SQL600 HLS | PBI daxQueries JSON (QA-BULK + QA2) | `{ aioAccountMoM, aioBudgetAttainment, aioServiceBreakdown }` |

## Common Workflow

### Calendar (morning triage)
```bash
# 1. Have @m365-actions save raw ListCalendarView JSON to file
# 2. Normalize
node scripts/helpers/normalize-calendar.js /tmp/cal-raw.json --tz America/Chicago --user-email user@example.com > /tmp/cal-normalized.json

# 3. Score + detect conflicts
node scripts/helpers/score-meetings.js /tmp/cal-normalized.json --vip-list "$VAULT_DIR/_lcg/vip-list.md" > /tmp/cal-scored.json
```

### Mail (morning triage)
```bash
# 1. Have @m365-actions save raw SearchMessages JSON to file
# 2. Normalize + classify
node scripts/helpers/normalize-mail.js /tmp/mail-raw.json --vip-list "$VAULT_DIR/_lcg/vip-list.md" > /tmp/mail-normalized.json
```

### WorkIQ (scoped queries)
```bash
# Build a properly scoped query instead of ad-hoc prompts
node scripts/helpers/build-workiq-query.js \
  --goal "action items from PriorAuth sync" \
  --sources meetings,chats \
  --entities "Jane Doe,Contoso" \
  --time-window 7d \
  --topic "PriorAuth" \
  --output-shape actions
```

## Pipeline Pattern

Scripts compose via pipes:
```bash
cat /tmp/cal-raw.json \
  | node scripts/helpers/normalize-calendar.js --tz America/Chicago \
  | node scripts/helpers/score-meetings.js --vip-list "$VAULT_DIR/_lcg/vip-list.md" \
  > /tmp/cal-scored.json
```

### SQL600 Tagging Audit
```bash
DATE=$(date +%F)

# 1. Agent saves PBI Q1+Q2 results as { accounts: [...], pipeline: [...] }
# 2. Classify SQL workloads + detect gap accounts
node scripts/helpers/classify-sql-pipeline.js /tmp/sql600-pipeline-$DATE.json \
  > /tmp/sql600-classified-$DATE.json

# 3. Agent reads .summary.uniqueOppIds from classified output
#    and does targeted CRM lookups → saves to /tmp/sql600-crm-$DATE.json

# 4. Cross-reference sales plays and produce audit report
node scripts/helpers/audit-sales-play.js \
  --pipeline /tmp/sql600-classified-$DATE.json \
  --previous /tmp/sql600-classified-$PREV_DATE.json \
  --crm /tmp/sql600-crm-$DATE.json \
  --mail /tmp/mail-normalized-$DATE.json \
  --format md \
  --output /tmp/sql600-audit-$DATE.md

# --previous detects uncommitted -> committed transitions (wins)
# --mail correlates wins to possible winwire inbox evidence
```

### Engagement Intake (deal team resolution)
```bash
DATE=$(date +%F)

# 1. Agent bulk-fetches from CRM (3 stages):
#    Stage A: get_my_active_opportunities → all opps
#    Stage B: manage_deal_team per opp (5 concurrent) + get_milestones (batches of 10)
#    Stage C: crm_query on systemusers (OR-chain 15 GUIDs, all parallel)
#    Agent saves combined result:
#    { "opportunities": [...], "dealTeams": {"<oppId>": [...]}, "milestones": [...], "systemusers": [...] }

# 2. Join deal teams + compute signals (no API calls, instant)
node scripts/helpers/resolve-deal-teams.js /tmp/intake-opps-$DATE.json \
  > /tmp/intake-resolved-$DATE.json

# 3. Agent reads compact output (~50 lines for 43 accounts)
#    Applies engagement-routing-rules.md per account
#    Formats per next-steps-output-shape.md

# Filter options:
node scripts/helpers/resolve-deal-teams.js /tmp/intake-opps-$DATE.json --filter gap     # zero-pipeline only
node scripts/helpers/resolve-deal-teams.js /tmp/intake-opps-$DATE.json --filter at-risk  # at-risk only
```

### AIO Cross-Reference (SQL600 HLS)
```bash
DATE=$(date +%F)

# 1. Agent sends QA-BULK + QA2 as a single daxQueries call to AIO model
#    Saves raw response to /tmp/aio-raw-$DATE.json

# 2. Normalize: splits bulk into MoM + budget, tags pillar breakdown
node scripts/helpers/normalize-aio.js /tmp/aio-raw-$DATE.json --pretty \
  > /tmp/aio-normalized-$DATE.json

# 3. Merge into existing SQL600 data file for report generation
node scripts/helpers/normalize-aio.js /tmp/aio-raw-$DATE.json \
  --merge /tmp/sql600-data-$DATE.json

# 4. Generate HTML report (now has AIO data injected)
node scripts/helpers/generate-sql600-report.js /tmp/sql600-data-$DATE.json
```
