#!/usr/bin/env node

/**
 * audit-sales-play.js — SQL600 sales play tagging auditor
 *
 * Takes classified SQL pipeline data (from classify-sql-pipeline.js) and
 * CRM opportunity data, cross-references msp_salesplay against expected
 * values, and produces the final audit report.
 *
 * Usage:
 *   node scripts/helpers/audit-sales-play.js \
 *     --pipeline .copilot/docs/sql600-classified.json \
 *     --crm .copilot/docs/crm-opps.json
 *
 *   # Or pipe classified data and pass CRM as arg:
 *   cat .copilot/docs/sql600-classified.json | node scripts/helpers/audit-sales-play.js --crm .copilot/docs/crm-opps.json
 *
 *   # Generate markdown vault note:
 *   node scripts/helpers/audit-sales-play.js --pipeline .copilot/docs/classified.json --crm .copilot/docs/crm.json --format md
 *
 * Options:
 *   --pipeline <path>   Classified pipeline JSON (from classify-sql-pipeline.js). Also accepts stdin.
 *   --crm <path>        CRM opportunities JSON (merged list_opportunities results).
 *                        Shape: { "opportunities": [...] } or [...] array.
 *   --previous <path>   Previous classified/audit JSON to detect commitment transitions.
 *   --mail <path>       Optional normalized mail JSON (from normalize-mail.js) for winwire correlation.
 *   --format <fmt>      Output format: "json" (default) or "md" (vault-ready markdown).
 *   --output <path>     Write output to file instead of stdout.
 *
 * CRM JSON shape (from mcp_msx_list_opportunities, full format):
 *   Each opp must have: opportunityid, name, msp_salesplay,
 *   msp_salesplay@OData.Community.Display.V1.FormattedValue,
 *   _ownerid_value@OData.Community.Display.V1.FormattedValue,
 *   _parentaccountid_value@OData.Community.Display.V1.FormattedValue
 *
 * Output JSON:
 *   {
 *     "generated": "2026-04-16",
 *     "critical": [...],   // Tier 1 SQL + wrong/missing salesplay
 *     "warning": [...],    // Tier 1 SQL + adjacent play, or Tier 2
 *     "untaggedSalesProgram": [...], // Workload in Sales Program catalog + missing/Not Applicable salesplay
 *     "clean": [...],      // Tier 1 SQL + correct play
 *     "unmatched": [...],  // SQL opps in PBI but missing from CRM data
 *     "gapAccounts": [...], // Passed through from classified data
 *     "summary": { ... }
 *   }
 */

import { readFileSync, writeFileSync } from "node:fs";

// ── Sales play taxonomy ─────────────────────────────────────────────

/** Correct sales plays for SQL modernization work */
const CORRECT_PLAYS = new Set([
  861980067, // Migrate and Modernize Your Estate
  861980037, // Build and Modernize AI Apps
]);

/** Adjacent but non-ideal — flag as warning */
const ADJACENT_PLAYS = new Set([
  861980098, // Innovate with Azure AI Apps and Agents
  861980038, // Unify Your Data Platform
  861980056, // Scale with Cloud and AI Endpoints
]);

/** Explicitly wrong — always critical */
const WRONG_PLAYS = new Set([
  861980027, // Data Security
  606820006, // Modern SecOps with Unified Platform
  861980097, // Copilot and Agents at Work
  861980020, // Sales Transformation with AI
  861980087, // Drive Cloud Success through Unified with Enhanced Solutions
  861980026, // ERP Transformation with AI
  861980040, // Not Applicable
  861980055, // Converged Communications
  861980068, // Innovate with Low Code AI and Agents
  861980030, // Secure AI Productivity
  861980101, // Protect Cloud AI Platform and Apps
  861980024, // Service Transformation with AI
]);

function classifySalesPlay(code, tier) {
  if (code == null) return "critical";
  if (tier === 2) return "warning"; // Tier 2 always warning regardless
  if (CORRECT_PLAYS.has(code)) return "clean";
  if (ADJACENT_PLAYS.has(code)) return "warning";
  return "critical";
}

