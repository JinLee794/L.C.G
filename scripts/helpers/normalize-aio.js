#!/usr/bin/env node

/**
 * normalize-aio.js — AIO PBI response normalizer for SQL600 HLS
 *
 * Takes raw Power BI daxQueries response (QA-BULK + QA2 results)
 * and produces the three arrays expected by generate-sql600-report.js:
 *   - aioAccountMoM[]
 *   - aioBudgetAttainment[]
 *   - aioServiceBreakdown[]
 *
 * Also handles single-query fallback (QA-BULK only, no QA2 data).
 *
 * Usage:
 *   node scripts/helpers/normalize-aio.js .copilot/docs/aio-raw.json
 *   cat .copilot/docs/aio-raw.json | node scripts/helpers/normalize-aio.js
 *   node scripts/helpers/normalize-aio.js .copilot/docs/aio-raw.json --merge .copilot/docs/sql600-data.json
 *
 * Options:
 *   --merge <path>   Merge AIO arrays into an existing SQL600 data JSON file (mutates in place)
 *   --pretty         Pretty-print JSON output (default: compact)
 *   --check          After merge, validate TPID coverage against SQL600 data and print warnings
 *   --quarters <n>   Keep only the last N quarters of MoM data (default: all)
 *   --top <n>        Keep only the top N accounts by total ACR (default: all)
 *
 * Input formats accepted:
 *   1. daxQueries array response: { results: [ {tables:[...]}, {tables:[...]} ] }
 *   2. Single ExecuteQuery response: { results: [ {tables:[...]} ] }
 *   3. Pre-extracted rows: [ [...rows1], [...rows2] ]  (array of arrays)
 *   4. Wrapped PBI MCP response: { content: [{text: "..."}] } — auto-unwraps text JSON
 *
 * Output: JSON object with { aioAccountMoM, aioBudgetAttainment, aioServiceBreakdown }
 */

import { readFileSync, writeFileSync } from "node:fs";

// ── Dollar-string parser ────────────────────────────────────────────
// PBI returns ACR values as dollar-formatted strings ("$2,874,558").
// Parse to number so arithmetic works correctly.
function parseDollar(v) {
  if (v == null || v === '' || v === '—') return 0;
  if (typeof v === 'number') return v;
  return parseFloat(String(v).replace(/[$,()]/g, '')) * (String(v).includes('(') ? -1 : 1) || 0;
}

// ── Parse args ──────────────────────────────────────────────────────
const args = process.argv.slice(2);
let inputFile = null;
let mergeFile = null;
let pretty = false;
let check = false;
let maxQuarters = 0;  // 0 = all
let topN = 0;         // 0 = all

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--merge" && args[i + 1]) {
    mergeFile = args[++i];
  } else if (args[i] === "--pretty") {
    pretty = true;
  } else if (args[i] === "--check") {
    check = true;
  } else if (args[i] === "--quarters" && args[i + 1]) {
    maxQuarters = parseInt(args[++i], 10) || 0;
  } else if (args[i] === "--top" && args[i + 1]) {
    topN = parseInt(args[++i], 10) || 0;
  } else if (!args[i].startsWith("-")) {
    inputFile = args[i];
  }
}

// ── Read input ──────────────────────────────────────────────────────
let rawText;
if (inputFile) {
  rawText = readFileSync(inputFile, "utf8");
} else {
  rawText = readFileSync("/dev/stdin", "utf8");
}

// ── Parse and extract result sets ───────────────────────────────────

/**
 * PBI column names come back as "TableName ColumnName" (space-separated).
 * Normalize to just the column portion, or the alias if it was a measure.
 */
