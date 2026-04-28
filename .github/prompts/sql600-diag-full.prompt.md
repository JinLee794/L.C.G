---
agent: pbi-analyst
description: "SQL600 diagnostic suite: runs all three diagnostic checks (auth/schema, data sanity, AIO cross-reference) in sequence and produces a consolidated health report. Use for full regression testing before a readout run."
model: Claude Opus 4.6 (copilot)
---
# SQL600 Diagnostic — Full Suite

Run all SQL600 diagnostic checks in sequence and produce a consolidated health report. Use this before a readout run to validate the full data pipeline, or after encountering unexpected results.

## ⛔ Tool Restrictions

**NEVER call `GetSemanticModelSchema` or `GetReportMetadata` against any model in this suite.** Both SQL600 and AIO models' schema responses are too large for the MCP tool to parse (known `MPC -32603` error at `verifiedAnswers[0].Bindings.Values`). All schema validation uses targeted DAX `SELECTCOLUMNS` / `TOPN` queries instead. Pass this restriction to the `pbi-analyst` subagent.

## Diagnostic Modules

Run in order — each gates the next:

| # | Module | Prompt | Gates |
|---|---|---|---|
| 1 | **Auth & Schema** | `sql600-diag-auth-schema` | If auth fails → stop. If schema changes → note and continue. |
| 2 | **Data Sanity** | `sql600-diag-data-sanity` | If critical queries fail → stop. If data looks stale → note. |
| 3 | **AIO Cross-Reference** | `sql600-diag-aio` | Optional — skip if user only needs SQL600 model validation. |
| 4 | **Cross-Model Consistency** | `sql600-diag-consistency` | Only run if modules 1–3 passed. |

## Quick Mode

If the user says "quick check" or "smoke test", run only these core tests:

1. **Auth** — Test 1 + Test 2 from `sql600-diag-auth-schema`
2. **RLS** — Test 7 (HLS account count) from `sql600-diag-auth-schema`
3. **Q1 Snapshot** — T1 from `sql600-diag-data-sanity`
4. **Q10-DETAIL Pillar** — T6 from `sql600-diag-data-sanity`
5. **AIO QA2 Duplication** — Test 3 from `sql600-diag-aio` (10 TPIDs only)

This covers the most common failure modes in ~5 PBI calls.

## Execution Notes

- Batch queries using `daxQueries` arrays wherever possible to minimize PBI round-trips
- SQL600 model queries (Tests 1–7 auth/schema + T1–T11 data) can be batched aggressively
- AIO model queries must use a separate `ExecuteQuery` call (different model ID)
- If any auth test fails, skip all downstream tests for that model and report the auth failure
- Record wall-clock time for each batch to detect rate limiting

## Consolidated Output

After all modules complete, produce this summary:

```
# SQL600 Diagnostic Report
Date: <today>
Duration: <total time>

## Overall Status: ✅ HEALTHY / ⚠️ DEGRADED / ❌ BROKEN

### Module Results
| Module | Tests | Pass | Warn | Fail | Status |
|---|---|---|---|---|---|
| Auth & Schema | <n> | <n> | <n> | <n> | ✅/⚠️/❌ |
| Data Sanity | <n> | <n> | <n> | <n> | ✅/⚠️/❌ |
| AIO Cross-Ref | <n> | <n> | <n> | <n> | ✅/⚠️/❌/SKIPPED |
| Consistency | <n> | <n> | <n> | <n> | ✅/⚠️/❌/SKIPPED |

### Critical Findings
<numbered list of ❌ items requiring action>

### Warnings
<numbered list of ⚠️ items to be aware of>

### Recommendations
1. <most important action>
2. <second action>
...

### Readout Readiness
- **Full readout safe?** YES / YES (skip AIO) / NO — <reason>
- **Which sections are affected?** <list any sections with degraded data>
- **Workarounds:** <if any sections can use fallback data sources>
```

## When to Run This

- Before the first readout of the week (Monday morning)
- After encountering unexpected BLANKs, wrong values, or errors in a readout
- After hearing about a PBI model refresh or schema change
- When onboarding a new user to validate their RLS access
- Monthly regression check
