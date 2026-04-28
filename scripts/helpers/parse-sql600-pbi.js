#!/usr/bin/env node

/**
 * parse-sql600-pbi.js — SQL600 PBI response parser
 *
 * Takes raw Power BI ExecuteQuery responses from the SQL600 model
 * (Q1–Q10-DETAIL aggregate + Q5–Q9 detail queries) and produces the
 * structured JSON expected by generate-sql600-report.js.
 *
 * Eliminates the agent needing to read hundreds of lines of raw PBI
 * content.json to manually map columns and assemble the data file.
 *
 * Usage:
 *   # Parse Step 1 (aggregate) response only — produces partial data file
 *   node scripts/helpers/parse-sql600-pbi.js --step1 /tmp/step1-raw.json
 *
 *   # Parse Step 2 (detail) response and merge into existing data file
 *   node scripts/helpers/parse-sql600-pbi.js --step2 /tmp/step2-raw.json \
 *     --merge .copilot/docs/sql600-data-2026-04-28.json
 *
 *   # Parse both steps at once (two raw files)
 *   node scripts/helpers/parse-sql600-pbi.js \
 *     --step1 /tmp/step1-raw.json \
 *     --step2 /tmp/step2-raw.json \
 *     --output .copilot/docs/sql600-data-2026-04-28.json
 *
 *   # Pipe single response via stdin (auto-detects step)
 *   cat /tmp/pbi-response.json | node scripts/helpers/parse-sql600-pbi.js
 *
 * Options:
 *   --step1 <path>    Raw PBI response from Step 1 (Q1+Q2+Q3+Q4+Q4B+Q10-DETAIL)
 *   --step2 <path>    Raw PBI response from Step 2 (Q5+Q6+Q7+Q8+Q9)
 *   --merge <path>    Merge into an existing sql600-data JSON file (mutates in place)
 *   --output <path>   Write output to this path (default: stdout)
 *   --date <YYYY-MM-DD>  Override the generated date (default: today)
 *   --pretty          Pretty-print JSON output
 *
 * Input formats accepted (same as normalize-aio.js):
 *   1. daxQueries array response: { results: [ {tables:[...]}, ... ] }
 *   2. Single ExecuteQuery response: { results: [ {tables:[...]} ] }
 *   3. Wrapped MCP response: { content: [{text: "..."}] }
 *   4. Raw executionResult: { executionResult: { Tables: [...] } }
 */

import { readFileSync, writeFileSync } from "node:fs";

// ── Value parsers ───────────────────────────────────────────────────

/** Parse PBI dollar-formatted strings ("$2,874,558") to number. */
function parseDollar(v) {
  if (v == null || v === "" || v === "—") return null;
  if (typeof v === "number") return v;
  const s = String(v).trim();
  if (s === "" || s === "—") return null;
  const num =
    parseFloat(s.replace(/[$,()]/g, "")) * (s.includes("(") ? -1 : 1);
  return Number.isFinite(num) ? num : null;
}

/** Parse PBI percentage strings ("23%", "72.1%") to string or null. */
function parsePct(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return (v * 100).toFixed(1).replace(/\.0$/, "") + "%";
  const s = String(v).trim();
  if (s === "" || s === "—") return null;
  // Already has % sign — return as-is
  if (s.includes("%")) return s;
  // Decimal ratio (0.23) → percentage string
  const num = parseFloat(s);
  if (Number.isFinite(num)) {
    const pct = num < 1 && num > -1 ? num * 100 : num;
    return pct.toFixed(1).replace(/\.0$/, "") + "%";
  }
  return null;
}

/** Parse boolean-ish PBI values. */
function parseBool(v) {
  if (v == null) return null;
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  if (s === "true" || s === "1" || s === "yes") return true;
  if (s === "false" || s === "0" || s === "no") return false;
  return null;
}

/** Parse numeric — handles PBI nulls and stringified numbers. */
function parseNum(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v;
  const s = String(v).trim();
  if (s === "" || s === "—") return null;
  const num = parseFloat(s.replace(/,/g, ""));
  return Number.isFinite(num) ? num : null;
}

