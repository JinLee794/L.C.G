#!/usr/bin/env node
/**
 * generate-next-steps.js — Enrich SQL600 data JSON with LLM-generated
 * "Recommended Next Step" per account and a portfolio-level
 * "Modernization + AI Enablement Outlook" narrative.
 *
 * Uses GitHub Models API (OpenAI-compatible) via the `openai` SDK.
 * Auth: `gh auth token` (GitHub CLI) or $GITHUB_TOKEN env var.
 *
 * Usage:
 *   node scripts/helpers/generate-next-steps.js .copilot/docs/sql600-data-2026-04-20.json
 *   node scripts/helpers/generate-next-steps.js .copilot/docs/sql600-data-2026-04-20.json --model gpt-4.1-mini
 *   node scripts/helpers/generate-next-steps.js .copilot/docs/sql600-data-2026-04-20.json --batch-size 10
 *   node scripts/helpers/generate-next-steps.js .copilot/docs/sql600-data-2026-04-20.json --no-batch --concurrency 5
 *   node scripts/helpers/generate-next-steps.js .copilot/docs/sql600-data-2026-04-20.json --dry-run
 *
 * By default, accounts are grouped into batches (--batch-size 10) for fewer API calls.
 * Use --no-batch to revert to one-call-per-account with --concurrency control.
 *
 * Mutates the input JSON file in-place (same pattern as enrich-sql600-accounts.js).
 * Adds:
 *   - topAccounts[].NextStep          (string)
 *   - gapAccounts[].NextStep          (string)
 *   - renewals[].NextStep             (string)
 *   - _aiInsight.modernizationOutlook (string)
 *
 * Run AFTER enrich-sql600-accounts.js and BEFORE generate-sql600-report.js.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import OpenAI from "openai";

// ── CLI args ────────────────────────────────────────────────────────
const args = process.argv.slice(2);
let dataPath = null;
let model = "gpt-4.1-mini";
let concurrency = 3;
let batchSize = 10;
let dryRun = false;
let noBatch = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--model" && args[i + 1]) model = args[++i];
  else if (args[i] === "--concurrency" && args[i + 1])
    concurrency = parseInt(args[++i], 10) || 3;
  else if (args[i] === "--batch-size" && args[i + 1])
    batchSize = parseInt(args[++i], 10) || 10;
  else if (args[i] === "--no-batch") noBatch = true;
  else if (args[i] === "--dry-run") dryRun = true;
  else if (!args[i].startsWith("-")) dataPath = args[i];
}

if (!dataPath) {
  console.error(
    "usage: generate-next-steps.js <sql600-data.json> [--model gpt-4.1-mini] [--batch-size 10] [--concurrency 3] [--no-batch] [--dry-run]"
  );
  process.exit(1);
}

// ── Auth ─────────────────────────────────────────────────────────────
function resolveToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  try {
    return execSync("gh auth token", { encoding: "utf8" }).trim();
  } catch {
    console.error(
      "No GITHUB_TOKEN env var and `gh auth token` failed. Run `gh auth login` first."
    );
    process.exit(1);
  }
}

const token = resolveToken();
const client = new OpenAI({
  baseURL: "https://models.github.ai/inference",
  apiKey: token,
});

// ── Helpers ──────────────────────────────────────────────────────────

function fmtDollar(v) {
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[$,]/g, "")) || 0;
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtNum(v) {
  const n = typeof v === "number" ? v : parseInt(String(v).replace(/,/g, ""), 10) || 0;
  return n.toLocaleString("en-US");
}

function buildAccountContext(acct, section, snapshot) {
  const lines = [];
  lines.push(`Account: ${acct.TopParent || "Unknown"}`);
  lines.push(`Vertical: ${acct.Vertical || "—"}`);
  lines.push(`Segment: ${acct.Segment || "—"}`);
  if (acct.ACR_LCM != null) lines.push(`ACR (LCM): ${fmtDollar(acct.ACR_LCM)}`);
  if (acct.PipeCommitted != null) lines.push(`Committed Pipeline: ${fmtDollar(acct.PipeCommitted)}`);
  if (acct.PipeUncommitted != null) lines.push(`Uncommitted Pipeline: ${fmtDollar(acct.PipeUncommitted)}`);
  if (acct.AnnualizedGrowth != null) lines.push(`Annualized Growth: ${fmtDollar(acct.AnnualizedGrowth)}`);
  if (acct.SQLCores != null) lines.push(`SQL Cores (on-prem): ${fmtNum(acct.SQLCores)}`);
  if (acct.QualifiedOpps != null) lines.push(`Qualified Opps: ${acct.QualifiedOpps}`);
  if (acct.TotalOpps != null) lines.push(`Total Opps: ${acct.TotalOpps}`);
  if (acct.ArcEnabled) lines.push(`Arc Enabled: ${acct.ArcEnabled}`);
  if (acct.RenewalQuarter) lines.push(`Renewal Quarter: ${acct.RenewalQuarter}`);
  if (acct.Category) lines.push(`SQL500 Category: ${acct.Category}`);

  // Propensity signals from AzureCustomerAttributes
  const attr = attrByTpid.get(acct.TPID);
  if (attr) {
    const signals = [];
    if (attr.HasOpenAI === 'Y') signals.push('Has OpenAI workload');
    if (attr.HasOpenAI_Pipe === 'Y') signals.push('OpenAI in pipeline');
    if (attr.PTU_Target === 'Y') signals.push('PTU target customer');
    if (attr.NetNewMigrationTarget === 'Y') signals.push('Net-new migration target');
    if (attr.TrancheGrowthTarget === 'Y') signals.push('Tranche growth target');
    if (attr.GHCP_200Plus === 'Y') signals.push('GHCP 200+ target');
    if (attr.GHCP_200Less === 'Y') signals.push('GHCP <200 target');
    if (attr['500K_100K_Target']) signals.push(`500K/100K Target: ${attr['500K_100K_Target']}`);
    if (attr.ESI_Tier) signals.push(`ESI Tier: ${attr.ESI_Tier}`);
    if (attr.LXP_Category) signals.push(`LXP Category: ${attr.LXP_Category}`);
    if (signals.length) lines.push(`Propensity Signals: ${signals.join(', ')}`);
  }

  lines.push("");
  lines.push(`Section: ${section}`);
  lines.push(`Portfolio mod coverage: ${snapshot.AcctsWithModPipe || 0}/${(snapshot.AcctsWithModPipe || 0) + (snapshot.AcctsWithoutModPipe || 0)} accounts`);
  lines.push(`Factory attach: ${snapshot.FactoryAttach || "—"}`);
  return lines.join("\n");
}

const SINGLE_SYSTEM_PROMPT = `You are a SQL Server modernization strategist for Microsoft Healthcare accounts in the SQL600 program.

Given an account's metrics, produce ONE concrete recommended next step for SQL modernization.

STRICT FORMAT:
- 4 to 10 words only
- Start with an imperative verb (Initiate, Convert, Attach, Launch, Prioritize, Build, Accelerate)
- Single short phrase (not a sentence)
- No account name, no acronyms explanation, no rationale, no punctuation at the end

CONTENT:
- Name the motion explicitly (assessment, migration wave, factory attach, Arc enablement, pipeline conversion)
- Reflect the account context (pipeline state, growth, SQL core footprint, renewal timing)

Output ONLY the phrase text. No preamble, no bullets, no markdown.`;

const BATCH_SYSTEM_PROMPT = `You are a SQL Server modernization strategist for Microsoft Healthcare accounts in the SQL600 program.

You will receive a numbered list of accounts with their metrics. For EACH account, produce ONE concrete recommended next step for SQL modernization.

STRICT FORMAT per account:
- 4 to 10 words only
- Start with an imperative verb (Initiate, Convert, Attach, Launch, Prioritize, Build, Accelerate)
- Single short phrase (not a sentence)
- No account name, no acronyms explanation, no rationale, no punctuation at the end
- Name the motion explicitly (assessment, migration wave, factory attach, Arc enablement, pipeline conversion)
- Reflect the account context (pipeline state, growth, SQL core footprint, renewal timing)

Respond with a JSON object where keys are the account numbers (as strings) and values are the next-step phrases.
Example: {"1": "Initiate factory attach for SQL migration", "2": "Accelerate Arc enablement across SQL estate"}
Output ONLY valid JSON. No preamble, no markdown fences.`;

function sanitizeNextStep(text) {
  if (!text) return '';
  // Keep a compact, UI-friendly phrase shape.
  let clean = String(text)
    .replace(/\s+/g, ' ')
    .replace(/[.;:,!?]+$/g, '')
    .trim();

  // If model ignored instructions and returned multiple sentences, keep first.
  clean = clean.split(/[.!?]/)[0].trim();

  const words = clean.split(' ').filter(Boolean);
  if (words.length > 10) {
    clean = words.slice(0, 10).join(' ');
  }

  return clean;
}

async function withRetry(fn, retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const status = err.status || err.statusCode || 0;
      if (status === 429 && attempt < retries) {
        const delay = Math.min(2000 * 2 ** attempt, 30000);
        process.stderr.write(`  ⏳ Rate limited, waiting ${delay / 1000}s before retry…\n`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
}

async function generateNextStep(acct, section, snapshot) {
  const userContent = buildAccountContext(acct, section, snapshot);
  return withRetry(async () => {
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: SINGLE_SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      max_tokens: 150,
      temperature: 0.3,
    });
    return sanitizeNextStep(response.choices[0]?.message?.content || '');
  });
}

/**
 * Generate next steps for a batch of accounts in a single API call.
 * Returns an array of next-step strings aligned to the input batch.
 */
