#!/usr/bin/env node

/**
 * classify-sql-pipeline.js — SQL600 pipeline workload classifier
 *
 * Reads PBI pipeline query results (Q1 account summary + Q2 pipeline detail)
 * and classifies SQL-relevant opportunities by workload tier.
 *
 * Designed to run BEFORE CRM cross-reference — outputs only the data needed
 * for targeted CRM lookups, keeping agent context lean.
 *
 * Usage:
 *   node scripts/helpers/classify-sql-pipeline.js .copilot/docs/sql600-pipeline.json
 *   cat .copilot/docs/sql600-pipeline.json | node scripts/helpers/classify-sql-pipeline.js
 *
 * Input JSON shape (from PBI ExecuteQuery):
 *   {
 *     "accounts": [ ... Q1 results ... ],
 *     "pipeline": [ ... Q2 results ... ]
 *   }
 *
 * Output JSON shape:
 *   {
 *     "generated": "2026-04-16",
 *     "scope": "SQL600 HLS",
 *     "totalAccounts": 43,
 *     "sqlOpps": [
 *       { "oppId": "...", "oppName": "...", "account": "...", "tpid": 123,
 *         "workload": "...", "tier": 1, "stage": "...", "owner": "...",
 *         "commitment": "...", "pipeACR": 12345, "oppLink": "..." }
 *     ],
 *     "gapAccounts": [
 *       { "tpid": 123, "account": "...", "vertical": "...", "fieldArea": "...",
 *         "sqlCores": 5000, "acrLCM": 12345, "pipeCommitted": 0, "gapType": "..." }
 *     ],
 *     "summary": {
 *       "tier1Count": 59, "tier2Count": 24, "tier3Count": 5,
 *       "gapAccountCount": 23, "uniqueOppIds": ["..."],
 *       "accountsWithSqlPipeline": 20
 *     }
 *   }
 */

import { readFileSync } from "node:fs";

// ── Sales Program workload catalog ──────────────────────────────────

const SALES_PROGRAM_WORKLOAD_ENTRIES = [
  // Migrate & Modernize to Azure SQL / new App Development
  ["Data: SQL On-prem to SQL MI (Paas)", "Migrate & Modernize to Azure SQL / new App Development"],
  ["Data: SQL to Azure SQL Hyperscale (AI Apps & Agents)", "Migrate & Modernize to Azure SQL / new App Development"],
  ["Data: SQL Modernization to Azure SQL DB with AI (Paas)", "Migrate & Modernize to Azure SQL / new App Development"],
  ["Data: SQL Modernization to Azure SQL MI with AI (Paas)", "Migrate & Modernize to Azure SQL / new App Development"],
  ["Data: SQL on-prem to Azure SQL VM (IaaS)", "Migrate & Modernize to Azure SQL / new App Development"],
  ["Data: Analytics - Fabric SQL Databases (OLTP)", "Migrate & Modernize to Azure SQL / new App Development"],

  // Arc-Enablement / ESU / SQL PayGo
  ["Data: Hybrid: Arc-Enabled SQL Server", "Arc-Enablement / ESU / SQL PayGo"],
  ["Data: Arc-Enabled SQL 2014 ESU", "Arc-Enablement / ESU / SQL PayGo"],
  ["Data: SQL Billed TO Azure SQL PayGo Licenses (Arc and Azure)", "Arc-Enablement / ESU / SQL PayGo"],
  ["Infra: Hybrid - Arc-Enabled Servers", "Arc-Enablement / ESU / SQL PayGo"],

  // Migrate PostgreSQL / PostgreSQL new app development
  ["Data: PostgreSQL Flexible Server (AI Apps & Agents)", "Migrate PostgreSQL / PostgreSQL new app development"],
  ["Data: PostgreSQL Flexible server (Migrate and Modernize)", "Migrate PostgreSQL / PostgreSQL new app development"],

  // Building AI Apps with DocumentDB / Cosmos DB
  ["Data: Cosmos DB (AI Apps & Agents)", "Building AI Apps with DocumentDB / Cosmos DB"],
  ["Data: Cosmos DB (Migrate and Modernize)", "Building AI Apps with DocumentDB / Cosmos DB"],

  // Oracle to SQL Migration
  ["Data: Oracle to Azure SQL Migration", "Oracle to SQL Migration"],
  ["Data: Oracle to PostgreSQL Flexible Server (Migrate & Modernize)", "Oracle to SQL Migration"],
];