// ── Args ────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
let pipelineFile = null;
let crmFile = null;
let previousFile = null;
let mailFile = null;
let format = "json";
let outputFile = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--pipeline" && args[i + 1]) pipelineFile = args[++i];
  else if (args[i] === "--crm" && args[i + 1]) crmFile = args[++i];
  else if (args[i] === "--previous" && args[i + 1]) previousFile = args[++i];
  else if (args[i] === "--mail" && args[i + 1]) mailFile = args[++i];
  else if (args[i] === "--format" && args[i + 1]) format = args[++i];
  else if (args[i] === "--output" && args[i + 1]) outputFile = args[++i];
  else if (!args[i].startsWith("-")) pipelineFile = args[i];
}

// ── Read pipeline data ──────────────────────────────────────────────
let pipelineRaw;
if (pipelineFile) {
  pipelineRaw = readFileSync(pipelineFile, "utf8");
} else {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  pipelineRaw = Buffer.concat(chunks).toString("utf8");
}
const classified = JSON.parse(pipelineRaw);

// ── Read previous snapshot (optional) ──────────────────────────────
let previousData = null;
if (previousFile) {
  try {
    previousData = JSON.parse(readFileSync(previousFile, "utf8"));
  } catch {
    previousData = null;
  }
}

// ── Read normalized mail (optional) ────────────────────────────────
let mailMessages = [];
if (mailFile) {
  try {
    const parsed = JSON.parse(readFileSync(mailFile, "utf8"));
    if (Array.isArray(parsed)) mailMessages = parsed;
    else if (Array.isArray(parsed.messages)) mailMessages = parsed.messages;
  } catch {
    mailMessages = [];
  }
}

// ── Read CRM data ───────────────────────────────────────────────────
let crmOpps = [];
if (crmFile) {
  const crmRaw = readFileSync(crmFile, "utf8");
  const crmParsed = JSON.parse(crmRaw);
  crmOpps = Array.isArray(crmParsed)
    ? crmParsed
    : crmParsed.opportunities || [];
}

// Build CRM lookup by opportunity ID
const crmById = new Map();
for (const opp of crmOpps) {
  const id = opp.opportunityid || opp.id || "";
  if (id) crmById.set(id.toLowerCase(), opp);
}

// ── Cross-reference ─────────────────────────────────────────────────

const critical = [];
const warning = [];
const clean = [];
const untaggedSalesProgram = [];
const unmatched = [];
const wins = [];

// Deduplicate by oppId — same opp may appear in multiple pipeline rows
const processedOppIds = new Set();

function isMissingSalesProgramTag(salesPlayCode, salesPlayName) {
  if (salesPlayCode == null || salesPlayCode === "") return true;
  if (Number(salesPlayCode) === 861980040) return true; // Not Applicable
  const lowerName = String(salesPlayName || "").toLowerCase();
  if (lowerName.includes("not applicable")) return true;
  return false;
}

for (const sqlOpp of classified.sqlOpps) {
  if (!sqlOpp.oppId) continue;
  const oppIdLower = sqlOpp.oppId.toLowerCase();

  // Skip if already processed (keep highest tier)
  if (processedOppIds.has(oppIdLower)) continue;
  processedOppIds.add(oppIdLower);

  const crmOpp = crmById.get(oppIdLower);

  if (!crmOpp) {
    // PBI has this opp but CRM data wasn't fetched for it
    unmatched.push({
      oppId: sqlOpp.oppId,
      oppName: sqlOpp.oppName,
      account: sqlOpp.account,
      tpid: sqlOpp.tpid,
      workload: sqlOpp.workload,
      tier: sqlOpp.tier,
      stage: sqlOpp.stage,
      owner: sqlOpp.owner,
      pipeACR: sqlOpp.pipeACR,
      oppLink: sqlOpp.oppLink,
      reason: "Not in CRM results — may need targeted lookup",
    });
    continue;
  }

  const salesPlayCode = crmOpp.msp_salesplay;
  const salesPlayName =
    crmOpp["msp_salesplay@OData.Community.Display.V1.FormattedValue"] || null;
  const crmOwner =
    crmOpp["_ownerid_value@OData.Community.Display.V1.FormattedValue"] ||
    sqlOpp.owner;
  const crmAccount =
    crmOpp["_parentaccountid_value@OData.Community.Display.V1.FormattedValue"] ||
    sqlOpp.account;

  const severity = classifySalesPlay(salesPlayCode, sqlOpp.tier);

  const record = {
    oppId: sqlOpp.oppId,
    oppName: sqlOpp.oppName || crmOpp.name,
    account: crmAccount,
    tpid: sqlOpp.tpid,
    workload: sqlOpp.workload,
    tier: sqlOpp.tier,
    stage: crmOpp.stage || crmOpp.msp_activesalesstage || sqlOpp.stage,
    owner: crmOwner,
    pipeACR: sqlOpp.pipeACR,
    oppLink: sqlOpp.oppLink || crmOpp.recordUrl || "",
    salesPlayCode,
    salesPlayName,
    expectedPlay: "Migrate and Modernize Your Estate",
    expectedCode: 861980067,
  };

  if (
    sqlOpp.salesProgramCategory &&
    isMissingSalesProgramTag(salesPlayCode, salesPlayName)
  ) {
    untaggedSalesProgram.push({
      ...record,
      salesProgramCategory: sqlOpp.salesProgramCategory,
      reason:
        "Milestone workload maps to Sales Program catalog, but opportunity sales play is missing/Not Applicable",
    });
  }

  // Keep existing SQL600 severity flow focused to tiered SQL detections.
  if (sqlOpp.tier === 0) continue;

  if (severity === "critical") critical.push(record);
  else if (severity === "warning") warning.push(record);
  else clean.push(record);
}