function normalizeColName(raw) {
  // Measure aliases don't have table prefix — pass through
  // Table-qualified: "DimCustomer TPID" → "TPID"
  // Pipeline: "F_AzureConsumptionPipe StrategicPillar" → "StrategicPillar"
  const parts = raw.split(" ");
  if (parts.length <= 1) return raw;
  // If it looks like a table-qualified name, take the last part
  // Exception: multi-word aliases like "ACR_LCM" — these won't have a table prefix match
  const tablePatterns = [
    "DimCustomer",
    "DimDate",
    "DimViewType",
    "F_AzureConsumptionPipe",
    "M_ACR",
    "M_ACRBudget",
    "M_ACRPipe",
  ];
  for (const t of tablePatterns) {
    if (raw.startsWith(t + " ")) {
      return raw.slice(t.length + 1);
    }
  }
  return raw;
}

/**
 * Extract rows from a single PBI result set.
 * Each result has { tables: [{ columns: [{name}], rows: [[...]] }] }
 */
function extractRows(resultSet) {
  if (!resultSet?.tables?.[0]) return [];
  const table = resultSet.tables[0];
  const cols = table.columns.map((c) => normalizeColName(c.name));
  return table.rows.map((row) => {
    const obj = {};
    for (let i = 0; i < cols.length; i++) {
      obj[cols[i]] = row[i];
    }
    return obj;
  });
}

/**
 * Unwrap various PBI MCP response shapes into an array of result sets.
 */
function parseResponse(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    console.error("ERROR: Input is not valid JSON.");
    process.exit(1);
  }

  // Shape 1: MCP wrapped response { content: [{text: "..."}] }
  if (parsed.content && Array.isArray(parsed.content)) {
    const textBlock = parsed.content.find((c) => c.type === "text" && c.text);
    if (textBlock) {
      try {
        parsed = JSON.parse(textBlock.text);
      } catch {
        // text might be the actual data, try as-is
      }
    }
  }

  // Shape 2: Standard PBI response { results: [...] }
  if (parsed.results && Array.isArray(parsed.results)) {
    return parsed.results;
  }

  // Shape 3: Array of result sets (pre-extracted by agent)
  if (Array.isArray(parsed)) {
    // Could be array of result sets or array of raw rows
    if (parsed[0]?.tables) {
      return parsed;
    }
    // Array of arrays (pre-extracted rows) — wrap
    if (Array.isArray(parsed[0])) {
      return parsed.map((rows) => ({
        tables: [
          {
            columns: rows.length
              ? Object.keys(rows[0]).map((n) => ({ name: n }))
              : [],
            rows: rows.map((r) => Object.values(r)),
          },
        ],
      }));
    }
    // Single flat array of rows — treat as one result set
    return [
      {
        tables: [
          {
            columns: parsed.length
              ? Object.keys(parsed[0]).map((n) => ({ name: n }))
              : [],
            rows: parsed.map((r) => Object.values(r)),
          },
        ],
      },
    ];
  }

  // Shape 4: Single result set { tables: [...] }
  if (parsed.tables) {
    return [parsed];
  }

  // Shape 5: Raw MCP ExecuteQuery response { executionResult: { Tables: [...] } }
  if (parsed.executionResult?.Tables) {
    // Convert PascalCase (Columns/Rows/Name) to camelCase (columns/rows/name)
    return parsed.executionResult.Tables.map((t) => ({
      tables: [
        {
          columns: (t.Columns || []).map((c) => ({ name: c.Name })),
          rows: t.Rows || [],
        },
      ],
    }));
  }

  console.error("ERROR: Unrecognized PBI response shape.");
  process.exit(1);
}

const resultSets = parseResponse(rawText);
const bulkRows = extractRows(resultSets[0]);
const pillarRows = resultSets.length > 1 ? extractRows(resultSets[1]) : [];
const attrRows = resultSets.length > 2 ? extractRows(resultSets[2]) : [];