// ── PBI response parsing ────────────────────────────────────────────

/**
 * PBI column names come back as "TableName ColumnName" (space-separated).
 * Normalize to the alias or bare column name.
 */
const TABLE_PREFIXES = [
  "2) Account",
  "1) Calendar",
  "3) Product",
  "4) Sellers",
  "✽ Pipeline",
  "✽ Pipeline Last Week Snapshot",
  "✽ ACR",
  "✽ ACR (Last Week Snapshot)",
  "◦ Measure",
  "SQL 500 Target List",
  "Factory Cases",
  "Fact_Budget",
  "Fact_Projection",
  "DimCustomer",
  "DimDate",
  "DimViewType",
  "F_AzureConsumptionPipe",
  "M_ACR",
  "M_ACRBudget",
  "M_ACRPipe",
  "AzureCustomerAttributes",
];

function normalizeColName(raw) {
  if (!raw) return raw;
  for (const prefix of TABLE_PREFIXES) {
    if (raw.startsWith(prefix + " ")) {
      return raw.slice(prefix.length + 1);
    }
  }
  // Bracket-qualified: [ACR_LCM] → ACR_LCM
  if (raw.startsWith("[") && raw.endsWith("]")) {
    return raw.slice(1, -1);
  }
  return raw;
}

/**
 * Extract typed rows from a single PBI result set.
 * Returns { columns: string[], rows: object[] }
 */
function extractResultSet(resultSet) {
  if (!resultSet?.tables?.[0]) return { columns: [], rows: [] };
  const table = resultSet.tables[0];
  const cols = table.columns.map((c) => normalizeColName(c.name));
  const rows = (table.rows || []).map((row) => {
    const obj = {};
    for (let i = 0; i < cols.length; i++) {
      obj[cols[i]] = row[i];
    }
    return obj;
  });
  return { columns: cols, rows };
}

/**
 * Unwrap various PBI MCP response shapes into an array of result sets.
 * Same logic as normalize-aio.js for consistency.
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

  // Shape 3: Array of result sets
  if (Array.isArray(parsed)) {
    if (parsed[0]?.tables) return parsed;
    return [{ tables: [{ columns: [], rows: [] }] }];
  }

  // Shape 4: Single result set { tables: [...] }
  if (parsed.tables) {
    return [parsed];
  }

  // Shape 5: Raw MCP ExecuteQuery response { executionResult: { Tables: [...] } }
  if (parsed.executionResult?.Tables) {
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

// ── Query identification by column signature ────────────────────────

/**
 * Identify which SQL600 query a result set corresponds to,
 * based on its column names. This is the key heuristic.
 */
