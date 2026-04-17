#!/usr/bin/env node
// Enrich /tmp/sql600-data-<date>.json with AccountId (and TPID where missing)
// for every row in topAccounts, renewals, gapAccounts so the HTML generator
// emits direct MSX entityrecord links.

import { readFileSync, writeFileSync } from 'fs';

const path = process.argv[2];
if (!path) {
  console.error('usage: enrich-sql600-accounts.js <data.json>');
  process.exit(1);
}

// name (lowercase) → { accountId, tpid }
const MAP = {
  'unitedhealth group':                      { accountId: 'c4c0e4fc-0f6f-4e50-8a30-269e648a930a', tpid: 629368 },
  'eclinicalworks':                          { accountId: '9e0bfd7d-7321-46b5-b790-39582ef24169', tpid: 8012737 },
  'molina healthcare':                       { accountId: '6f727f2d-5806-4e22-ba7c-bc47f0746d45', tpid: 1627751 },
  'veradigm':                                { accountId: '7783c7d5-2055-4b28-bd0e-5d6c7cc97709', tpid: 2494791 },
  'elevance health (anthem)':                { accountId: '508fa515-4a72-4d0c-8274-266eaa7cd889', tpid: null },
  'vizient inc':                             { accountId: '84c766aa-8bc3-442d-9973-35422cb9fe18', tpid: 1332742 },
  'iqvia':                                   { accountId: 'b6896cf9-d82f-42c0-95cb-13fe0ec64442', tpid: 1299142 },
  'hcsc':                                    { accountId: 'bb89b04c-61ef-4851-b236-2571956a2219', tpid: 892649 },
  'humana inc':                              { accountId: '97defb47-52e9-4d88-abb1-bc6f1f6236da', tpid: 894105 },
  'kaiser permanente':                       { accountId: '0433d744-a701-40b2-a513-166f18281eb2', tpid: 642914 },
  'hca healthcare':                          { accountId: '1b179a93-a804-41fd-b382-0f6a267b427f', tpid: null },
  'abbott laboratories':                     { accountId: '20e2a7ae-c5f2-407b-ba0f-1854cbc2189e', tpid: 641450 },
  'becton dickinson':                        { accountId: '2db8315c-e678-406d-8b91-adcc1f62f4d8', tpid: 642987 },
  'becton dickinson and company':            { accountId: '2db8315c-e678-406d-8b91-adcc1f62f4d8', tpid: 642987 },
  'epic systems':                            { accountId: '50c6d15d-336f-48b7-aa49-495f566f9f0a', tpid: null },
  'commonspirit health':                     { accountId: '873d882c-1fb6-4a18-8a7e-f11c545b41e4', tpid: 1071969 },
  'healthstream inc':                        { accountId: 'ebf1ebd5-530c-4a4e-b0e6-4576459d4841', tpid: 2515757 },
  'inovalon inc':                            { accountId: 'b3b67078-c818-42e0-bc74-fdb0b391e260', tpid: 11289066 },
  'netsmart technologies':                   { accountId: '0d4891db-d892-4e4e-beb1-43e0184cd400', tpid: 10433803 },
  'ascension health isd':                    { accountId: '9b3dd6d8-3c3b-457e-a18d-002c713cbb07', tpid: 3841220 },
  'intermountain healthcare':                { accountId: '513980a5-7c05-48e8-b966-560150489202', tpid: 646169 },
  'advocate health':                         { accountId: 'bcc48c41-2c05-46bd-bde2-4d411cc50592', tpid: 1379901 },
  'life point hospitals inc':                { accountId: '5f2cd8e8-026b-4cc9-9c89-adb5fb620950', tpid: 3802393 },
  'piedmont hospital':                       { accountId: '856c87a9-4e06-48fd-ac44-b8c8d85d08da', tpid: 2514756 },
  'ohiohealth':                              { accountId: '32591701-3a60-4e42-8aeb-2923ef7ed04f', tpid: 1698262 },
  'ssm rehab':                               { accountId: '37a97d1d-218c-41ec-9269-1f192d106b3c', tpid: 883725 },
  'novant health':                           { accountId: '73fe50ed-5f90-4d9b-9ca1-2b7878249890', tpid: 2337824 },
  'sanford health':                          { accountId: '65d9acdc-ce72-4ca1-a44e-b5addc73cb17', tpid: 732996 },
  'indiana university health':               { accountId: '97054e1c-bea0-4c2f-88a5-8dc8d5a7b9d4', tpid: 1468429 },
  'orlando health':                          { accountId: 'c34fcb86-830c-476d-8f82-bca702be798d', tpid: 1070433 },
  'wellspan health':                         { accountId: '870958fc-577f-4106-94d6-731f87601c7b', tpid: 942727 },
  'university of maryland medical system':   { accountId: '3095fc37-5012-436d-b79d-bf7621da4bb2', tpid: 2058642 },
  'integris health inc':                     { accountId: '6db0796e-5145-45b9-af4c-ee1a5bddea00', tpid: 1118915 },
  'ballad health':                           { accountId: '4f03ec43-a81d-4a2a-9ccb-f52f7c6f1510', tpid: 2837359 },
  'adventist health system west':            { accountId: '10180832-8437-4444-9441-68e8da890629', tpid: 646734 },
  'select medical corp':                     { accountId: '0c7904c2-fc3e-4914-8e9c-e6e3bdc031ae', tpid: 1815612 },
  'honorhealth':                             { accountId: '8c39a5da-20f5-4097-9910-e80bbf2a85f6', tpid: 997146 },
  'pfizer inc':                              { accountId: '18000ccf-ed3e-41fe-a533-72a5582ef310', tpid: 637424 },
  'trinity health':                          { accountId: 'f2c6fc6d-ff06-4457-a48e-215c162e54de', tpid: 884937 },
  'bjc health care':                         { accountId: 'df31a817-4555-4a69-9035-c5790ac9a8df', tpid: 657257 },
  'mercy health':                            { accountId: '63f965f3-338a-4779-9b71-6d3513aaf859', tpid: null },
  "st. jude children's research hospital":   { accountId: 'e62b6eff-2f87-4d52-a921-6d2955cc786d', tpid: 763637 },
};

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