// ── Constants ───────────────────────────────────────────────────────
// AIO model uses sub-strategic pillar names, not top-level categories.
// These are the SQL600-relevant sub-pillars from the AIO model.
const SQL_RELEVANT_PILLARS = new Set([
  // Data & AI family
  "Data & AI",
  "Azure SQL Core",
  "Modern DBs",
  "Databricks",
  "Azure OpenAI",
  "CosmosDB",
  "Analytics",
  "Data Integration",
  // Infra family
  "Infra",
  "Windows Compute",
  "Linux Compute",
  "Rest of Infra",
  "Arc",
]);
const SQL_RELEVANT_PLAYS = new Set([
  "Migrate & Modernize",
  "Migrate and Modernize Your Estate",
  "Infra and Database Migration to Azure",
]);

// ── Build aioAccountMoM ─────────────────────────────────────────────
// One row per account × month, with ACR value

const aioAccountMoM = bulkRows
  .filter((r) => r.ACR != null && r.ACR !== 0)
  .map((r) => ({
    TPID: r.TPID,
    Account: r.TPAccountName,
    FiscalMonth: r.MonthStartDate,
    ACR: parseDollar(r.ACR),
  }));

// ── Build aioBudgetAttainment ───────────────────────────────────────
// Group by TPID, take latest month for LCM + budget, sum ACR for YTD

const byTpid = new Map();
for (const row of bulkRows) {
  if (!byTpid.has(row.TPID)) {
    byTpid.set(row.TPID, {
      TPID: row.TPID,
      Account: row.TPAccountName,
      rows: [],
    });
  }
  byTpid.get(row.TPID).rows.push(row);
}

// Determine current fiscal year start (MSFT FY = Jul 1 – Jun 30)
function fyStartDate() {
  const now = new Date();
  const year = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return new Date(year, 6, 1); // July 1
}
const currentFyStart = fyStartDate();

const aioBudgetAttainment = [...byTpid.values()].map((acct) => {
  // Sort by month descending to find latest
  const sorted = acct.rows.sort(
    (a, b) =>
      new Date(b.MonthStartDate).getTime() -
      new Date(a.MonthStartDate).getTime()
  );
  const latest = sorted[0];
  // Sum only current FY months for YTD — parse dollar strings to numbers first
  const acrYtd = acct.rows
    .filter((r) => new Date(r.MonthStartDate) >= currentFyStart)
    .reduce((sum, r) => sum + parseDollar(r.ACR), 0);

  return {
    TPID: acct.TPID,
    Account: acct.Account,
    ACR_YTD: acrYtd,
    ACR_LCM: parseDollar(latest.ACR_LCM),
    BudgetAttainPct: parseDollar(latest.BudgetAttainPct) || null,
  };
});

// ── Build aioServiceBreakdown ───────────────────────────────────────
// Tag each row with SQLRelevant flag.
// Carry both ACR (consumption) and PipelineACR so the report renderer can
// distinguish actual consumption mix from forward-pipeline mix.

const aioServiceBreakdown = pillarRows.map((r) => ({
  TPID: r.TPID,
  Account: r.TPAccountName,
  StrategicPillar: r.StrategicPillar,
  SolutionPlay: r.SolutionPlay || null,
  ACR: r.ACR ?? r.ACR_LCM ?? r.ActualACR ?? null,
  PipelineACR: r.PipelineACR ?? r.ACR_Pipe ?? null,
  SQLRelevant:
    SQL_RELEVANT_PILLARS.has(r.StrategicPillar) ||
    SQL_RELEVANT_PLAYS.has(r.SolutionPlay),
}));

// ── Build aioAccountAttributes ──────────────────────────────────────
// Propensity flags from AzureCustomerAttributes (QA3-ATTR result set).
// One row per TPID. Values are typically "Y"/"N"/null or text strings.
function yesNo(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim().toUpperCase();
  if (s === 'Y' || s === 'YES' || s === 'TRUE' || s === '1') return 'Y';
  if (s === 'N' || s === 'NO' || s === 'FALSE' || s === '0') return 'N';
  return String(v).trim() || null;
}