function identifyQuery(columns) {
  const colSet = new Set(columns.map((c) => c.toLowerCase()));

  // Q1 — Portfolio KPI Snapshot: single-row with many measure aliases
  if (colSet.has("acr_lcm") && colSet.has("pipecommitted") && colSet.has("pipelinepenetration")) {
    return "Q1";
  }

  // Q10-DETAIL — Per-Account ACR by Strategic Pillar: has TPID + TopParent + StrategicPillar + ACR
  // Must check before Q2 since Q2 doesn't have StrategicPillar from the SQL600 model
  if (colSet.has("tpid") && colSet.has("topparent") && colSet.has("strategicpillar") && colSet.has("acr")) {
    return "Q10-DETAIL";
  }

  // Q2 — Industry Ranking: has Industry + ACR_LCM + AccountCount (aggregated by Industry)
  if (colSet.has("industry") && colSet.has("acr_lcm") && colSet.has("accountcount")) {
    return "Q2";
  }

  // Q3 — Vertical Breakdown: has Vertical + AccountCount + ACR_LCM + ModOpps
  if (colSet.has("vertical") && colSet.has("accountcount") && colSet.has("modopps")) {
    return "Q3";
  }

  // Q4B — Vertical Monthly Trend: has Vertical + Fiscal Month + ACR (but no TPID)
  // Must check before Q4 since Q4 doesn't have Vertical
  if (colSet.has("vertical") && colSet.has("fiscal month") && colSet.has("acr")) {
    return "Q4B";
  }

  // Q4 — ACR Monthly Trend: has Fiscal Month + IsClosed + ACR (no Vertical, no TPID)
  if (colSet.has("fiscal month") && colSet.has("isclosed") && colSet.has("acr")) {
    return "Q4";
  }

  // Q5 — Top Accounts: has TPID + TopParent + Vertical + Segment + ACR_LCM
  if (colSet.has("tpid") && colSet.has("topparent") && colSet.has("segment") && colSet.has("acr_lcm")) {
    return "Q5";
  }

  // Q6 — Renewal Exposure: has TPID + SQL 500 columns (Total SQL Cores, SQL Renewal Quarter)
  if (colSet.has("tpid") && (colSet.has("total sql cores") || colSet.has("sql renewal quarter") || colSet.has("sql 500 category"))) {
    return "Q6";
  }

  // Q7 — Modernization Pipeline: has OpportunityID + MilestoneWorkload + PipeACR
  if (colSet.has("opportunityid") && colSet.has("milestoneworkload")) {
    return "Q7";
  }

  // Q9 — Top Opportunities: has OpportunityID + DaysInSalesStage + PipeACR_Qualified
  if (colSet.has("opportunityid") && (colSet.has("daysinsalesstage") || colSet.has("pipeacr_qualified"))) {
    return "Q9";
  }

  // Q8 — Gap Accounts: has TPID + TopParent + Vertical + PipeCommitted + SQLCores (filtered: committed=0)
  // This is tricky — similar to Q5 but without Segment and with SQLCores
  if (colSet.has("tpid") && colSet.has("topparent") && colSet.has("vertical") && colSet.has("sqlcores")) {
    return "Q8";
  }

  return "UNKNOWN";
}

// ── Query result mappers ────────────────────────────────────────────

function mapQ1(rows) {
  // Q1 returns 1 row — portfolio KPI snapshot
  if (!rows.length) return {};
  const r = rows[0];
  return {
    ACR_LCM: parseDollar(r.ACR_LCM),
    ACR_YoY_Pct: parsePct(r.ACR_YoY_Pct),
    AnnualizedGrowth: parseDollar(r.AnnualizedGrowth),
    AnnualizedGrowthPlusPipe: parseDollar(r.AnnualizedGrowthPlusPipe),
    PipeCommitted: parseDollar(r.PipeCommitted),
    PipeUncommitted: parseDollar(r.PipeUncommitted),
    PipeQualified: parseDollar(r.PipeQualified),
    PipeUnqualified: parseDollar(r.PipeUnqualified),
    QualifiedOpps: parseNum(r.QualifiedOpps),
    TotalOpps: parseNum(r.TotalOpps),
    ModernizationOpps: parseNum(r.ModernizationOpps),
    PipelinePenetration: parsePct(r.PipelinePenetration),
    SQLTotalTAM: parseDollar(r.SQLTotalTAM),
    SQLCores: parseNum(r.SQLCores),
    AcctsWithModPipe: parseNum(r.AcctsWithModPipe),
    AcctsWithoutModPipe: parseNum(r.AcctsWithoutModPipe),
    FactoryAttach: parsePct(r.FactoryAttach),
    WoW_Change: parseDollar(r.WoW_Change),
    AccountCount: parseNum(r.AcctsWithModPipe) != null && parseNum(r.AcctsWithoutModPipe) != null
      ? (parseNum(r.AcctsWithModPipe) || 0) + (parseNum(r.AcctsWithoutModPipe) || 0)
      : null,
  };
}

function mapQ2(rows) {
  // Q2 — Industry Ranking: array sorted by ACR_LCM DESC
  return rows
    .map((r) => ({
      Industry: r.Industry,
      ACR_LCM: parseDollar(r.ACR_LCM),
      AccountCount: parseNum(r.AccountCount),
      PipeCommitted: parseDollar(r.PipeCommitted),
    }))
    .sort((a, b) => (b.ACR_LCM || 0) - (a.ACR_LCM || 0));
}