// Sort by pipeACR descending for prioritization
const sortByPipe = (a, b) => (b.pipeACR || 0) - (a.pipeACR || 0);
critical.sort(sortByPipe);
warning.sort(sortByPipe);
clean.sort(sortByPipe);

// ── Win detection: uncommitted -> committed ────────────────────────

function normalizeCommitment(value) {
  if (value == null) return "unknown";
  const v = String(value).toLowerCase();
  if (!v.trim()) return "unknown";
  if (v.includes("committed") && !v.includes("uncommitted")) return "committed";
  if (v.includes("uncommitted")) return "uncommitted";
  if (v.includes("pipeline")) return "pipeline";
  if (v.includes("not started")) return "uncommitted";
  return "other";
}

function betterState(a, b) {
  const rank = {
    committed: 4,
    uncommitted: 3,
    pipeline: 2,
    other: 1,
    unknown: 0,
  };
  return rank[a] >= rank[b] ? a : b;
}

function buildCommitmentMap(source) {
  const map = new Map();
  if (!source || !Array.isArray(source.sqlOpps)) return map;
  for (const row of source.sqlOpps) {
    const id = (row.oppId || "").toLowerCase();
    if (!id) continue;
    const next = normalizeCommitment(row.commitment);
    const prev = map.get(id) || "unknown";
    map.set(id, betterState(prev, next));
  }
  return map;
}

const currentCommitmentByOpp = buildCommitmentMap(classified);
const previousCommitmentByOpp = buildCommitmentMap(previousData);

function lower(s) {
  return String(s || "").toLowerCase();
}

function tokenizeName(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 4)
    .slice(0, 6);
}

function isWinwireMessage(msg) {
  const blob = `${lower(msg.subject)} ${lower(msg.snippet)}`;
  return (
    blob.includes("winwire") ||
    blob.includes("win wire") ||
    blob.includes("win-wire") ||
    blob.includes("closed won") ||
    blob.includes("deal won")
  );
}

const candidateWinwireMail = mailMessages.filter(isWinwireMessage);

function correlateWinwire(win) {
  const acctTokens = tokenizeName(win.account);
  const oppTokens = tokenizeName(win.oppName);
  const matches = [];

  for (const msg of candidateWinwireMail) {
    const blob = `${lower(msg.subject)} ${lower(msg.snippet)}`;
    const acctMatch = acctTokens.some((t) => blob.includes(t));
    const oppMatch = oppTokens.some((t) => blob.includes(t));
    if (acctMatch || oppMatch) {
      matches.push({
        subject: msg.subject || "(no subject)",
        webLink: msg.webLink || "",
        received: msg.received || "",
      });
    }
  }

  matches.sort((a, b) => new Date(b.received) - new Date(a.received));
  return matches.slice(0, 3);
}

