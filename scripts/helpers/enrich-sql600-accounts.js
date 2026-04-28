#!/usr/bin/env node
// Enrich .copilot/docs/sql600-data-<date>.json with AccountId (and TPID where missing)
// for every row in topAccounts, renewals, gapAccounts so the HTML generator
// emits direct MSX entityrecord links.

import { readFileSync, writeFileSync } from 'fs';

const path = process.argv[2];
if (!path) {
  console.error('usage: enrich-sql600-accounts.js <data.json>');
  process.exit(1);
}

// name (lowercase) → { accountId, tpid }
// Populate this map with your own account data.
// Example:
//   'acme corporation':  { accountId: '00000000-0000-0000-0000-000000000001', tpid: 100001 },
//   'contoso health':    { accountId: '00000000-0000-0000-0000-000000000002', tpid: 100002 },
const MAP = {};

const data = JSON.parse(readFileSync(path, 'utf8'));
let enriched = 0, missing = [];
for (const list of [data.topAccounts, data.renewals, data.gapAccounts]) {
  for (const row of list || []) {
    const key = (row.TopParent || '').trim().toLowerCase();
    const hit = MAP[key];
    if (!hit) { missing.push(row.TopParent); continue; }
    row.AccountId = hit.accountId;
    if (!row.TPID && hit.tpid) row.TPID = hit.tpid;
    enriched++;
  }
}
writeFileSync(path, JSON.stringify(data, null, 2));
console.log(`Enriched ${enriched} rows.`);
if (missing.length) console.log(`Unmapped: ${[...new Set(missing)].join(', ')}`);