function mapQ3(rows) {
  // Q3 — Vertical Breakdown
  return rows
    .map((r) => ({
      Vertical: r.Vertical,
      AccountCount: parseNum(r.AccountCount),
      ACR_LCM: parseDollar(r.ACR_LCM),
      PipeCommitted: parseDollar(r.PipeCommitted),
      PipeUncommitted: parseDollar(r.PipeUncommitted),
      AnnualizedGrowth: parseDollar(r.AnnualizedGrowth),
      ModOpps: parseNum(r.ModOpps),
    }))
    .sort((a, b) => (b.ACR_LCM || 0) - (a.ACR_LCM || 0));
}

function mapQ4(rows) {
  // Q4 — ACR Monthly Trend
  return rows
    .map((r) => ({
      FiscalMonth: r["Fiscal Month"] || r.FiscalMonth,
      IsClosed: parseBool(r.IsClosed),
      ACR: parseDollar(r.ACR),
    }))
    .sort((a, b) => String(a.FiscalMonth).localeCompare(String(b.FiscalMonth)));
}

function mapQ4B(rows) {
  // Q4B — Vertical Monthly Trend
  return rows
    .map((r) => ({
      Vertical: r.Vertical,
      FiscalMonth: r["Fiscal Month"] || r.FiscalMonth,
      IsClosed: parseBool(r.IsClosed),
      ACR: parseDollar(r.ACR),
    }))
    .sort((a, b) => {
      const vc = String(a.Vertical).localeCompare(String(b.Vertical));
      return vc !== 0
        ? vc
        : String(a.FiscalMonth).localeCompare(String(b.FiscalMonth));
    });
}

function mapQ5(rows) {
  // Q5 — Top Accounts
  return rows.map((r) => ({
    TPID: parseNum(r.TPID),
    TopParent: r.TopParent,
    Vertical: r.Vertical,
    Segment: r.Segment,
    FieldAreaShorter: r.FieldAreaShorter || r.FieldAreaDetail,
    ACR_LCM: parseDollar(r.ACR_LCM),
    PipeCommitted: parseDollar(r.PipeCommitted),
    PipeUncommitted: parseDollar(r.PipeUncommitted),
    AnnualizedGrowth: parseDollar(r.AnnualizedGrowth),
    AnnualizedGrowthPlusPipe: parseDollar(r.AnnualizedGrowthPlusPipe),
    QualifiedOpps: parseNum(r.QualifiedOpps),
    TotalOpps: parseNum(r.TotalOpps),
  }));
}

function mapQ6(rows) {
  // Q6 — Renewal Exposure (from SQL 500 Target List)
  return rows.map((r) => ({
    TPID: parseNum(r.TPID),
    TopParent: r["Top Parent"] || r.TopParent,
    Category: r["SQL 500 Category"] || r.Category,
    RenewalQuarter: r["SQL Renewal Quarter"] || r.RenewalQuarter || null,
    SQLCores: parseNum(r["Total SQL Cores"] || r.SQLCores),
    ArcEnabled: r["Arc Enabled?"] || r.ArcEnabled || null,
    ACR_LCM: parseDollar(r.ACR_LCM),
    PipeCommitted: parseDollar(r.PipeCommitted),
  }));
}

function mapQ7(rows) {
  // Q7 — Modernization Pipeline Detail
  return rows.map((r) => ({
    TPID: parseNum(r.TPID),
    TopParent: r.TopParent,
    OpportunityID: r.OpportunityID,
    OpportunityName: r.OpportunityName,
    OpportunityLink: r.OpportunityLink || null,
    SalesStageShort: r.SalesStageShort,
    Owner: r.OpportunityOwner || r.Owner,
    MilestoneWorkload: r.MilestoneWorkload,
    QualifiedFlag: r.QualifiedFlag,
    MilestoneCommitment: r.MilestoneCommitment,
    PipeACR: parseDollar(r.PipeACR),
  }));
}

function mapQ8(rows) {
  // Q8 — Gap Accounts (Zero Committed Pipeline)
  return rows.map((r) => ({
    TPID: parseNum(r.TPID),
    TopParent: r.TopParent,
    Vertical: r.Vertical,
    FieldAreaShorter: r.FieldAreaShorter || null,
    ACR_LCM: parseDollar(r.ACR_LCM),
    PipeCommitted: parseDollar(r.PipeCommitted),
    PipeUncommitted: parseDollar(r.PipeUncommitted),
    SQLCores: parseNum(r.SQLCores),
  }));
}