async function generateNextStepsBatch(batch, snapshot) {
  const numbered = batch
    .map((task, i) => {
      const ctx = buildAccountContext(task.acct, task.section, snapshot);
      return `--- Account ${i + 1} ---\n${ctx}`;
    })
    .join("\n\n");

  return withRetry(async () => {
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: BATCH_SYSTEM_PROMPT },
        { role: "user", content: numbered },
      ],
      max_tokens: 60 * batch.length,
      temperature: 0.3,
    });

    const raw = (response.choices[0]?.message?.content || "").trim();

    // Parse JSON response — strip markdown fences if present
    const jsonStr = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      // Fallback: if the model returned one step per line instead of JSON
      console.error("  ⚠️  Batch response was not valid JSON, falling back to line parsing");
      const lines = raw.split("\n").filter((l) => l.trim());
      return batch.map((_, i) => sanitizeNextStep(lines[i] || ""));
    }

    return batch.map((_, i) => {
      const key = String(i + 1);
      return sanitizeNextStep(parsed[key] || "");
    });
  });
}

const MODERNIZATION_OUTLOOK_PROMPT = `You are a SQL Server modernization strategist for Microsoft's Healthcare SQL600 program.

Given the portfolio-level metrics below, write a 2-3 sentence forward-looking insight that:
1. Assesses current modernization coverage and factory attach execution
2. Connects SQL modernization decisions NOW to downstream AI enablement readiness (Azure OpenAI, copilots, vectorized data services, Fabric)
3. Calls out where delay creates re-platforming risk later

Output ONLY the narrative text. No preamble, no markdown formatting.`;