const aioAccountAttributes = attrRows.map((r) => ({
  TPID: r.TPID,
  ESI_Tier: r.ESI_Tier || null,
  HasOpenAI: yesNo(r.HasOpenAI),
  HasOpenAI_Pipe: yesNo(r.HasOpenAI_Pipe),
  PTU_Target: yesNo(r.PTU_Target),
  NetNewMigrationTarget: yesNo(r.NetNewMigrationTarget),
  LXP_Category: r.LXP_Category || null,
  TrancheGrowthTarget: yesNo(r.TrancheGrowthTarget),
  "500K_100K_Target": r["500K_100K_Target"] || r["500K_100K_Targets"] || null,
  GHCP_200Plus: yesNo(r.GHCP_200Plus),
  GHCP_200Less: yesNo(r.GHCP_200Less),
}));

// ── Apply --quarters and --top filters ──────────────────────────────

if (maxQuarters > 0 && aioAccountMoM.length > 0) {
  // Find the N most recent months across all accounts
  const allMonths = [
    ...new Set(aioAccountMoM.map((r) => r.FiscalMonth)),
  ].sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  const keepMonths = new Set(allMonths.slice(0, maxQuarters * 3)); // 3 months per quarter
  const beforeCount = aioAccountMoM.length;
  const filtered = aioAccountMoM.filter((r) => keepMonths.has(r.FiscalMonth));
  aioAccountMoM.length = 0;
  aioAccountMoM.push(...filtered);
  console.error(
    `  --quarters ${maxQuarters}: kept ${keepMonths.size} months, ${aioAccountMoM.length}/${beforeCount} MoM rows`
  );
}

if (topN > 0) {
  // Rank accounts by total ACR across all months, keep top N
  const acrByTpid = new Map();
  for (const r of aioAccountMoM) {
    acrByTpid.set(r.TPID, (acrByTpid.get(r.TPID) || 0) + (r.ACR || 0));
  }
  const ranked = [...acrByTpid.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN);
  const keepTpids = new Set(ranked.map(([t]) => t));

  const momBefore = aioAccountMoM.length;
  const momFiltered = aioAccountMoM.filter((r) => keepTpids.has(r.TPID));
  aioAccountMoM.length = 0;
  aioAccountMoM.push(...momFiltered);

  // Also filter budget, breakdown, and attributes to same TPID set
  const budgetFiltered = aioBudgetAttainment.filter((r) =>
    keepTpids.has(r.TPID)
  );
  aioBudgetAttainment.length = 0;
  aioBudgetAttainment.push(...budgetFiltered);

  const breakdownFiltered = aioServiceBreakdown.filter((r) =>
    keepTpids.has(r.TPID)
  );
  aioServiceBreakdown.length = 0;
  aioServiceBreakdown.push(...breakdownFiltered);

  const attrFiltered = aioAccountAttributes.filter((r) =>
    keepTpids.has(r.TPID)
  );
  aioAccountAttributes.length = 0;
  aioAccountAttributes.push(...attrFiltered);

  console.error(
    `  --top ${topN}: kept ${keepTpids.size} accounts, ${aioAccountMoM.length}/${momBefore} MoM rows`
  );
}

// ── Summary stats ───────────────────────────────────────────────────
const summary = {
  bulkInputRows: bulkRows.length,
  momOutputRows: aioAccountMoM.length,
  budgetAccounts: aioBudgetAttainment.length,
  pillarInputRows: pillarRows.length,
  pillarOutputRows: aioServiceBreakdown.length,
  attrInputRows: attrRows.length,
  attrOutputRows: aioAccountAttributes.length,
  uniqueAccounts: byTpid.size,
  monthRange:
    aioAccountMoM.length > 0
      ? {
          earliest: aioAccountMoM[0]?.FiscalMonth,
          latest: aioAccountMoM[aioAccountMoM.length - 1]?.FiscalMonth,
        }
      : null,
  budgetBelow80Pct: aioBudgetAttainment.filter((a) => {
    const v =
      typeof a.BudgetAttainPct === "number"
        ? a.BudgetAttainPct
        : parseFloat(a.BudgetAttainPct);
    const pct = v > 2 ? v : v * 100;
    return !isNaN(pct) && pct < 80;
  }).length,
};