function mapQ9(rows) {
  // Q9 — Top Opportunities
  return rows.map((r) => ({
    TPID: parseNum(r.TPID),
    TopParent: r.TopParent,
    OpportunityID: r.OpportunityID,
    OpportunityName: r.OpportunityName,
    OpportunityLink: r.OpportunityLink || null,
    SalesStageShort: r.SalesStageShort,
    Owner: r.OpportunityOwner || r.Owner,
    DaysInSalesStage: parseNum(r.DaysInSalesStage),
    MilestoneCommitment: r.MilestoneCommitment,
    QualifiedFlag: r.QualifiedFlag,
    PipeACR_Qualified: parseDollar(r.PipeACR_Qualified),
    PipeACR_Committed: parseDollar(r.PipeACR_Committed),
    PipeACR_Uncommitted: parseDollar(r.PipeACR_Uncommitted),
  }));
}

function mapQ10Detail(rows) {
  // Q10-DETAIL — Per-Account ACR by Strategic Pillar
  return rows.map((r) => ({
    TPID: parseNum(r.TPID),
    Account: r.TopParent,
    StrategicPillar: r.StrategicPillar,
    ACR: parseDollar(r.ACR),
  }));
}

// ── Main ────────────────────────────────────────────────────────────

// Parse args
const args = process.argv.slice(2);
let step1File = null;
let step2File = null;
let mergeFile = null;
let outputFile = null;
let dateOverride = null;
let pretty = false;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--step1" && args[i + 1]) { step1File = args[++i]; continue; }
  if (arg === "--step2" && args[i + 1]) { step2File = args[++i]; continue; }
  if (arg === "--merge" && args[i + 1]) { mergeFile = args[++i]; continue; }
  if (arg === "--output" && args[i + 1]) { outputFile = args[++i]; continue; }
  if (arg === "--date" && args[i + 1]) { dateOverride = args[++i]; continue; }
  if (arg === "--pretty") { pretty = true; continue; }
  if (!arg.startsWith("-")) {
    // Positional arg — treat as step1 if not set, else step2
    if (!step1File) step1File = arg;
    else if (!step2File) step2File = arg;
  }
}

const today = dateOverride || new Date().toISOString().slice(0, 10);

// ── Process Step 1 ──────────────────────────────────────────────────

/** Process a raw PBI response file and return identified query results. */
function processFile(filePath) {
  const raw = filePath ? readFileSync(filePath, "utf8") : readFileSync("/dev/stdin", "utf8");
  const resultSets = parseResponse(raw);
  const identified = {};

  for (let i = 0; i < resultSets.length; i++) {
    const { columns, rows } = extractResultSet(resultSets[i]);
    if (!columns.length) continue;

    const queryId = identifyQuery(columns);
    if (queryId === "UNKNOWN") {
      console.error(
        `⚠️  Result set ${i}: could not identify query from columns: [${columns.join(", ")}]`
      );
      continue;
    }
    console.error(`✓  Result set ${i}: identified as ${queryId} (${rows.length} rows)`);
    identified[queryId] = rows;
  }

  return identified;
}

// Build the data object
let data;

if (mergeFile) {
  // Merge mode — load existing data file
  try {
    data = JSON.parse(readFileSync(mergeFile, "utf8"));
  } catch {
    console.error(`ERROR: Cannot read merge target: ${mergeFile}`);
    process.exit(1);
  }
} else {
  // Fresh data object
  data = {
    generated: today,
    snapshot: {},
    ranking: [],
    verticals: [],
    trend: [],
    verticalTrend: [],
    topAccounts: [],
    renewals: [],
    gapAccounts: [],
    sql600PillarBreakdown: [],
    _aiInsight: {},
  };
}