function normalizeWorkloadLabel(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const SALES_PROGRAM_WORKLOAD_MAP = new Map(
  SALES_PROGRAM_WORKLOAD_ENTRIES.map(([workload, category]) => [
    normalizeWorkloadLabel(workload),
    category,
  ])
);

function salesProgramCategoryForWorkload(workload) {
  if (!workload) return null;
  return SALES_PROGRAM_WORKLOAD_MAP.get(normalizeWorkloadLabel(workload)) || null;
}

// ── Args ────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
let inputFile = null;
for (const arg of args) {
  if (!arg.startsWith("-")) inputFile = arg;
}

// ── Read input ──────────────────────────────────────────────────────
let rawText;
if (inputFile) {
  rawText = readFileSync(inputFile, "utf8");
} else {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  rawText = Buffer.concat(chunks).toString("utf8");
}

const data = JSON.parse(rawText);
const accounts = data.accounts || [];
const pipeline = data.pipeline || [];

// ── Workload classification rules ───────────────────────────────────

/**
 * Tier 1 — Core SQL workloads (always SQL600-relevant).
 * Match: MilestoneWorkload starts with "Data: SQL" or contains key SQL patterns.
 */
function isTier1(workload) {
  if (!workload) return false;
  const w = workload.toLowerCase();
  return (
    w.startsWith("data: sql") ||
    w.includes("sybase") ||
    w.includes("oracle to azure sql") ||
    w.includes("oracle exadata")
  );
}

/**
 * Tier 2 — Adjacent database workloads (contextually relevant).
 * Match: MySQL or PostgreSQL migration/modernization workloads.
 */
function isTier2(workload) {
  if (!workload) return false;
  const w = workload.toLowerCase();
  return w.includes("mysql") || w.includes("postgresql");
}

/**
 * Tier 3 — Modernization flag only (PBI-computed, not workload-based).
 * Already Tier 1 or 2 items are excluded.
 */
function classifyWorkload(workload, modernizationFlag) {
  if (isTier1(workload)) return 1;
  if (isTier2(workload)) return 2;
  if (modernizationFlag === 1) return 3;
  return 0;
}

// ── Classify pipeline rows ──────────────────────────────────────────

// Column name normalization — PBI SUMMARIZECOLUMNS returns dimension
// columns with table prefixes that vary. Build a flexible accessor.
function col(row, ...candidates) {
  for (const c of candidates) {
    // Try exact match
    if (row[c] !== undefined) return row[c];
    // Try bracket-stripped match (PBI sometimes returns '✽ Pipeline'[X])
    for (const key of Object.keys(row)) {
      if (key.endsWith(`[${c}]`)) return row[key];
      // Also try case-insensitive
      if (key.toLowerCase().includes(c.toLowerCase())) return row[key];
    }
  }
  return null;
}

const sqlOpps = [];
const seenOppIds = new Set();
const accountsWithSql = new Set();

for (const row of pipeline) {
  const workload =
    col(row, "MilestoneWorkload") ||
    col(row, "✽ Pipeline[MilestoneWorkload]") ||
    "";
  const modFlag =
    col(row, "Modernization Workload Flag") ||
    col(row, "✽ Pipeline[Modernization Workload Flag]") ||
    0;

  const tier = classifyWorkload(workload, modFlag);
  const salesProgramCategory = salesProgramCategoryForWorkload(workload);
  if (tier === 0 && !salesProgramCategory) continue;

  const oppId =
    col(row, "OpportunityID") ||
    col(row, "✽ Pipeline[OpportunityID]") ||
    "";
  const tpid =
    col(row, "TPID") || col(row, "2) Account[TPID]") || 0;

  // Deduplicate — same opp can have multiple milestone rows
  // Keep highest tier classification
  const dedupKey = `${oppId}::${workload}`;
  if (seenOppIds.has(dedupKey)) continue;
  seenOppIds.add(dedupKey);

  accountsWithSql.add(tpid);

  sqlOpps.push({
    oppId,
    oppName:
      col(row, "OpportunityName") ||
      col(row, "✽ Pipeline[OpportunityName]") ||
      "",
    account:
      col(row, "TopParent") || col(row, "2) Account[TopParent]") || "",
    tpid,
    workload,
    tier,
    stage:
      col(row, "SalesStageShort") ||
      col(row, "✽ Pipeline[SalesStageShort]") ||
      "",
    owner:
      col(row, "OpportunityOwner") ||
      col(row, "✽ Pipeline[OpportunityOwner]") ||
      "",
    commitment:
      col(row, "MilestoneCommitment") ||
      col(row, "✽ Pipeline[MilestoneCommitment]") ||
      "",
    pipeACR: col(row, "PipeACR") || 0,
    oppLink:
      col(row, "OpportunityLink") ||
      col(row, "✽ Pipeline[OpportunityLink]") ||
      "",
    strategicPillar:
      col(row, "StrategicPillar") ||
      col(row, "✽ Pipeline[StrategicPillar]") ||
      "",
    salesProgramCategory,
  });
}

// ── Identify gap accounts ───────────────────────────────────────────

const gapAccounts = [];

for (const acct of accounts) {
  const tpid = col(acct, "TPID") || col(acct, "2) Account[TPID]") || 0;
  const sqlCores = col(acct, "SQLCores") || 0;
  const modOpps = col(acct, "ModOpps") || 0;
  const hasModPipe = col(acct, "AcctHasModPipe") || 0;

  // Gap type 1: No modernization pipeline at all
  const noModPipeline = modOpps === 0 && hasModPipe === 0;

  // Gap type 2: Has SQL Cores but no Tier 1 SQL pipeline
  const noSqlPipeline = sqlCores > 0 && !accountsWithSql.has(tpid);

  if (!noModPipeline && !noSqlPipeline) continue;

  let gapType;
  if (noModPipeline && noSqlPipeline) {
    gapType = "No pipeline + SQL footprint unaddressed";
  } else if (noSqlPipeline) {
    gapType = `Has ${modOpps} mod opp(s) but no SQL workloads`;
  } else {
    gapType = "Zero pipeline";
  }

  gapAccounts.push({
    tpid,
    account:
      col(acct, "TopParent") || col(acct, "2) Account[TopParent]") || "",
    vertical:
      col(acct, "Vertical") || col(acct, "2) Account[Vertical]") || "",
    fieldArea:
      col(acct, "FieldAreaShorter") ||
      col(acct, "2) Account[FieldAreaShorter]") ||
      "",
    sqlCores,
    acrLCM: col(acct, "ACR_LCM") || 0,
    pipeCommitted: col(acct, "PipeCommitted") || 0,
    gapType,
  });
}

// Sort gap accounts by SQL Cores descending
gapAccounts.sort((a, b) => (b.sqlCores || 0) - (a.sqlCores || 0));

// ── Deduplicate opp IDs for CRM lookup ──────────────────────────────

const uniqueOppIds = [
  ...new Set(
    sqlOpps
      .filter((o) => o.tier <= 2 || !!o.salesProgramCategory)
      .map((o) => o.oppId)
  ),
].filter(Boolean);

// ── Summary stats ───────────────────────────────────────────────────

const tier1 = sqlOpps.filter((o) => o.tier === 1);
const tier2 = sqlOpps.filter((o) => o.tier === 2);
const tier3 = sqlOpps.filter((o) => o.tier === 3);

const output = {
  generated: new Date().toISOString().slice(0, 10),
  scope: "SQL600 HLS",
  totalAccounts: accounts.length,
  sqlOpps,
  gapAccounts,
  summary: {
    tier1Count: tier1.length,
    tier2Count: tier2.length,
    tier3Count: tier3.length,
    gapAccountCount: gapAccounts.length,
    uniqueOppIds,
    accountsWithSqlPipeline: accountsWithSql.size,
    totalSqlCoresInGap: gapAccounts.reduce(
      (s, a) => {
        const v = typeof a.sqlCores === "string" ? parseFloat(a.sqlCores.replace(/,/g, "")) : (a.sqlCores || 0);
        return s + (isNaN(v) ? 0 : v);
      },
      0
    ),
  },
};

console.log(JSON.stringify(output, null, 2));