async function generateModernizationOutlook(snapshot) {
  const metrics = [
    `Accounts with mod pipeline: ${snapshot.AcctsWithModPipe || 0}`,
    `Accounts without mod pipeline: ${snapshot.AcctsWithoutModPipe || 0}`,
    `Modernization opps: ${snapshot.ModernizationOpps || 0}`,
    `Factory attach rate: ${snapshot.FactoryAttach || "—"}`,
    `Pipeline penetration: ${snapshot.PipelinePenetration || "—"}`,
    `Total SQL cores: ${fmtNum(snapshot.SQLCores)}`,
    `ACR (LCM): ${fmtDollar(snapshot.ACR_LCM)}`,
    `Annualized growth: ${fmtDollar(snapshot.AnnualizedGrowth)}`,
  ].join("\n");

  return withRetry(async () => {
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: MODERNIZATION_OUTLOOK_PROMPT },
        { role: "user", content: metrics },
      ],
      max_tokens: 250,
      temperature: 0.3,
    });
    return (response.choices[0]?.message?.content || "").trim();
  });
}

// ── Parallel execution with concurrency limit ────────────────────────

async function parallelMap(items, fn, limit) {
  const results = new Array(items.length);
  let idx = 0;

  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i], i);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () =>
    worker()
  );
  await Promise.all(workers);
  return results;
}

// ── Main ─────────────────────────────────────────────────────────────

const data = JSON.parse(readFileSync(dataPath, "utf8"));
const snapshot = data.snapshot || {};

// TPID → attribute lookup for propensity signals
const attrByTpid = new Map(
  (data.aioAccountAttributes || []).map((a) => [a.TPID, a])
);