// Process Step 1 file
if (step1File) {
  const step1 = processFile(step1File);

  if (step1.Q1) {
    data.snapshot = mapQ1(step1.Q1);
    data.generated = today;
  }
  if (step1.Q2) data.ranking = mapQ2(step1.Q2);
  if (step1.Q3) data.verticals = mapQ3(step1.Q3);
  if (step1.Q4) data.trend = mapQ4(step1.Q4);
  if (step1.Q4B) data.verticalTrend = mapQ4B(step1.Q4B);
  if (step1["Q10-DETAIL"]) data.sql600PillarBreakdown = mapQ10Detail(step1["Q10-DETAIL"]);
} else if (!step2File && !mergeFile) {
  // No explicit step flags — process stdin as step1
  const stdin = processFile(null);
  if (stdin.Q1) {
    data.snapshot = mapQ1(stdin.Q1);
    data.generated = today;
  }
  if (stdin.Q2) data.ranking = mapQ2(stdin.Q2);
  if (stdin.Q3) data.verticals = mapQ3(stdin.Q3);
  if (stdin.Q4) data.trend = mapQ4(stdin.Q4);
  if (stdin.Q4B) data.verticalTrend = mapQ4B(stdin.Q4B);
  if (stdin["Q10-DETAIL"]) data.sql600PillarBreakdown = mapQ10Detail(stdin["Q10-DETAIL"]);
  // Also check for detail queries in same response
  if (stdin.Q5) data.topAccounts = mapQ5(stdin.Q5);
  if (stdin.Q6) data.renewals = mapQ6(stdin.Q6);
  if (stdin.Q7) data.modernization = mapQ7(stdin.Q7);
  if (stdin.Q8) data.gapAccounts = mapQ8(stdin.Q8);
  if (stdin.Q9) data.topOpportunities = mapQ9(stdin.Q9);
}

// Process Step 2 file
if (step2File) {
  const step2 = processFile(step2File);
  if (step2.Q5) data.topAccounts = mapQ5(step2.Q5);
  if (step2.Q6) data.renewals = mapQ6(step2.Q6);
  if (step2.Q7) data.modernization = mapQ7(step2.Q7);
  if (step2.Q8) data.gapAccounts = mapQ8(step2.Q8);
  if (step2.Q9) data.topOpportunities = mapQ9(step2.Q9);
}

// ── Summary ─────────────────────────────────────────────────────────

const sections = {
  snapshot: data.snapshot && Object.keys(data.snapshot).length > 0,
  ranking: data.ranking?.length > 0,
  verticals: data.verticals?.length > 0,
  trend: data.trend?.length > 0,
  verticalTrend: data.verticalTrend?.length > 0,
  topAccounts: data.topAccounts?.length > 0,
  renewals: data.renewals?.length > 0,
  gapAccounts: data.gapAccounts?.length > 0,
  sql600PillarBreakdown: data.sql600PillarBreakdown?.length > 0,
};

console.error("\n── SQL600 Data Assembly Summary ──");
console.error(`  Date: ${data.generated}`);
for (const [key, present] of Object.entries(sections)) {
  const count = Array.isArray(data[key]) ? data[key].length : (present ? 1 : 0);
  console.error(`  ${present ? "✓" : "✗"} ${key}: ${present ? `${count} ${count === 1 ? "record" : "records"}` : "missing"}`);
}

const missingCore = ["snapshot", "ranking", "verticals", "trend"].filter((k) => !sections[k]);
if (missingCore.length) {
  console.error(`\n⚠️  Missing core sections: ${missingCore.join(", ")}`);
  console.error("   These are required for the executive readout. Re-run Step 1 queries.");
}

// Unique TPID count from pillar breakdown
if (data.sql600PillarBreakdown?.length) {
  const tpids = new Set(data.sql600PillarBreakdown.map((r) => r.TPID));
  console.error(`  → ${tpids.size} unique accounts in pillar breakdown`);
}

// ── Output ──────────────────────────────────────────────────────────

const json = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);

if (outputFile || mergeFile) {
  const target = outputFile || mergeFile;
  writeFileSync(target, json + "\n", "utf8");
  console.error(`\n✓ Written to ${target} (${(Buffer.byteLength(json) / 1024).toFixed(1)} KB)`);
} else {
  process.stdout.write(json + "\n");
}