for (const row of [...critical, ...warning, ...clean]) {
  const id = lower(row.oppId);
  if (!id) continue;
  const previousCommitment = previousCommitmentByOpp.get(id) || "unknown";
  const currentCommitment = currentCommitmentByOpp.get(id) || "unknown";

  if (previousCommitment === "uncommitted" && currentCommitment === "committed") {
    const win = {
      oppId: row.oppId,
      oppName: row.oppName,
      account: row.account,
      owner: row.owner,
      stage: row.stage,
      pipeACR: row.pipeACR,
      oppLink: row.oppLink,
      fromCommitment: previousCommitment,
      toCommitment: currentCommitment,
      winwireMatches: correlateWinwire(row),
    };
    wins.push(win);
  }
}

wins.sort(sortByPipe);

// ── Summary ─────────────────────────────────────────────────────────

const summary = {
  generated: classified.generated || new Date().toISOString().slice(0, 10),
  scope: classified.scope || "SQL600 HLS",
  totalAccounts: classified.totalAccounts || 0,
  criticalCount: critical.length,
  warningCount: warning.length,
  untaggedSalesProgramCount: untaggedSalesProgram.length,
  cleanCount: clean.length,
  winCount: wins.length,
  winwireLinkedCount: wins.filter((w) => w.winwireMatches.length > 0).length,
  unmatchedCount: unmatched.length,
  gapAccountCount: (classified.gapAccounts || []).length,
  totalSqlCoresInGap: (classified.summary || {}).totalSqlCoresInGap || 0,
  pbiTier1: (classified.summary || {}).tier1Count || 0,
  pbiTier2: (classified.summary || {}).tier2Count || 0,
  crmCoverage: `${processedOppIds.size - unmatched.length}/${processedOppIds.size}`,
};

const result = {
  ...summary,
  critical,
  warning,
  untaggedSalesProgram,
  clean,
  wins,
  unmatched,
  gapAccounts: classified.gapAccounts || [],
};

// ── Output ──────────────────────────────────────────────────────────

function fmtDollar(v) {
  if (v == null || v === 0) return "$0";
  // Handle dollar strings from PBI like "$50,000"
  const n = typeof v === "string" ? parseFloat(v.replace(/[$,]/g, "")) : v;
  if (isNaN(n) || n === 0) return "$0";
  const abs = Math.abs(n);
  if (abs >= 1e6) return `$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(abs / 1e3).toFixed(0)}K`;
  return `$${Math.round(abs)}`;
}

function fmtNum(v) {
  if (v == null) return "—";
  return typeof v === "number" ? v.toLocaleString("en-US") : String(v);
}

/** Escape chars that break markdown tables (|) and links ([ ]) */
function esc(s) {
  if (s == null) return "—";
  return String(s).replace(/\|/g, "\\|").replace(/\[/g, "\\[").replace(/\]/g, "\\]");
}

/** Build a markdown link with proper escaping for table cells */
function mdLink(text, url) {
  if (!url) return esc(text);
  // Escape ] and [ in link text so the link syntax stays intact,
  // then escape | so the table cell doesn't break
  const safeText = String(text || "").replace(/\[/g, "\\[").replace(/\]/g, "\\]").replace(/\|/g, "\\|");
  return `[${safeText}](${url})`;
}