// Collect all account rows that need next steps
const tasks = [];
for (const acct of data.topAccounts || []) {
  tasks.push({ acct, section: "Top Account", list: "topAccounts" });
}
for (const acct of data.gapAccounts || []) {
  // Skip if already covered as a top account
  if (tasks.some((t) => t.acct.TPID && t.acct.TPID === acct.TPID)) continue;
  tasks.push({ acct, section: "GCP Leakage Risk (zero committed pipeline)", list: "gapAccounts" });
}
for (const acct of data.renewals || []) {
  if (tasks.some((t) => t.acct.TPID && t.acct.TPID === acct.TPID)) continue;
  tasks.push({ acct, section: "Renewal Watch", list: "renewals" });
}

console.log(
  `Generating next steps for ${tasks.length} accounts using ${model} (${noBatch ? `per-account, concurrency: ${concurrency}` : `batch size: ${batchSize}`})...`
);

if (dryRun) {
  console.log("Dry run — would generate next steps for:");
  for (const t of tasks) {
    console.log(`  [${t.section}] ${t.acct.TopParent || "?"}`);
  }
  if (!noBatch) {
    console.log(`  → ${Math.ceil(tasks.length / batchSize)} batched API calls`);
  }
  console.log(`  + 1 portfolio-level modernization outlook`);
  process.exit(0);
}

let nextSteps;

if (noBatch) {
  // Legacy per-account mode
  let completed = 0;
  nextSteps = await parallelMap(
    tasks,
    async (task) => {
      try {
        const step = await generateNextStep(task.acct, task.section, snapshot);
        completed++;
        if (completed % 5 === 0 || completed === tasks.length) {
          process.stderr.write(`  ${completed}/${tasks.length} accounts done\n`);
        }
        return step;
      } catch (err) {
        console.error(`  ⚠️  Failed for ${task.acct.TopParent}: ${err.message}`);
        return null;
      }
    },
    concurrency
  );
} else {
  // Batched mode — group accounts into chunks and process each chunk in one API call
  nextSteps = new Array(tasks.length).fill(null);
  const batches = [];
  for (let i = 0; i < tasks.length; i += batchSize) {
    batches.push({ start: i, items: tasks.slice(i, i + batchSize) });
  }
  console.log(`  Sending ${batches.length} batched requests (${batchSize} accounts each)...`);

  // Process batches with concurrency limit
  await parallelMap(
    batches,
    async (batch, batchIdx) => {
      try {
        const results = await generateNextStepsBatch(batch.items, snapshot);
        for (let j = 0; j < results.length; j++) {
          nextSteps[batch.start + j] = results[j];
        }
        process.stderr.write(`  Batch ${batchIdx + 1}/${batches.length} done (${results.filter(Boolean).length}/${batch.items.length} steps)\n`);
      } catch (err) {
        console.error(`  ⚠️  Batch ${batchIdx + 1} failed: ${err.message}`);
      }
    },
    concurrency
  );
}

// Write NextStep back into account rows
for (let i = 0; i < tasks.length; i++) {
  if (nextSteps[i]) {
    tasks[i].acct.NextStep = nextSteps[i];
  }
}

// Propagate NextStep to overlapping accounts that were deduped.
// Build TPID → NextStep lookup from all processed tasks, then fill gaps
// in gapAccounts and renewals that share a TPID with an already-processed account.
const stepByTpid = new Map();
for (const t of tasks) {
  if (t.acct.NextStep && t.acct.TPID) {
    stepByTpid.set(t.acct.TPID, t.acct.NextStep);
  }
}
for (const acct of data.gapAccounts || []) {
  if (!acct.NextStep && acct.TPID && stepByTpid.has(acct.TPID)) {
    acct.NextStep = stepByTpid.get(acct.TPID);
  }
}
for (const acct of data.renewals || []) {
  if (!acct.NextStep && acct.TPID && stepByTpid.has(acct.TPID)) {
    acct.NextStep = stepByTpid.get(acct.TPID);
  }
}

// Generate portfolio-level modernization outlook
let modernizationOutlook = null;
try {
  modernizationOutlook = await generateModernizationOutlook(snapshot);
  console.log("Generated modernization + AI enablement outlook.");
} catch (err) {
  console.error(`  ⚠️  Failed to generate modernization outlook: ${err.message}`);
}

// Store in a top-level key
if (modernizationOutlook) {
  data._aiInsight = data._aiInsight || {};
  data._aiInsight.modernizationOutlook = modernizationOutlook;
}

// Persist
writeFileSync(dataPath, JSON.stringify(data, null, 2));

const enriched = nextSteps.filter(Boolean).length;
console.log(
  `Done. Enriched ${enriched}/${tasks.length} accounts with next steps.`
);