// ── Output ──────────────────────────────────────────────────────────
const output = {
  aioAccountMoM,
  aioBudgetAttainment,
  aioServiceBreakdown,
  aioAccountAttributes,
  _summary: summary,
};

if (mergeFile) {
  // Merge into existing SQL600 data file
  const existing = JSON.parse(readFileSync(mergeFile, "utf8"));
  existing.aioAccountMoM = aioAccountMoM;
  existing.aioBudgetAttainment = aioBudgetAttainment;
  existing.aioServiceBreakdown = aioServiceBreakdown;
  existing.aioAccountAttributes = aioAccountAttributes;
  writeFileSync(mergeFile, JSON.stringify(existing, null, 2));
  console.error(
    `Merged AIO data into ${mergeFile}: ${summary.momOutputRows} MoM rows, ${summary.budgetAccounts} budget accounts, ${summary.pillarOutputRows} pillar rows, ${summary.attrOutputRows} attribute rows`
  );

  // Coverage validation (always runs on merge, --check makes warnings louder)
  const sql600Tpids = new Set();
  for (const arr of ['topAccounts', 'renewals', 'gapAccounts']) {
    for (const r of existing[arr] || []) {
      if (r.TPID) sql600Tpids.add(String(r.TPID));
    }
  }
  const aioTpids = new Set([...byTpid.keys()].map(String));
  const missing = [...sql600Tpids].filter(t => !aioTpids.has(t));
  const coveragePct = sql600Tpids.size > 0 ? ((aioTpids.size / sql600Tpids.size) * 100).toFixed(0) : 0;

  console.error(`  Coverage: ${aioTpids.size} of ${sql600Tpids.size} SQL600 TPIDs (${coveragePct}%)`);
  if (missing.length > 0) {
    console.error(`  ⚠️  ${missing.length} TPIDs not found in AIO model${check ? ': ' + missing.join(', ') : ' (use --check to list)'}`);
  }

  // Budget data validation
  const budgetAllZero = aioBudgetAttainment.length > 0 && aioBudgetAttainment.every(a => {
    const v = typeof a.BudgetAttainPct === 'number' ? a.BudgetAttainPct : parseFloat(a.BudgetAttainPct);
    return isNaN(v) || v <= 0.01;
  });
  if (budgetAllZero) {
    console.error('  ⚠️  Budget attainment all zero/null — budget targets likely not loaded in AIO model');
  }

  // Pillar granularity check
  const uniquePillars = new Set(aioServiceBreakdown.map(r => r.StrategicPillar).filter(Boolean));
  const parentPillars = new Set(['Data & AI', 'Infra', 'Digital & App Innovation', 'Security', 'Modern Work', 'Business Applications']);
  const isSubPillar = [...uniquePillars].some(p => !parentPillars.has(p));
  if (isSubPillar) {
    console.error(`  ℹ️  Pillar granularity: sub-pillar level (${uniquePillars.size} unique values). Generator normalizes to parent categories.`);
  }
} else {
  const json = pretty ? JSON.stringify(output, null, 2) : JSON.stringify(output);
  process.stdout.write(json + "\n");
}

// Print summary to stderr (visible to user, doesn't pollute stdout JSON)
console.error(`normalize-aio: ${summary.uniqueAccounts} accounts`);
console.error(
  `  MoM:    ${summary.momOutputRows} rows (from ${summary.bulkInputRows} raw)`
);
console.error(`  Budget: ${summary.budgetAccounts} accounts`);
console.error(
  `  Pillar: ${summary.pillarOutputRows} rows (from ${summary.pillarInputRows} raw)`
);
console.error(
  `  Attrs:  ${summary.attrOutputRows} accounts (from ${summary.attrInputRows} raw)`
);
if (summary.budgetBelow80Pct > 0) {
  console.error(
    `  ⚠️  ${summary.budgetBelow80Pct} accounts below 80% budget attainment`
  );
}