function generateMarkdown() {
  const date = summary.generated;
  const lines = [];

  lines.push("---");
  lines.push("tags: [sql600, hls, tagging-audit, hygiene]");
  lines.push(`generated: ${date}`);
  lines.push("source: pbi+crm");
  lines.push("model: SQL 600 Performance Tracking");
  lines.push('scope: "SQL600 HLS (Healthcare)"');
  lines.push(`audit_mode: Full`);
  lines.push(`total_accounts_scanned: ${summary.totalAccounts}`);
  lines.push(`critical_count: ${summary.criticalCount}`);
  lines.push(`warning_count: ${summary.warningCount}`);
  lines.push(`untagged_sales_program_count: ${summary.untaggedSalesProgramCount}`);
  lines.push(`win_count: ${summary.winCount}`);
  lines.push(`winwire_linked_count: ${summary.winwireLinkedCount}`);
  lines.push(`gap_account_count: ${summary.gapAccountCount}`);
  lines.push(`clean_count: ${summary.cleanCount}`);
  lines.push("---");
  lines.push("");
  lines.push(`# SQL600 Sales Play Tagging Audit — ${date}`);
  lines.push("");
  lines.push(
    `**Scope:** ${summary.totalAccounts} SQL600 HLS accounts scanned`
  );
  lines.push(
    `**Results:** 🔴 ${summary.criticalCount} Critical · 🟡 ${summary.warningCount} Warning · 🧭 ${summary.untaggedSalesProgramCount} Untagged Program · 🏆 ${summary.winCount} Wins · ⚪ ${summary.gapAccountCount} Gap Accounts · ✅ ${summary.cleanCount} Clean`
  );
  if (summary.unmatchedCount > 0) {
    lines.push(
      `**CRM Coverage:** ${summary.crmCoverage} opps matched (${summary.unmatchedCount} unmatched — need targeted CRM lookup)`
    );
  }
  lines.push("");
  lines.push("---");
  lines.push("");

  // ── Wins ──
  lines.push("## 🏆 Wins — Uncommitted -> Committed");
  lines.push("");
  if (wins.length === 0) {
    lines.push("None detected in this run (or no previous snapshot provided).");
  } else {
    lines.push(
      "| Account | Opportunity | Owner | Stage | Pipeline ACR | Winwire Evidence |"
    );
    lines.push("|---|---|---|---|---|---|");
    for (const w of wins) {
      const oppCell = mdLink(w.oppName, w.oppLink);
      const winwireCell = w.winwireMatches.length
        ? w.winwireMatches
            .map((m) => mdLink(m.subject, m.webLink))
            .join("<br>")
        : "—";
      lines.push(
        `| **${esc(w.account)}** | ${oppCell} | ${esc(w.owner)} | ${esc(w.stage)} | ${fmtDollar(w.pipeACR)} | ${winwireCell} |`
      );
    }
    lines.push("");
    lines.push(
      `> **Winwire correlation:** ${summary.winwireLinkedCount}/${summary.winCount} wins have matching inbox evidence.`
    );
  }
  lines.push("");
  lines.push("---");
  lines.push("");

  // ── Critical ──
  lines.push("## 🔴 Critical — Wrong or Missing Sales Play");
  lines.push("");
  if (critical.length === 0) {
    lines.push(
      "None detected. All SQL-workload opps have correct sales play."
    );
  } else {
    lines.push(
      "| Account | Opportunity | Current Sales Play | Expected Play | Workload | Owner |"
    );
    lines.push("|---|---|---|---|---|---|");
    for (const r of critical) {
      const playLabel = r.salesPlayName
        ? esc(r.salesPlayName)
        : "❌ MISSING";
      const oppCell = mdLink(r.oppName, r.oppLink);
      lines.push(
        `| **${esc(r.account)}** | ${oppCell} | ${playLabel} | → **${esc(r.expectedPlay)}** | ${esc(r.workload)} | ${esc(r.owner)} |`
      );
    }
    lines.push("");
    lines.push(
      '> **Action:** Update `msp_salesplay` to "Migrate and Modernize Your Estate" (861980067) on each flagged opportunity.'
    );
  }
  lines.push("");
  lines.push("---");
  lines.push("");

  // ── Warning ──
  lines.push("## 🟡 Warning — Adjacent Sales Play");
  lines.push("");
  if (warning.length === 0) {
    lines.push("None detected.");
  } else {
    lines.push(
      "| Account | Opportunity | Current Sales Play | Workload | Stage | Pipeline ACR |"
    );
    lines.push("|---|---|---|---|---|---|");
    for (const r of warning) {
      const oppCell = mdLink(r.oppName, r.oppLink);
      lines.push(
        `| **${esc(r.account)}** | ${oppCell} | ${esc(r.salesPlayName) || "—"} | ${esc(r.workload)} | ${esc(r.stage)} | ${fmtDollar(r.pipeACR)} |`
      );
    }
  }
  lines.push("");
  lines.push("---");
  lines.push("");

  // ── Untagged Sales Program ──
  lines.push("## 🧭 Untagged Sales Program — Workload Mapped, Sales Play Missing");
  lines.push("");
  if (untaggedSalesProgram.length === 0) {
    lines.push("None detected.");
  } else {
    lines.push(
      "| Account | Opportunity | Sales Program Category | Workload | Current Sales Play | Owner |"
    );
    lines.push("|---|---|---|---|---|---|");
    for (const r of untaggedSalesProgram) {
      const playLabel = r.salesPlayName ? esc(r.salesPlayName) : "❌ MISSING";
      const oppCell = mdLink(r.oppName, r.oppLink);
      lines.push(
        `| **${esc(r.account)}** | ${oppCell} | ${esc(r.salesProgramCategory)} | ${esc(r.workload)} | ${playLabel} | ${esc(r.owner)} |`
      );
    }
    lines.push("");
    lines.push(
      "> **Action:** Catalyst v-team outreach: coach sellers/SEs to set the opportunity Sales Play to the appropriate program-aligned value before governance review."
    );
  }
  lines.push("");
  lines.push("---");
  lines.push("");

  // ── Gap Accounts ──
  lines.push("## ⚪ Gap Accounts — No SQL Pipeline");
  lines.push("");
  const gaps = result.gapAccounts;
  if (gaps.length === 0) {
    lines.push(
      "None detected. All SQL600 HLS accounts have SQL pipeline coverage."
    );
  } else {
    lines.push(
      "| Account | Vertical | Field Area | SQL Cores | ACR (LCM) | Committed Pipe | Gap Type |"
    );
    lines.push("|---|---|---|---|---|---|---|");
    for (const g of gaps) {
      lines.push(
        `| **${esc(g.account)}** | ${esc(g.vertical)} | ${esc(g.fieldArea)} | ${fmtNum(g.sqlCores)} | ${fmtDollar(g.acrLCM)} | ${fmtDollar(g.pipeCommitted)} | ${esc(g.gapType)} |`
      );
    }
    lines.push("");
    lines.push(
      `> **Total gap:** ${fmtNum(summary.totalSqlCoresInGap)} SQL Cores unaddressed across ${gaps.length} accounts.`
    );
  }
  lines.push("");
  lines.push("---");
  lines.push("");

  // ── Clean ──
  lines.push("## ✅ Clean — Correctly Tagged");
  lines.push("");
  lines.push(
    `${summary.cleanCount} opportunities with SQL workloads and correct sales play.`
  );
  lines.push("");

  // ── Unmatched (if any) ──
  if (unmatched.length > 0) {
    lines.push("---");
    lines.push("");
    lines.push("## ⚠️ Unmatched — CRM Data Missing");
    lines.push("");
    lines.push(
      `${unmatched.length} SQL-relevant opportunities found in PBI but not in the CRM batch. Need targeted lookup.`
    );
    lines.push("");
    lines.push("| Account | Opportunity | Workload | Tier | Stage |");
    lines.push("|---|---|---|---|---|");
    for (const u of unmatched) {
      const oppCell = mdLink(u.oppName, u.oppLink);
      lines.push(
        `| **${esc(u.account)}** | ${oppCell} | ${esc(u.workload)} | T${u.tier} | ${esc(u.stage)} |`
      );
    }
  }

  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## Audit Methodology");
  lines.push("");
  lines.push(
    "- **PBI Source:** SQL 600 Performance Tracking (`c848b220-eaf2-42e0-b6d2-9633a6e39b37`)"
  );
  lines.push(
    "- **CRM Cross-ref:** `msp_salesplay` on opportunity entity"
  );
  lines.push(
    "- **Win Detection:** compare previous vs current milestone commitment state on each opportunity (`uncommitted` -> `committed`)"
  );
  lines.push(
    "- **Winwire Correlation:** optional matching against normalized inbox messages (`normalize-mail.js`) using winwire keywords + account/opportunity token overlap"
  );
  lines.push(
    '- **SQL Workload Detection:** Tier 1 = workload starts with "Data: SQL" or contains Sybase/Oracle migration; Tier 2 = MySQL/PostgreSQL'
  );
  lines.push(
    '- **Expected Sales Play:** "Migrate and Modernize Your Estate" (861980067) or "Build and Modernize AI Apps" (861980037)'
  );

  return lines.join("\n");
}

let outputText;
if (format === "md") {
  outputText = generateMarkdown();
} else {
  outputText = JSON.stringify(result, null, 2);
}

if (outputFile) {
  writeFileSync(outputFile, outputText, "utf8");
  console.error(`Wrote ${format} output to ${outputFile}`);
} else {
  console.log(outputText);
}
