#!/usr/bin/env node
/**
 * generate-sql600-report.js
 *
 * Generates a self-contained HTML executive dashboard for SQL600 HLS.
 * Input:  JSON file with PBI query results (or stdin)
 * Output: Standalone HTML file to .copilot/docs/
 *
 * Usage:
 *   node scripts/helpers/generate-sql600-report.js /tmp/sql600-data.json
 *   cat /tmp/sql600-data.json | node scripts/helpers/generate-sql600-report.js
 *   node scripts/helpers/generate-sql600-report.js --output path/to/output.html /tmp/sql600-data.json
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, statSync } from 'fs';
import { dirname, resolve, basename } from 'path';
import { execSync } from 'child_process';
import { homedir } from 'os';

// ── Arg parsing ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
let inputFile = null;
let outputFile = null;
let narrativeFile = null;
let noPdf = false;
let noShare = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--output' && args[i + 1]) { outputFile = args[++i]; continue; }
  if (args[i] === '--narrative' && args[i + 1]) { narrativeFile = args[++i]; continue; }
  if (args[i] === '--no-pdf') { noPdf = true; continue; }
  if (args[i] === '--no-share') { noShare = true; continue; }
  if (!args[i].startsWith('-')) inputFile = args[i];
}

// ── Read input ───────────────────────────────────────────────────────────────
let raw;
if (inputFile) {
  raw = readFileSync(inputFile, 'utf8');
} else {
  raw = readFileSync('/dev/stdin', 'utf8');
}
const data = JSON.parse(raw);

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtDollar(v, compact = true) {
  if (v == null || v === '') return '—';
  const n = typeof v === 'string' ? parseFloat(v.replace(/[$,()]/g, '')) : v;
  if (isNaN(n)) return '—';
  const neg = n < 0;
  const abs = Math.abs(n);
  let s;
  if (compact) {
    if (abs >= 1e9) s = `$${(abs / 1e9).toFixed(1)}B`;
    else if (abs >= 1e6) s = `$${(abs / 1e6).toFixed(1)}M`;
    else if (abs >= 1e3) s = `$${(abs / 1e3).toFixed(0)}K`;
    else s = `$${Math.round(abs)}`;
  } else {
    s = '$' + Math.round(abs).toLocaleString('en-US');
  }
  return neg ? `(${s})` : s;
}

function fmtPct(v) {
  if (v == null || v === '') return '—';
  const s = typeof v === 'string' ? v : `${(v * 100).toFixed(1)}%`;
  return s.replace(/%$/, '') + '%';
}

function fmtNum(v) {
  if (v == null || v === '') return '—';
  const n = typeof v === 'number' ? v : parseInt(String(v).replace(/,/g, ''), 10);
  return isNaN(n) ? '—' : n.toLocaleString('en-US');
}

function parseDollar(v) {
  if (v == null || v === '' || v === '—') return 0;
  if (typeof v === 'number') return v;
  return parseFloat(String(v).replace(/[$,()]/g, '')) * (String(v).includes('(') ? -1 : 1);
}

function arrow(current, prior) {
  const c = parseDollar(current), p = parseDollar(prior);
  if (p === 0) return '→';
  const pct = Math.abs((c - p) / p);
  if (pct < 0.01) return '→';
  return c > p ? '↑' : '↓';
}

function arrowClass(dir) {
  if (dir === '↑') return 'arrow-up';
  if (dir === '↓') return 'arrow-down';
  return 'arrow-flat';
}

// ── Extract data ─────────────────────────────────────────────────────────────
const snapshot = data.snapshot;
const ranking = data.ranking || [];
const verticals = data.verticals || [];
const trend = data.trend || [];
const topAccounts = data.topAccounts || [];
const renewals = data.renewals || [];
const gapAccounts = data.gapAccounts || [];
const aioAccountMoM = data.aioAccountMoM || [];
const aioServiceBreakdown = data.aioServiceBreakdown || [];
const aioBudgetAttainment = data.aioBudgetAttainment || [];
const hasAioData = aioAccountMoM.length > 0 || aioServiceBreakdown.length > 0 || aioBudgetAttainment.length > 0;
const generated = data.generated || new Date().toISOString().slice(0, 10);

// ── MSX deep links ───────────────────────────────────────────────────────────
const MSX_BASE = 'https://microsoftsales.crm.dynamics.com/main.aspx';

// Build a name → TPID fallback map from any row that has one
const tpidIndex = new Map();
for (const list of [topAccounts, renewals, gapAccounts]) {
  for (const row of list || []) {
    if (row?.TopParent && row?.TPID) {
      tpidIndex.set(row.TopParent.trim().toLowerCase(), row.TPID);
    }
  }
}
function resolveTpid(row) {
  if (row?.TPID) return row.TPID;
  const key = (row?.TopParent || '').trim().toLowerCase();
  return tpidIndex.get(key) || null;
}
function msxAccountUrl(row) {
  // Prefer explicit URLs from the data (AccountUrl / msxUrl / recordUrl)
  if (row?.AccountUrl) return row.AccountUrl;
  if (row?.msxUrl) return row.msxUrl;
  if (row?.recordUrl) return row.recordUrl;
  // GUID → direct record (only reliable deep link). TPID/name search URLs
  // silently land on the user's "My Active Accounts" home view in MSX, so we
  // intentionally do NOT emit a clickable link when only TPID/name is known.
  if (row?.AccountId) return `${MSX_BASE}?etn=account&id=${row.AccountId}&pagetype=entityrecord`;
  return null;
}
function msxOppUrl(row) {
  if (row?.OpportunityLink) return row.OpportunityLink;
  if (row?.OpportunityUrl) return row.OpportunityUrl;
  if (row?.OpportunityId) return `${MSX_BASE}?etn=opportunity&id=${row.OpportunityId}&pagetype=entityrecord`;
  return null;
}
function acctCell(row, options = {}) {
  const { maxWidth, showTpid = true } = options;
  const url = msxAccountUrl(row);
  const name = row.TopParent || '—';
  const tpidVal = resolveTpid(row);
  const tpid = tpidVal ? `<span class="acct-tpid">${tpidVal}</span>` : '';
  const style = maxWidth ? ` style="max-width:${maxWidth}px"` : '';
  const inner = url
    ? `<a class="msx-link" href="${url}" target="_blank" rel="noopener" title="Open in MSX">${name}</a>`
    : name;
  return `<td class="acct-name"${style}>${inner}${showTpid && tpid ? ' ' + tpid : ''}</td>`;
}

// ── Rationale helpers ────────────────────────────────────────────────────────
// Per-row "Why flagged" explanations derived deterministically from the row's
// own numeric signals. Each returns a short HTML string (chips separated by ·).
function chip(cls, text) { return `<span class="why-chip ${cls}">${text}</span>`; }

function topAccountRationale(a, rank) {
  if (a?.Rationale) return a.Rationale;
  const chips = [];
  if (rank === 0) chips.push(chip('why-lead', '#1 by ACR'));
  else if (rank < 3) chips.push(chip('why-lead', `#${rank + 1} by ACR`));
  const growth = a.AnnualizedGrowth || 0;
  if (growth >= 50e6) chips.push(chip('why-good', `${fmtDollar(growth)} growth`));
  else if (growth >= 10e6) chips.push(chip('why-neutral', `${fmtDollar(growth)} growth`));
  else if (growth < 0) chips.push(chip('why-bad', `${fmtDollar(growth)} decline`));
  const committed = a.PipeCommitted || 0;
  const uncommitted = a.PipeUncommitted || 0;
  if (committed === 0 && uncommitted > 0) chips.push(chip('why-bad', 'no committed pipe'));
  else if (committed >= 10e6) chips.push(chip('why-good', `${fmtDollar(committed)} committed`));
  const q = a.QualifiedOpps || 0, t = a.TotalOpps || 0;
  if (t > 0 && q / t < 0.3) chips.push(chip('why-bad', `only ${q}/${t} qualified`));
  else if (t >= 50) chips.push(chip('why-neutral', `${t} active opps`));
  if (a.Segment === 'Strategic') chips.push(chip('why-neutral', 'Strategic'));
  return chips.join(' ');
}

// NextStep and modernization outlook are pre-computed by generate-next-steps.js
// via the GitHub Models API. The renderer reads them from the enriched JSON.
function compactNextStep(text) {
  if (!text) return '';
  const cleaned = String(text)
    .replace(/\s+/g, ' ')
    .replace(/[.;:,!?]+$/g, '')
    .trim();
  const first = cleaned.split(/[.!?]/)[0].trim();
  const words = first.split(' ').filter(Boolean);
  return words.slice(0, 10).join(' ');
}

function topAccountNextStep(a) {
  const compact = compactNextStep(a.NextStep || '');
  return compact || '<span style="color:var(--text-muted);font-style:italic">Run generate-next-steps.js to populate</span>';
}

function renewalRationale(r) {
  if (r?.Rationale) return r.Rationale;
  const chips = [];
  const q = r.RenewalQuarter || '';
  if (q === 'FY26-Q4') chips.push(chip('why-bad', 'renews this Q'));
  else if (q === 'FY26-Q3') chips.push(chip('why-warn', 'renews next Q'));
  else if (q) chips.push(chip('why-neutral', `renews ${q}`));
  const cores = r.SQLCores || 0;
  if (cores >= 10000) chips.push(chip('why-bad', `${fmtNum(cores)} cores at risk`));
  else if (cores >= 3000) chips.push(chip('why-warn', `${fmtNum(cores)} cores`));
  if (r.ArcEnabled !== 'Yes') chips.push(chip('why-bad', 'no Arc'));
  const committed = r.PipeCommitted || 0;
  if (committed === 0) chips.push(chip('why-bad', 'no committed pipe'));
  else if (committed < 500000) chips.push(chip('why-warn', 'thin pipe'));
  return chips.join(' ') || chip('why-neutral', '—');
}

function gapRationale(g) {
  if (g?.Rationale) return g.Rationale;
  const chips = [];
  const acr = g.ACR_LCM || 0;
  const uncommitted = g.PipeUncommitted || 0;
  const cores = g.SQLCores || 0;
  if (acr >= 1e6 && uncommitted < acr * 0.1) chips.push(chip('why-bad', 'ACR > 10× pipe'));
  else if (acr >= 500000 && uncommitted === 0) chips.push(chip('why-bad', 'zero pipe'));
  if (cores >= 5000) chips.push(chip('why-bad', `${fmtNum(cores)} cores unmodernized`));
  else if (cores >= 1000) chips.push(chip('why-warn', `${fmtNum(cores)} cores`));
  if (acr >= 1e6) chips.push(chip('why-neutral', `${fmtDollar(acr)} ACR`));
  return chips.join(' ') || chip('why-neutral', 'low footprint');
}

// ── Narrative loader (markdown → per-section blockquote text) ───────────────
function autoDiscoverNarrative(date) {
  const candidates = [
    resolve(process.cwd(), '.copilot', 'docs', `sql600-hls-readout-${date}.md`),
    resolve(homedir(), 'Documents/Obsidian/Jin @ microsoft', 'Daily', 'SQL600-HLS', `sql600-hls-readout-${date}.md`),
  ];
  return candidates.find(p => existsSync(p)) || null;
}
function parseNarrative(mdPath) {
  if (!mdPath || !existsSync(mdPath)) return {};
  const md = readFileSync(mdPath, 'utf8');
  const sections = {};
  const headingRe = /^##\s+(.+?)\s*$/gm;
  const matches = [...md.matchAll(headingRe)];
  for (let i = 0; i < matches.length; i++) {
    const rawTitle = matches[i][1].trim();
    const start = matches[i].index + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : md.length;
    const body = md.slice(start, end);

    // Classify the heading by keyword
    const key = classifyHeading(rawTitle);
    if (!key) continue;

    if (key === 'takeaways') {
      // Capture bullet list
      const bullets = [...body.matchAll(/^\s*-\s*\[([!*di?>])\]\s+(.+)$/gm)]
        .map(m => ({ marker: m[1], text: m[2].trim() }));
      sections[key] = bullets;
    } else {
      // Extract first blockquote paragraph (supports multi-line `> ...`)
      const bqMatch = body.match(/(?:^|\n)((?:^>[^\n]*\n?)+)/m);
      if (bqMatch) {
        const quote = bqMatch[1]
          .split('\n')
          .map(l => l.replace(/^>\s?/, ''))
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (quote) sections[key] = quote;
      }
    }
  }
  return sections;
}
function classifyHeading(title) {
  const t = title.toLowerCase();
  if (t.includes('headline')) return 'headline';
  if (t.includes('trajectory') || t.includes('trend')) return 'trajectory';
  if (t.includes('vertical')) return 'vertical';
  if (t.includes('ranking')) return 'ranking';
  if (t.includes('top account')) return 'topAccounts';
  if (t.includes('renewal')) return 'renewal';
  if (t.includes('modernization')) return 'modernization';
  if (t.includes('gcp') || t.includes('leakage')) return 'gcp';
  if (t.includes('takeaway')) return 'takeaways';
  return null;
}
// Lightweight inline markdown → HTML (bold, italic, inline code)
function mdInline(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*]+)\*(?=[\s).,!?]|$)/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

const narrativePath = narrativeFile || autoDiscoverNarrative(generated);
const narrative = parseNarrative(narrativePath);

// Compute derived values
const trendValues = trend.map(t => parseDollar(t.ACR));
const trendMax = Math.max(...trendValues, 1);
const momDir = trendValues.length >= 2
  ? arrow(trendValues[trendValues.length - 1], trendValues[trendValues.length - 2])
  : '→';
const wowDir = parseDollar(snapshot.WoW_Change) > 0 ? '↑' : parseDollar(snapshot.WoW_Change) < 0 ? '↓' : '→';

// Industry ranking position
const hlsRank = ranking.findIndex(r => r.Industry === 'Healthcare') + 1;

// Renewal counts
const renewalQ4 = renewals.filter(r => r.RenewalQuarter === 'FY26-Q4').length;
const renewalQ3 = renewals.filter(r => r.RenewalQuarter === 'FY26-Q3').length;
const arcEnabled = renewals.filter(r => r.ArcEnabled === 'Yes').length;

// ── SVG Chart Builders ──────────────────────────────────────────────────────

/**
 * Chart 1: ACR Trajectory combo chart
 * - Area chart for realized monthly ACR (FY26)
 * - "You are here" marker at last closed month
 * - Forward-looking callout band showing committed + uncommitted pipe totals
 * - MoM delta labels on each data point
 */
function buildTrendChart(trend, committedPipe, uncommittedPipe) {
  const W = 680, H = 280, M = { top: 30, right: 140, bottom: 36, left: 52 };
  const iw = W - M.left - M.right, ih = H - M.top - M.bottom;
  const pts = trend.map(t => ({ month: t.FiscalMonth, q: t.FiscalQuarter, v: parseDollar(t.ACR) }));
  if (!pts.length) return '';
  const maxV = Math.max(...pts.map(p => p.v)) * 1.15;
  const minV = 0;
  const x = i => M.left + (i / Math.max(pts.length - 1, 1)) * iw;
  const y = v => M.top + ih - ((v - minV) / (maxV - minV)) * ih;

  // Area path
  const areaPath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.v)}`).join(' ')
    + ` L${x(pts.length - 1)},${M.top + ih} L${x(0)},${M.top + ih} Z`;
  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.v)}`).join(' ');

  // Y-axis ticks
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(r => minV + (maxV - minV) * r);

  // Quarter shaded bands
  const qGroups = [];
  let curQ = null, qStart = 0;
  pts.forEach((p, i) => {
    if (p.q !== curQ) {
      if (curQ !== null) qGroups.push({ q: curQ, start: qStart, end: i - 1 });
      curQ = p.q; qStart = i;
    }
  });
  qGroups.push({ q: curQ, start: qStart, end: pts.length - 1 });

  // Pipe horizon band (forward-looking annotation on right side)
  const horizonX = W - M.right + 20;
  const horizonW = M.right - 40;

  return `<svg viewBox="0 0 ${W} ${H}" class="chart-svg" preserveAspectRatio="xMidYMid meet">
  <defs>
    <linearGradient id="acrArea" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#a29bfe" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#6c5ce7" stop-opacity="0.05"/>
    </linearGradient>
    <pattern id="hatch" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
      <rect width="6" height="6" fill="#74b9ff" opacity="0.15"/>
      <line x1="0" y1="0" x2="0" y2="6" stroke="#74b9ff" stroke-width="1.5" opacity="0.6"/>
    </pattern>
  </defs>

  ${qGroups.map(g => {
    const color = g.q?.includes('Q1') ? '#6c5ce7' : g.q?.includes('Q2') ? '#0984e3' : '#00b894';
    const xs = Math.max(x(g.start) - (g.start === 0 ? 8 : iw / (pts.length - 1) / 2), M.left);
    const xe = Math.min(x(g.end) + (g.end === pts.length - 1 ? 8 : iw / (pts.length - 1) / 2), W - M.right);
    return `<rect x="${xs}" y="${M.top - 22}" width="${xe - xs}" height="16" rx="4" fill="${color}" opacity="0.18"/>
<text x="${(xs + xe) / 2}" y="${M.top - 10}" fill="${color}" font-size="10" font-weight="700" text-anchor="middle" class="chart-text">${g.q}</text>`;
  }).join('\n  ')}

  ${yTicks.map(v => `<line x1="${M.left}" x2="${W - M.right}" y1="${y(v)}" y2="${y(v)}" stroke="#2d3148" stroke-dasharray="2,3" opacity="0.6" class="chart-grid"/>
<text x="${M.left - 8}" y="${y(v) + 4}" fill="#8b8fa3" font-size="10" text-anchor="end" class="chart-axis">${fmtDollar(v)}</text>`).join('\n  ')}

  <path d="${areaPath}" fill="url(#acrArea)"/>
  <path d="${linePath}" fill="none" stroke="#a29bfe" stroke-width="2.5" class="chart-line"/>

  ${pts.map((p, i) => {
    const prev = i > 0 ? pts[i - 1].v : p.v;
    const delta = p.v - prev;
    const dPct = prev > 0 ? (delta / prev * 100) : 0;
    const dLabel = i === 0 ? '' : (delta >= 0 ? '+' : '') + dPct.toFixed(1) + '%';
    const dColor = delta >= 0 ? '#00b894' : '#ff6b6b';
    const month = new Date(p.month + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
    const isLast = i === pts.length - 1;
    return `<circle cx="${x(i)}" cy="${y(p.v)}" r="${isLast ? 6 : 4}" fill="${isLast ? '#6c5ce7' : '#a29bfe'}" stroke="#fff" stroke-width="2" class="chart-dot${isLast ? ' last' : ''}"/>
${isLast ? `<circle cx="${x(i)}" cy="${y(p.v)}" r="10" fill="none" stroke="#6c5ce7" stroke-width="1.5" opacity="0.5"><animate attributeName="r" from="6" to="14" dur="1.6s" repeatCount="indefinite"/><animate attributeName="opacity" from="0.7" to="0" dur="1.6s" repeatCount="indefinite"/></circle>` : ''}
<text x="${x(i)}" y="${H - 18}" fill="#8b8fa3" font-size="10" text-anchor="middle" class="chart-axis">${month}</text>
${dLabel ? `<text x="${x(i)}" y="${y(p.v) - 12}" fill="${dColor}" font-size="9" font-weight="700" text-anchor="middle" class="chart-delta">${dLabel}</text>` : ''}`;
  }).join('\n  ')}

  <!-- You are here -->
  <text x="${x(pts.length - 1)}" y="${H - 4}" fill="#6c5ce7" font-size="9" font-weight="700" text-anchor="middle" class="chart-marker">▲ NOW</text>

  <!-- Forward pipeline horizon (right side callout) -->
  <line x1="${W - M.right + 8}" y1="${M.top}" x2="${W - M.right + 8}" y2="${M.top + ih}" stroke="#74b9ff" stroke-width="1" stroke-dasharray="3,3" opacity="0.5"/>
  <g transform="translate(${horizonX}, ${M.top + 8})">
    <text x="0" y="0" fill="#74b9ff" font-size="10" font-weight="700" class="chart-text">FORWARD PIPE →</text>
    <rect x="0" y="10" width="${horizonW}" height="32" rx="4" fill="#00b894" opacity="0.25"/>
    <text x="8" y="22" fill="#00b894" font-size="9" font-weight="700" letter-spacing="0.5" class="chart-text">COMMITTED</text>
    <text x="8" y="36" fill="#00b894" font-size="13" font-weight="700" class="chart-text">${fmtDollar(committedPipe)}</text>
    <rect x="0" y="48" width="${horizonW}" height="32" rx="4" fill="url(#hatch)"/>
    <rect x="0" y="48" width="${horizonW}" height="32" rx="4" fill="none" stroke="#74b9ff" stroke-width="1" opacity="0.5"/>
    <text x="8" y="60" fill="#74b9ff" font-size="9" font-weight="700" letter-spacing="0.5" class="chart-text">UNCOMMITTED</text>
    <text x="8" y="74" fill="#74b9ff" font-size="13" font-weight="700" class="chart-text">${fmtDollar(uncommittedPipe)}</text>
    <text x="0" y="96" fill="#8b8fa3" font-size="9" class="chart-axis">= ${fmtDollar(committedPipe + uncommittedPipe)} total</text>
    <text x="0" y="108" fill="#8b8fa3" font-size="9" class="chart-axis">landing in forward months</text>
  </g>
</svg>`;
}

/**
 * Chart 2: Vertical Mix — donut/radial composition
 * Centers account count, radial segments sized by ACR contribution
 */
function buildVerticalMix(verticals, snapshotAcr, snapshotAccts) {
  const W = 260, H = 260, cx = W / 2, cy = H / 2, rOuter = 110, rInner = 72;
  const data = verticals.map(v => ({ ...v, acr: parseDollar(v.ACR_LCM) })).filter(v => v.acr > 0);
  const sumVerticals = data.reduce((s, d) => s + d.acr, 0);
  const total = snapshotAcr || sumVerticals;
  const totalAccts = snapshotAccts || data.reduce((s, d) => s + (d.AccountCount || 0), 0);
  if (sumVerticals === 0) return '';

  const colors = {
    'Health Payor': '#74b9ff',
    'Health Provider': '#00b894',
    'MedTech': '#a29bfe',
    'Health Pharma': '#ffc048'
  };

  let angle = -Math.PI / 2;
  const segments = data.map(d => {
    const frac = d.acr / sumVerticals;
    const start = angle;
    const end = angle + frac * Math.PI * 2;
    angle = end;
    const large = end - start > Math.PI ? 1 : 0;
    const x1 = cx + rOuter * Math.cos(start), y1 = cy + rOuter * Math.sin(start);
    const x2 = cx + rOuter * Math.cos(end), y2 = cy + rOuter * Math.sin(end);
    const ix1 = cx + rInner * Math.cos(start), iy1 = cy + rInner * Math.sin(start);
    const ix2 = cx + rInner * Math.cos(end), iy2 = cy + rInner * Math.sin(end);
    return {
      path: `M${x1},${y1} A${rOuter},${rOuter} 0 ${large} 1 ${x2},${y2} L${ix2},${iy2} A${rInner},${rInner} 0 ${large} 0 ${ix1},${iy1} Z`,
      color: colors[d.Vertical] || '#8b8fa3',
      vertical: d.Vertical,
      pct: (frac * 100).toFixed(0),
      acr: d.acr,
      accts: d.AccountCount
    };
  });

  const svg = `<svg viewBox="0 0 ${W} ${H}" class="chart-svg donut-svg" preserveAspectRatio="xMidYMid meet">
  ${segments.map(s => `<path d="${s.path}" fill="${s.color}" opacity="0.9" class="donut-seg"><title>${s.vertical}: ${fmtDollar(s.acr)} · ${s.accts} accts</title></path>`).join('\n  ')}

  <!-- Center labels (stacked inside inner hole with generous vertical spacing) -->
  <text x="${cx}" y="${cy - 10}" fill="#e4e5eb" font-size="32" font-weight="700" text-anchor="middle" class="donut-center">${totalAccts}</text>
  <text x="${cx}" y="${cy + 12}" fill="#8b8fa3" font-size="9" text-anchor="middle" letter-spacing="1.4" class="donut-center-label">HLS ACCOUNTS</text>
  <text x="${cx}" y="${cy + 32}" fill="#a29bfe" font-size="12" font-weight="700" text-anchor="middle" class="donut-center-total">${fmtDollar(total)} ACR</text>
</svg>`;

  const legend = `<div class="donut-legend">
  ${segments.map(s => `<div class="donut-legend-item">
    <span class="donut-legend-swatch" style="background:${s.color}"></span>
    <div>
      <div class="donut-legend-name">${s.vertical}</div>
      <div class="donut-legend-meta">${s.pct}% · ${s.accts} accts</div>
    </div>
  </div>`).join('\n  ')}
</div>`;

  return svg + legend;
}

/**
 * Chart 3: Renewal Pressure Timeline
 * Stacked bars by quarter: Arc-enabled (green) vs not-Arc (red) cores
 * Overlay: account count annotation per quarter
 */
function buildRenewalPressure(renewals) {
  const allQuarters = ['FY26-Q3', 'FY26-Q4', 'FY27-Q1', 'FY27-Q2'];
  const byQAll = allQuarters.map(q => {
    const rows = renewals.filter(r => r.RenewalQuarter === q);
    const arcCores = rows.filter(r => r.ArcEnabled === 'Yes').reduce((s, r) => s + (r.SQLCores || 0), 0);
    const noArcCores = rows.filter(r => r.ArcEnabled !== 'Yes').reduce((s, r) => s + (r.SQLCores || 0), 0);
    const noCommitAccts = rows.filter(r => !r.PipeCommitted || r.PipeCommitted === 0).length;
    return { q, arcCores, noArcCores, total: arcCores + noArcCores, accts: rows.length, noCommitAccts };
  });
  // Drop trailing empty quarters so the chart doesn't allocate space for buckets with no renewals
  const byQ = byQAll.filter(d => d.total > 0 || d.accts > 0);
  const quarters = byQ.map(d => d.q);
  if (byQ.length === 0) return '';

  const W = 680, H = 280, M = { top: 30, right: 28, bottom: 50, left: 60 };
  const iw = W - M.left - M.right, ih = H - M.top - M.bottom;
  const barW = iw / quarters.length * 0.55;
  const gap = iw / quarters.length;
  const maxCores = Math.max(...byQ.map(d => d.total), 1) * 1.15;
  const y = v => M.top + ih - (v / maxCores) * ih;

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(r => r * maxCores);

  return `<svg viewBox="0 0 ${W} ${H}" class="chart-svg" preserveAspectRatio="xMidYMid meet">
  <defs>
    <pattern id="noArcHatch" patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(-45)">
      <rect width="5" height="5" fill="#ff6b6b" opacity="0.25"/>
      <line x1="0" y1="0" x2="0" y2="5" stroke="#ff6b6b" stroke-width="1.2" opacity="0.85"/>
    </pattern>
  </defs>

  ${yTicks.map(v => `<line x1="${M.left}" x2="${W - M.right}" y1="${y(v)}" y2="${y(v)}" stroke="#2d3148" stroke-dasharray="2,3" opacity="0.6" class="chart-grid"/>
<text x="${M.left - 8}" y="${y(v) + 4}" fill="#8b8fa3" font-size="10" text-anchor="end" class="chart-axis">${v >= 1000 ? (v / 1000).toFixed(0) + 'K' : Math.round(v)}</text>`).join('\n  ')}
  <text x="${M.left - 44}" y="${M.top + ih / 2}" fill="#8b8fa3" font-size="10" transform="rotate(-90 ${M.left - 44} ${M.top + ih / 2})" text-anchor="middle" class="chart-axis">SQL CORES AT RENEWAL</text>

  ${byQ.map((d, i) => {
    const cx = M.left + gap * i + gap / 2;
    const bx = cx - barW / 2;
    const arcH = (d.arcCores / maxCores) * ih;
    const noArcH = (d.noArcCores / maxCores) * ih;
    const isHot = d.q === 'FY26-Q3' || d.q === 'FY26-Q4';
    return `<g>
  <!-- No-Arc cores (bottom, red) -->
  <rect x="${bx}" y="${y(d.noArcCores)}" width="${barW}" height="${noArcH}" fill="url(#noArcHatch)" class="bar-rect"/>
  <rect x="${bx}" y="${y(d.noArcCores)}" width="${barW}" height="${noArcH}" fill="none" stroke="#ff6b6b" stroke-width="1" opacity="0.6"/>
  <!-- Arc cores (top, green) -->
  <rect x="${bx}" y="${y(d.total)}" width="${barW}" height="${arcH}" fill="#00b894" opacity="0.85" class="bar-rect"/>

  ${d.arcCores > 0 ? `<text x="${cx}" y="${y(d.total) - 4}" fill="#00b894" font-size="10" font-weight="700" text-anchor="middle" class="chart-text">${fmtNum(d.arcCores)} arc</text>` : ''}
  ${d.noArcCores > 0 ? `<text x="${cx}" y="${y(d.noArcCores / 2)}" fill="#fff" font-size="11" font-weight="700" text-anchor="middle" class="chart-text">${fmtNum(d.noArcCores)}</text>` : ''}

  <!-- Quarter label -->
  <text x="${cx}" y="${H - 28}" fill="${isHot ? '#ff6b6b' : '#e4e5eb'}" font-size="12" font-weight="700" text-anchor="middle" class="chart-text">${d.q}</text>
  <text x="${cx}" y="${H - 14}" fill="#8b8fa3" font-size="10" text-anchor="middle" class="chart-axis">${d.accts} accts · ${d.noCommitAccts} no commit</text>
  ${isHot && d.noCommitAccts > 0 ? `<text x="${cx}" y="${M.top + 6}" fill="#ff6b6b" font-size="14" font-weight="700" text-anchor="middle" class="chart-text">⚠</text>` : ''}
</g>`;
  }).join('\n  ')}

  <!-- Legend -->
  <g transform="translate(${M.left}, ${M.top - 18})">
    <rect x="0" y="0" width="10" height="10" rx="2" fill="#00b894" opacity="0.85"/>
    <text x="14" y="9" fill="#e4e5eb" font-size="10" class="chart-text">Arc-enabled</text>
    <rect x="100" y="0" width="10" height="10" rx="2" fill="url(#noArcHatch)"/>
    <rect x="100" y="0" width="10" height="10" rx="2" fill="none" stroke="#ff6b6b" stroke-width="1" opacity="0.6"/>
    <text x="114" y="9" fill="#e4e5eb" font-size="10" class="chart-text">Not Arc-enabled (GCP risk)</text>
  </g>
</svg>`;
}

const trendChartSvg = buildTrendChart(trend, parseDollar(snapshot.PipeCommitted), parseDollar(snapshot.PipeUncommitted));
const verticalMixSvg = buildVerticalMix(verticals, parseDollar(snapshot.ACR_LCM), snapshot.AccountCount);
const renewalPressureSvg = buildRenewalPressure(renewals);

// Renewal pressure summary
const totalRenewalCores = renewals.filter(r => r.RenewalQuarter === 'FY26-Q3' || r.RenewalQuarter === 'FY26-Q4').reduce((s, r) => s + (r.SQLCores || 0), 0);
const renewalArcCores = renewals.filter(r => (r.RenewalQuarter === 'FY26-Q3' || r.RenewalQuarter === 'FY26-Q4') && r.ArcEnabled === 'Yes').reduce((s, r) => s + (r.SQLCores || 0), 0);
const payorAcrPct = (() => {
  const total = verticals.reduce((s, v) => s + parseDollar(v.ACR_LCM), 0);
  const payor = verticals.find(v => v.Vertical === 'Health Payor');
  return total > 0 && payor ? (parseDollar(payor.ACR_LCM) / total * 100).toFixed(0) : '0';
})();

// ── AIO Deep Dive Builders ──────────────────────────────────────────────────

function buildAioHeatmapData(aioMoM) {
  if (!aioMoM.length) return null;
  const monthSet = new Set();
  const byAcct = new Map();
  for (const row of aioMoM) {
    const key = row.TPID || row.Account;
    if (!byAcct.has(key)) byAcct.set(key, { name: row.Account, tpid: row.TPID, months: new Map() });
    const monthLabel = formatAioMonth(row.FiscalMonth);
    monthSet.add(monthLabel);
    byAcct.get(key).months.set(monthLabel, parseDollar(row.ACR));
  }
  const months = [...monthSet].sort();
  const accounts = [...byAcct.values()].map(a => {
    const vals = months.map(m => a.months.get(m) || 0);
    const last2 = vals.filter(v => v > 0).slice(-2);
    const delta = last2.length === 2 ? last2[1] - last2[0] : 0;
    const dir = last2.length < 2 ? '→' : (Math.abs(delta / (last2[0] || 1)) < 0.01 ? '→' : delta > 0 ? '↑' : '↓');
    return { ...a, monthValues: vals, delta, dir };
  }).sort((a, b) => {
    const aLast = a.monthValues[a.monthValues.length - 1] || 0;
    const bLast = b.monthValues[b.monthValues.length - 1] || 0;
    return bLast - aLast;
  });
  return { accounts, months };
}

function formatAioMonth(raw) {
  if (!raw) return '—';
  const s = String(raw);
  if (s.match(/^\d{4}-\d{2}/)) {
    const d = new Date(s.slice(0, 10) + 'T12:00:00Z');
    return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
  }
  return s.length > 8 ? s.slice(0, 8) : s;
}

function heatmapCellClass(v, max) {
  if (!v || v === 0) return 'hm-zero';
  const ratio = v / (max || 1);
  if (ratio >= 0.6) return 'hm-high';
  if (ratio >= 0.25) return 'hm-mid';
  return 'hm-low';
}

function buildAioPillarData(aioBreakdown) {
  if (!aioBreakdown.length) return null;
  const SQL_RELEVANT_PILLARS = new Set(['data & ai', 'infra']);
  const byAcct = new Map();
  for (const row of aioBreakdown) {
    const key = row.TPID || row.Account;
    if (!byAcct.has(key)) byAcct.set(key, { name: row.Account, tpid: row.TPID, pillars: {} });
    const pillar = row.StrategicPillar || 'Other';
    const val = parseDollar(row.ACR) || parseDollar(row.PipelineACR) || 0;
    byAcct.get(key).pillars[pillar] = (byAcct.get(key).pillars[pillar] || 0) + val;
  }
  const PILLAR_COLORS = {
    'Data & AI': '#6c5ce7', 'Infra': '#00b894',
    'Digital & App Innovation': '#74b9ff', 'Security': '#ffc048',
    'Modern Work': '#fd79a8', 'Business Applications': '#a29bfe'
  };
  return [...byAcct.values()].map(a => {
    const total = Object.values(a.pillars).reduce((s, v) => s + v, 0);
    const sqlAdj = Object.entries(a.pillars)
      .filter(([p]) => SQL_RELEVANT_PILLARS.has(p.toLowerCase()))
      .reduce((s, [, v]) => s + v, 0);
    const sqlPct = total > 0 ? ((sqlAdj / total) * 100).toFixed(0) : '0';
    const segments = Object.entries(a.pillars).sort(([, a], [, b]) => b - a)
      .map(([p, v]) => ({
        pillar: p, value: v,
        pct: total > 0 ? ((v / total) * 100).toFixed(0) : '0',
        color: PILLAR_COLORS[p] || '#8b8fa3',
        sqlRelevant: SQL_RELEVANT_PILLARS.has(p.toLowerCase())
      }));
    return { ...a, total, sqlPct, segments };
  }).sort((a, b) => b.total - a.total);
}

function budgetSignal(pct) {
  if (pct == null || isNaN(pct)) return { cls: 'budget-nodata', label: '⚫ No data' };
  const v = typeof pct === 'string' ? parseFloat(pct) : pct;
  const p = v > 2 ? v : v * 100;
  if (p >= 100) return { cls: 'budget-ahead', label: '🟢 Ahead' };
  if (p >= 80) return { cls: 'budget-ontrack', label: '🟡 On track' };
  return { cls: 'budget-below', label: '🔴 Below target' };
}

const heatmapData = buildAioHeatmapData(aioAccountMoM);
const pillarData = buildAioPillarData(aioServiceBreakdown);

// Compute SQL-adjacent ratio per account for the expandable chart overlay
const sqlAdjRatioByTpid = new Map();
if (pillarData) {
  for (const a of pillarData) {
    sqlAdjRatioByTpid.set(a.tpid, a.total > 0 ? parseFloat(a.sqlPct) / 100 : 0);
  }
}

// Build per-account chart data: months[], totalACR[], sqlAdjACR[]
const acctChartData = {};
if (heatmapData) {
  for (const a of heatmapData.accounts) {
    const ratio = sqlAdjRatioByTpid.get(a.tpid) || 0;
    acctChartData[a.tpid] = {
      name: a.name,
      months: heatmapData.months,
      total: a.monthValues,
      sqlAdj: a.monthValues.map(v => Math.round(v * ratio)),
    };
  }
}

// Collect all unique pillar names + colors for the shared legend
const PILLAR_COLORS_LEGEND = {
  'Data & AI': '#6c5ce7', 'Infra': '#00b894',
  'Digital & App Innovation': '#74b9ff', 'Security': '#ffc048',
  'Modern Work': '#fd79a8', 'Business Applications': '#a29bfe'
};
const SQL_REL_PILLARS_SET = new Set(['Data & AI', 'Infra']);
const allPillarsUsed = new Set();
if (pillarData) {
  for (const a of pillarData) {
    for (const s of a.segments) allPillarsUsed.add(s.pillar);
  }
}

// ── Build HTML ───────────────────────────────────────────────────────────────
const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SQL600 HLS Executive Readout — ${generated}</title>
<style>
  :root {
    --bg: #0f1117;
    --surface: #1a1d27;
    --surface-2: #242837;
    --border: #2d3148;
    --text: #e4e5eb;
    --text-muted: #8b8fa3;
    --accent: #6c5ce7;
    --accent-light: #a29bfe;
    --green: #00b894;
    --green-bg: rgba(0,184,148,0.12);
    --red: #ff6b6b;
    --red-bg: rgba(255,107,107,0.12);
    --yellow: #ffc048;
    --yellow-bg: rgba(255,192,72,0.12);
    --blue: #74b9ff;
    --blue-bg: rgba(116,185,255,0.12);
    --white: #ffffff;
    --card-shadow: 0 2px 8px rgba(0,0,0,0.3);
    --radius: 12px;
    --radius-sm: 8px;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.5;
    padding: 0;
  }
  .header {
    background: var(--header-gradient, linear-gradient(135deg, #1e1240 0%, #2d1f6b 40%, #6c5ce7 100%));
    padding: 40px 48px 32px;
    border-bottom: 1px solid var(--border);
    position: relative;
    overflow: hidden;
  }
  .header::after {
    content: '';
    position: absolute;
    top: -40%;
    right: -10%;
    width: 400px;
    height: 400px;
    background: var(--header-glow, radial-gradient(circle, rgba(108,92,231,0.3) 0%, transparent 70%));
    pointer-events: none;
  }
  .header-top { display: flex; justify-content: space-between; align-items: flex-start; position: relative; z-index: 1; }
  .header h1 { font-size: 28px; font-weight: 700; color: var(--white); letter-spacing: -0.5px; }
  .header .subtitle { font-size: 14px; color: rgba(255,255,255,0.6); margin-top: 4px; }
  .header .badge {
    display: inline-flex; align-items: center; gap: 6px;
    background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.2);
    border-radius: 20px; padding: 6px 14px; font-size: 13px; color: rgba(255,255,255,0.85);
    backdrop-filter: blur(8px);
  }
  .header .meta { display: flex; gap: 24px; margin-top: 20px; position: relative; z-index: 1; }
  .header .meta-item { font-size: 13px; color: rgba(255,255,255,0.5); }
  .header .meta-item strong { color: rgba(255,255,255,0.9); }

  .container { max-width: 1400px; margin: 0 auto; padding: 32px 48px; }

  /* KPI Cards */
  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 16px;
    margin-bottom: 36px;
  }
  .kpi-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 20px 24px;
    box-shadow: var(--card-shadow);
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }
  .kpi-card:hover { transform: translateY(-2px); box-shadow: 0 4px 16px rgba(0,0,0,0.4); }
  .kpi-label { font-size: 12px; text-transform: uppercase; letter-spacing: 0.8px; color: var(--text-muted); margin-bottom: 8px; }
  .kpi-value { font-size: 28px; font-weight: 700; color: var(--white); }
  .kpi-sub { font-size: 13px; color: var(--text-muted); margin-top: 4px; display: flex; align-items: center; gap: 6px; }
  .arrow-up { color: var(--green); }
  .arrow-down { color: var(--red); }
  .arrow-flat { color: var(--yellow); }
  .kpi-card.accent { border-left: 4px solid var(--accent); }
  .kpi-card.green { border-left: 4px solid var(--green); }
  .kpi-card.red { border-left: 4px solid var(--red); }
  .kpi-card.yellow { border-left: 4px solid var(--yellow); }
  .kpi-card.blue { border-left: 4px solid var(--blue); }

  /* Section */
  .section {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 28px 32px;
    margin-bottom: 24px;
    box-shadow: var(--card-shadow);
  }
  .section-header {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 20px; padding-bottom: 12px; border-bottom: 1px solid var(--border);
  }
  .section-title { font-size: 18px; font-weight: 600; color: var(--white); display: flex; align-items: center; gap: 10px; }
  .section-badge {
    font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;
    padding: 4px 10px; border-radius: 12px;
  }
  .badge-green { background: var(--green-bg); color: var(--green); }
  .badge-red { background: var(--red-bg); color: var(--red); }
  .badge-yellow { background: var(--yellow-bg); color: var(--yellow); }
  .badge-blue { background: var(--blue-bg); color: var(--blue); }

  /* Tables */
  table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    font-size: 13px;
  }
  thead th {
    text-align: left;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    color: var(--text-muted);
    padding: 10px 12px;
    border-bottom: 1px solid var(--border);
    position: sticky;
    top: 0;
    background: var(--surface);
  }
  thead th.right, td.right { text-align: right; }
  tbody td {
    padding: 10px 12px;
    border-bottom: 1px solid rgba(45,49,72,0.5);
    color: var(--text);
    white-space: nowrap;
  }
  tbody tr:hover { background: rgba(108,92,231,0.06); }
  tbody tr:last-child td { border-bottom: none; }
  .acct-name { font-weight: 600; color: var(--white); max-width: 240px; overflow: hidden; text-overflow: ellipsis; }
  .msx-link { color: var(--white); text-decoration: none; border-bottom: 1px dashed transparent; transition: all 0.15s; }
  .msx-link:hover { color: var(--accent-light); border-bottom-color: var(--accent-light); }
  .msx-link::after { content: " ↗"; font-size: 10px; color: var(--text-muted); opacity: 0.6; }
  .msx-link:hover::after { opacity: 1; color: var(--accent-light); }
  .acct-tpid { color: var(--text-muted); font-weight: 400; font-size: 11px; font-family: ui-monospace, Menlo, monospace; margin-left: 6px; }
  .takeaways { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; }
  .takeaway { display: flex; gap: 12px; padding: 12px 14px; border-radius: var(--radius); background: var(--surface-2); border-left: 3px solid var(--accent); }
  .takeaway-marker { font-size: 16px; flex-shrink: 0; }
  .takeaway-text { flex: 1; line-height: 1.55; font-size: 14px; color: var(--text); }
  .takeaway-important { border-left-color: #ff6b6b; background: rgba(255,107,107,0.08); }
  .takeaway-highlight { border-left-color: #00b894; background: rgba(0,184,148,0.08); }
  .takeaway-risk { border-left-color: #ffc048; background: rgba(255,192,72,0.08); }
  .takeaway-question { border-left-color: #74b9ff; background: rgba(116,185,255,0.08); }
  .takeaway-info { border-left-color: var(--accent); }
  .tag {
    display: inline-block; font-size: 11px; font-weight: 600; padding: 2px 8px;
    border-radius: 10px; letter-spacing: 0.3px;
  }
  .tag-payor { background: var(--blue-bg); color: var(--blue); }
  .tag-provider { background: var(--green-bg); color: var(--green); }
  .tag-medtech { background: rgba(162,155,254,0.15); color: var(--accent-light); }
  .tag-pharma { background: var(--yellow-bg); color: var(--yellow); }
  .tag-renewal { background: var(--red-bg); color: var(--red); }
  .tag-cores { background: rgba(162,155,254,0.15); color: var(--accent-light); }
  .tag-field { background: rgba(139,143,163,0.15); color: var(--text-muted); }
  .tag-risk { background: var(--red-bg); color: var(--red); font-weight: 700; }
  .tag-arc { background: var(--green-bg); color: var(--green); }
  .tag-no-arc { background: rgba(139,143,163,0.1); color: var(--text-muted); }

  /* Rationale chips ("Why flagged") */
  .why-cell {
    width: 240px; max-width: 240px;
    white-space: normal !important;
    line-height: 1.5;
  }
  .next-step-cell {
    width: 320px; max-width: 320px;
    white-space: normal !important;
    overflow-wrap: anywhere;
    word-break: break-word;
    line-height: 1.45;
  }
  .why-chip {
    display: inline-block; padding: 2px 7px; margin: 2px 3px 2px 0;
    border-radius: 4px; font-size: 10.5px; font-weight: 500;
    white-space: nowrap; vertical-align: middle;
  }
  .why-lead    { background: rgba(108,92,231,0.18); color: var(--accent-light); }
  .why-good    { background: var(--green-bg); color: var(--green); }
  .why-neutral { background: rgba(139,143,163,0.15); color: var(--text-muted); }
  .why-warn    { background: var(--yellow-bg); color: var(--yellow); }
  .why-bad     { background: var(--red-bg); color: var(--red); font-weight: 600; }

  /* Expandable detail rows for compact tables */
  .expand-toggle {
    cursor: pointer; user-select: none;
  }
  .expand-toggle:hover { background: rgba(162,155,254,0.08); }
  .expand-toggle td:first-child::before {
    content: '▸'; display: inline-block; margin-right: 6px;
    font-size: 11px; color: var(--text-muted);
    transition: transform 0.15s ease;
  }
  .expand-toggle.open td:first-child::before {
    transform: rotate(90deg);
  }
  .detail-row { display: none; }
  .detail-row.open { display: table-row; }
  .detail-row td {
    padding: 10px 14px 14px !important;
    background: rgba(108,92,231,0.04);
    border-top: none !important;
  }
  .detail-inner {
    display: flex; gap: 14px; flex-wrap: wrap; align-items: flex-start;
  }
  .detail-block {
    flex: 1; min-width: 100px;
  }
  .detail-block-full {
    flex-basis: 100%; margin-top: 6px;
    padding-top: 8px; border-top: 1px solid rgba(139,143,163,0.12);
  }
  .detail-label {
    font-size: 10px; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.5px; color: var(--text-muted); margin-bottom: 4px;
  }
  .detail-value {
    font-size: 12.5px; color: var(--text); line-height: 1.5;
  }
  .detail-value .why-chip { font-size: 10px; }
  .detail-next-step {
    font-size: 13px; color: var(--accent-light); font-weight: 500;
    line-height: 1.5;
  }
  .compact-table tr.expand-toggle + tr.detail-row > td {
    border-bottom: 1px solid var(--border);
  }

  /* Chart */
  .chart-area { padding: 16px 0; }
  .bar-row { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
  .bar-label { width: 90px; font-size: 12px; color: var(--text-muted); text-align: right; flex-shrink: 0; }
  .bar-track { flex: 1; height: 28px; background: var(--surface-2); border-radius: 6px; overflow: hidden; position: relative; }
  .bar-fill {
    height: 100%; border-radius: 6px;
    background: linear-gradient(90deg, var(--accent) 0%, var(--accent-light) 100%);
    display: flex; align-items: center; padding-left: 10px;
    font-size: 12px; font-weight: 600; color: var(--white);
    transition: width 0.6s ease;
  }
  .bar-fill.q1 { background: linear-gradient(90deg, #6c5ce7, #a29bfe); }
  .bar-fill.q2 { background: linear-gradient(90deg, #0984e3, #74b9ff); }
  .bar-fill.q3 { background: linear-gradient(90deg, #00b894, #55efc4); }

  /* Ranking bar */
  .rank-bar { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
  .rank-pos { width: 24px; font-size: 14px; font-weight: 700; color: var(--text-muted); text-align: right; }
  .rank-name { width: 200px; font-size: 13px; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rank-name.highlight { color: var(--accent-light); font-weight: 700; }
  .rank-track { flex: 1; height: 22px; background: var(--surface-2); border-radius: 4px; overflow: hidden; }
  .rank-fill { height: 100%; border-radius: 4px; display: flex; align-items: center; justify-content: flex-end; padding-right: 8px; font-size: 11px; font-weight: 600; color: var(--white); }
  .rank-fill.hls { background: linear-gradient(90deg, var(--accent), var(--accent-light)); }
  .rank-fill.other { background: linear-gradient(90deg, #2d3148, #3d4260); }
  .rank-count { width: 40px; font-size: 12px; color: var(--text-muted); text-align: right; }

  /* Grid layouts */
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
  .two-col > .section { min-width: 0; }
  .three-col { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 24px; }
  @media (max-width: 1024px) { .two-col, .three-col { grid-template-columns: 1fr; } }

  /* Callout */
  .callout {
    background: linear-gradient(135deg, rgba(108,92,231,0.1), rgba(162,155,254,0.05));
    border: 1px solid rgba(108,92,231,0.25);
    border-radius: var(--radius-sm);
    padding: 16px 20px;
    margin: 16px 0;
    font-size: 14px;
    line-height: 1.6;
  }
  .callout strong { color: var(--accent-light); }
  .callout.risk {
    background: linear-gradient(135deg, rgba(255,107,107,0.1), rgba(255,107,107,0.03));
    border-color: rgba(255,107,107,0.25);
  }
  .callout.risk strong { color: var(--red); }

  /* Footer */
  .footer {
    text-align: center; padding: 32px; color: var(--text-muted); font-size: 12px;
    border-top: 1px solid var(--border); margin-top: 20px;
  }
  .footer a { color: var(--accent-light); text-decoration: none; }

  /* Sparkline area */
  .spark-row { display: flex; align-items: flex-end; gap: 4px; height: 48px; margin-top: 8px; }
  .spark-bar {
    flex: 1; background: var(--accent); border-radius: 3px 3px 0 0;
    position: relative;
    transition: height 0.4s ease;
  }
  .spark-bar:hover { background: var(--accent-light); }
  .spark-labels { display: flex; gap: 4px; margin-top: 4px; }
  .spark-label { flex: 1; font-size: 9px; text-align: center; color: var(--text-muted); }

  /* SVG chart container */
  .chart-svg { width: 100%; height: auto; display: block; margin-top: 8px; }
  .chart-wrap { margin-top: 8px; }
  .chart-wrap-wide { max-height: 360px; }
  .chart-wrap-wide .chart-svg { max-height: 360px; }
  .chart-wrap-donut { max-width: 360px; margin: 8px auto 0; }
  .donut-svg { display: block; max-width: 260px; margin: 0 auto; }
  .donut-legend {
    display: grid; grid-template-columns: 1fr 1fr; gap: 10px 18px;
    margin: 16px auto 4px; padding: 0 6px; max-width: 320px;
  }
  .donut-legend-item { display: flex; align-items: flex-start; gap: 8px; min-width: 0; }
  .donut-legend-swatch {
    flex-shrink: 0; width: 10px; height: 10px; border-radius: 2px;
    margin-top: 4px; display: inline-block;
  }
  .donut-legend-name {
    font-size: 12px; font-weight: 600; color: var(--white);
    line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .donut-legend-meta { font-size: 10.5px; color: var(--text-muted); margin-top: 2px; }
  .chart-caption { font-size: 12px; color: var(--text-muted); margin-top: 10px; line-height: 1.5; }
  .chart-caption strong { color: var(--accent-light); }
  .donut-seg { transition: opacity 0.2s ease; cursor: default; }
  .donut-seg:hover { opacity: 1; }
  .bar-rect { transition: opacity 0.2s ease; }

  /* Export button */
  .export-btn {
    display: inline-flex; align-items: center; gap: 8px;
    background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.25);
    border-radius: 8px; padding: 8px 18px;
    font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.9);
    cursor: pointer; transition: all 0.2s ease;
    backdrop-filter: blur(8px); position: relative; z-index: 1;
  }
  .export-btn:hover { background: rgba(255,255,255,0.18); border-color: rgba(255,255,255,0.4); transform: translateY(-1px); }
  .export-btn:active { transform: translateY(0); }
  .export-btn svg { width: 16px; height: 16px; fill: currentColor; }

  /* Print — full light theme adaptation */
  @media print {
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    body { background: #fff !important; color: #1a1a2e !important; }

    /* Header keeps purple brand but tightens */
    .header { background: linear-gradient(135deg, #4a3aad 0%, #6c5ce7 100%) !important; padding: 24px 32px 20px; }
    .header::after { display: none; }
    .header h1 { font-size: 24px; }
    .header .subtitle { color: rgba(255,255,255,0.75); }
    .header .badge { background: rgba(255,255,255,0.2); border-color: rgba(255,255,255,0.3); }
    .header .meta-item { color: rgba(255,255,255,0.65); }
    .header .meta-item strong { color: #fff; }

    /* Layout */
    .container { padding: 16px 28px; }
    .kpi-grid { gap: 8px; margin-bottom: 12px; }
    .two-col { gap: 14px; }
    .export-btn, .easter-egg { display: none !important; }
    @page { margin: 0.35in 0.4in; size: letter landscape; }

    /* Page break controls — clean section boundaries without forced empty pages */
    .section, .callout { break-inside: avoid; page-break-inside: avoid; margin-bottom: 10px !important; }
    .header { break-after: avoid; page-break-after: avoid; }
    .section-header { break-after: avoid; page-break-after: avoid; margin-bottom: 6px !important; padding-bottom: 6px !important; }
    .chart-wrap { break-inside: avoid; page-break-inside: avoid; }
    /* Tables can split, but rows stay whole and headers repeat */
    table { break-inside: auto; font-size: 10px !important; }
    thead { display: table-header-group; }
    tr { break-inside: avoid; page-break-inside: avoid; }
    tbody td, thead th { padding: 4px 6px !important; }
    /* Tighten chart heights for print so hero + callout fit page 1 together */
    .chart-wrap-wide { max-height: 260px !important; }
    .chart-wrap-wide .chart-svg { max-height: 260px !important; }
    .chart-wrap-donut { max-width: 280px !important; }
    .chart-caption { font-size: 11px !important; margin-top: 6px !important; }
    /* Kill the renewal "max-height+scroll" wrapper for print */
    .section > div[style*="max-height"] { max-height: none !important; overflow: visible !important; }

    /* KPI cards */
    .kpi-card { background: #fff !important; border: 1px solid #ddd !important; box-shadow: none !important; break-inside: avoid; }
    .kpi-card:hover { transform: none !important; }
    .kpi-card.accent { border-left: 4px solid #6c5ce7 !important; }
    .kpi-card.green { border-left: 4px solid #00a884 !important; }
    .kpi-card.red { border-left: 4px solid #e05555 !important; }
    .kpi-card.yellow { border-left: 4px solid #d4940a !important; }
    .kpi-card.blue { border-left: 4px solid #3b8ad9 !important; }
    .kpi-label { color: #666 !important; }
    .kpi-value { color: #111 !important; }
    .kpi-sub { color: #666 !important; }
    .arrow-up { color: #00875a !important; }
    .arrow-down { color: #de350b !important; }
    .arrow-flat { color: #b8860b !important; }

    /* Sections */
    .section { background: #fff !important; border: 1px solid #ddd !important; box-shadow: none !important; break-inside: avoid; margin-bottom: 16px; }
    .section-header { border-bottom-color: #e0e0e0 !important; }
    .section-title { color: #111 !important; }

    /* Section badges — opaque for print */
    .badge-green { background: #e6f9f0 !important; color: #00875a !important; }
    .badge-red { background: #ffeaea !important; color: #de350b !important; }
    .badge-yellow { background: #fff8e6 !important; color: #b8860b !important; }
    .badge-blue { background: #e8f4fd !important; color: #1a6fb5 !important; }

    /* Tables */
    table { font-size: 11px; }
    thead th { color: #555 !important; border-bottom-color: #ccc !important; background: #fafafa !important; }
    tbody td { color: #222 !important; padding: 6px 8px; border-bottom-color: #eee !important; }
    tbody tr:hover { background: transparent !important; }
    .acct-name { color: #111 !important; }
    .msx-link { color: #111 !important; }
    .msx-link::after { display: none; }
    .acct-tpid { color: #666 !important; }
    .takeaway { background: #f7f7f7 !important; color: #111 !important; }
    .takeaway-text { color: #111 !important; }

    /* Tags — opaque backgrounds for print */
    .tag-payor { background: #e8f4fd !important; color: #1a6fb5 !important; }
    .tag-provider { background: #e6f9f0 !important; color: #00875a !important; }
    .tag-medtech { background: #f0edff !important; color: #5b4cbb !important; }
    .tag-pharma { background: #fff8e6 !important; color: #b8860b !important; }
    .tag-renewal { background: #ffeaea !important; color: #de350b !important; }
    .tag-cores { background: #f0edff !important; color: #5b4cbb !important; }
    .tag-field { background: #f0f0f0 !important; color: #555 !important; }
    .tag-risk { background: #ffeaea !important; color: #de350b !important; }
    .tag-arc { background: #e6f9f0 !important; color: #00875a !important; }
    .tag-no-arc { background: #f0f0f0 !important; color: #888 !important; }

    /* Rationale chips — print */
    .why-chip { font-size: 9.5px !important; padding: 1px 5px !important; }
    .why-lead    { background: #f0edff !important; color: #5b4cbb !important; }
    .why-good    { background: #e6f9f0 !important; color: #00875a !important; }
    .why-neutral { background: #f0f0f0 !important; color: #555 !important; }
    .why-warn    { background: #fff8e6 !important; color: #b8860b !important; }
    .why-bad     { background: #ffeaea !important; color: #de350b !important; }

    /* Chart bars */
    .bar-label { color: #555 !important; }
    .bar-track { background: #f0f0f3 !important; }
    .bar-fill { color: #fff !important; }
    .bar-fill.q1 { background: linear-gradient(90deg, #6c5ce7, #8b7cf0) !important; }
    .bar-fill.q2 { background: linear-gradient(90deg, #0984e3, #4da3ef) !important; }
    .bar-fill.q3 { background: linear-gradient(90deg, #00a884, #33c4a0) !important; }

    /* Ranking bars */
    .rank-pos { color: #555 !important; }
    .rank-name { color: #222 !important; }
    .rank-name.highlight { color: #5b4cbb !important; }
    .rank-track { background: #f0f0f3 !important; }
    .rank-fill.hls { background: linear-gradient(90deg, #6c5ce7, #8b7cf0) !important; }
    .rank-fill.other { background: linear-gradient(90deg, #c8cad0, #dcdee3) !important; color: #555 !important; }
    .rank-count { color: #666 !important; }

    /* Callouts */
    .callout { background: #f5f3ff !important; border-color: #c4b5fd !important; color: #1a1a2e !important; break-inside: avoid; }
    .callout strong { color: #5b4cbb !important; }
    .callout.risk { background: #fef2f2 !important; border-color: #fca5a5 !important; }
    .callout.risk strong { color: #de350b !important; }

    /* Footer */
    .footer { color: #888 !important; border-top-color: #ddd !important; }
    .footer a { color: #5b4cbb !important; }

    /* SVG charts — recolor text/grid/axis for light theme */
    .chart-svg .chart-grid { stroke: #e0e0e0 !important; opacity: 0.9 !important; }
    .chart-svg .chart-axis { fill: #666 !important; }
    .chart-svg .chart-text { fill: #222 !important; }
    .chart-svg .chart-line { stroke: #5b4cbb !important; }
    .chart-svg .chart-dot { fill: #8b7cf0 !important; stroke: #fff !important; }
    .chart-svg .chart-dot.last { fill: #5b4cbb !important; }
    .chart-svg .chart-marker { fill: #5b4cbb !important; }
    .chart-svg .donut-center { fill: #111 !important; }
    .chart-svg .donut-center-label { fill: #666 !important; }
    .chart-svg .donut-center-total { fill: #5b4cbb !important; }
    .donut-legend-name { color: #222 !important; }
    .donut-legend-meta { color: #666 !important; }
    .chart-caption { color: #555 !important; }
    .chart-caption strong { color: #5b4cbb !important; }
  }

  /* AIO Deep Dive */
  .heatmap-table td.hm-cell { text-align: center; font-size: 11px; font-weight: 600; padding: 6px 8px; min-width: 72px; }
  .hm-high { background: rgba(0,184,148,0.25); color: var(--green); }
  .hm-mid  { background: rgba(116,185,255,0.15); color: var(--blue); }
  .hm-low  { background: rgba(139,143,163,0.10); color: var(--text-muted); }
  .hm-zero { background: transparent; color: var(--text-muted); }
  .hm-dir  { font-size: 13px; font-weight: 700; }
  .pillar-bar-wrap { display: flex; height: 22px; border-radius: 4px; overflow: hidden; position: relative; }
  .pillar-seg { display: flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 600; color: #fff; min-width: 1px; cursor: default; transition: opacity 0.15s; }
  .pillar-seg.sql-relevant { outline: 2px solid var(--accent-light); outline-offset: -2px; }
  .pillar-bar-wrap:hover .pillar-seg { opacity: 0.6; }
  .pillar-bar-wrap:hover .pillar-seg:hover { opacity: 1; transform: scaleY(1.15); }
  .budget-ahead { color: var(--green); font-weight: 700; }
  .budget-ontrack { color: var(--yellow); font-weight: 600; }
  .budget-below { color: var(--red); font-weight: 700; }
  .budget-nodata { color: var(--text-muted); }
  .aio-source-badge { font-size: 10px; color: var(--text-muted); background: rgba(139,143,163,0.12); padding: 2px 8px; border-radius: 8px; }

  /* Shared pillar legend */
  .pillar-legend { display: flex; flex-wrap: wrap; gap: 14px; margin-bottom: 16px; padding: 10px 14px; background: var(--surface-2); border-radius: var(--radius-sm); }
  .pillar-legend-item { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text); cursor: default; }
  .pillar-legend-swatch { width: 14px; height: 14px; border-radius: 3px; flex-shrink: 0; }
  .pillar-legend-item.sql-rel .pillar-legend-swatch { outline: 2px solid var(--accent-light); outline-offset: -1px; }
  .pillar-legend-item .pillar-legend-label { font-weight: 500; }
  .pillar-legend-item .pillar-legend-tag { font-size: 9px; font-weight: 700; color: var(--accent-light); background: rgba(108,92,231,0.15); padding: 1px 5px; border-radius: 4px; margin-left: 2px; }

  /* Pillar tooltip */
  .pillar-tooltip {
    position: fixed; z-index: 1000; pointer-events: none;
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius-sm); padding: 10px 14px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    font-size: 12px; color: var(--text);
    max-width: 260px; opacity: 0; transition: opacity 0.12s;
  }
  .pillar-tooltip.show { opacity: 1; }
  .pillar-tooltip .tt-name { font-weight: 700; color: var(--white); margin-bottom: 4px; }
  .pillar-tooltip .tt-row { display: flex; justify-content: space-between; gap: 16px; margin-top: 2px; }
  .pillar-tooltip .tt-val { font-weight: 600; }
  .pillar-tooltip .tt-sql { color: var(--accent-light); font-size: 10px; font-weight: 700; margin-top: 4px; }

  /* Expandable heatmap rows */
  .hm-expand-row { cursor: pointer; }
  .hm-expand-row:hover { background: rgba(108,92,231,0.10) !important; }
  .hm-expand-row td:first-child::before { content: '▶ '; font-size: 9px; color: var(--text-muted); transition: transform 0.2s; display: inline-block; margin-right: 4px; }
  .hm-expand-row.expanded td:first-child::before { content: '▼ '; color: var(--accent-light); }
  .hm-chart-row { display: none; }
  .hm-chart-row.show { display: table-row; }
  .hm-chart-row td { padding: 0 !important; border-bottom: 2px solid var(--accent) !important; }
  .hm-chart-container {
    padding: 16px 20px; background: var(--surface-2); border-radius: 0 0 var(--radius-sm) var(--radius-sm);
  }
  .hm-chart-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
  .hm-chart-title { font-size: 13px; font-weight: 600; color: var(--white); }
  .hm-chart-legend { display: flex; gap: 16px; font-size: 11px; }
  .hm-chart-legend-item { display: flex; align-items: center; gap: 5px; color: var(--text-muted); }
  .hm-chart-legend-dot { width: 10px; height: 10px; border-radius: 2px; }
  .hm-chart-svg { width: 100%; height: 220px; display: block; }
  .chart-hover-line { stroke: rgba(255,255,255,0.15); stroke-width: 1; pointer-events: none; }
  .chart-dot-hover { transition: r 0.1s; }
  .chart-val-label { font-size: 9px; font-weight: 600; pointer-events: none; }
  .chart-point-tip {
    position: absolute; z-index: 10; pointer-events: none;
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius-sm); padding: 10px 14px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    font-size: 12px; color: var(--text); min-width: 180px;
    opacity: 0; transition: opacity 0.12s;
  }
  .chart-point-tip.visible { opacity: 1; }
  .chart-point-tip .cpt-month { font-weight: 700; color: var(--white); margin-bottom: 6px; font-size: 13px; }
  .chart-point-tip .cpt-row { display: flex; justify-content: space-between; gap: 12px; padding: 2px 0; }
  .chart-point-tip .cpt-label { color: var(--text-muted); }
  .chart-point-tip .cpt-val { font-weight: 600; }
  .chart-point-tip .cpt-total { color: var(--accent-light); }
  .chart-point-tip .cpt-sql { color: var(--green); }
  .chart-point-tip .cpt-delta { margin-top: 4px; padding-top: 4px; border-top: 1px solid var(--border); font-size: 11px; }
  .chart-point-tip .cpt-up { color: var(--green); }
  .chart-point-tip .cpt-down { color: var(--red); }

  @media print {
    .hm-high { background: #e6f9f0 !important; color: #00875a !important; }
    .hm-mid  { background: #e8f4fd !important; color: #1a6fb5 !important; }
    .hm-low  { background: #f0f0f0 !important; color: #555 !important; }
    .budget-ahead { color: #00875a !important; }
    .budget-ontrack { color: #b8860b !important; }
    .budget-below { color: #de350b !important; }
    .pillar-seg.sql-relevant { outline-color: #5b4cbb !important; }
    .pillar-legend { background: #f5f5f5 !important; }
    .pillar-legend-item { color: #222 !important; }
    .pillar-tooltip { display: none !important; }
    .chart-point-tip { display: none !important; }
    .hm-expand-row td:first-child::before { display: none !important; }
    .hm-chart-row { display: table-row !important; }
    .hm-chart-row.show { display: table-row !important; }
    .hm-chart-container { background: #f7f7f7 !important; }
    .hm-chart-title { color: #111 !important; }
  }

  /* Easter egg */
  .easter-egg {
    display: none;
    position: fixed; bottom: 20px; right: 20px;
    background: var(--surface-2); border: 1px solid var(--accent);
    border-radius: var(--radius); padding: 12px 16px;
    font-size: 13px; color: var(--accent-light);
    box-shadow: 0 4px 24px rgba(108,92,231,0.3);
    z-index: 1000; cursor: pointer;
    animation: slideIn 0.3s ease;
  }
  @keyframes slideIn { from { transform: translateY(20px); opacity: 0; } }
  .easter-egg.show { display: block; }

  /* Palette switcher */
  .palette-switcher {
    display: inline-flex; align-items: center; gap: 8px;
    margin: 24px auto 32px; padding: 8px 14px;
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 999px; box-shadow: var(--card-shadow);
    font-size: 11px; color: var(--text-muted);
  }
  .palette-switcher-wrap { text-align: center; }
  .palette-switcher .ps-label { text-transform: uppercase; letter-spacing: 0.6px; font-weight: 600; }
  .palette-swatch {
    width: 20px; height: 20px; border-radius: 50%; cursor: pointer;
    border: 2px solid rgba(255,255,255,0.15); transition: transform 0.15s, border-color 0.15s;
    padding: 0; outline: none;
  }
  .palette-swatch:hover { transform: scale(1.15); }
  .palette-swatch.active { border-color: var(--white); transform: scale(1.15); }
  .palette-swatch.party-btn {
    background: conic-gradient(from 0deg, #ef4444, #f97316, #facc15, #22c55e, #3b82f6, #8b5cf6, #ec4899, #ef4444) !important;
    width: 24px; height: 24px;
    animation: party-spin 2s linear infinite;
  }
  .palette-swatch.party-btn.active { box-shadow: 0 0 12px 2px #fff, 0 0 24px 4px #ec4899; animation: party-spin 0.6s linear infinite, party-pulse 0.4s ease-in-out infinite alternate; }
  @keyframes party-spin { to { transform: rotate(360deg); } }
  @keyframes party-pulse { from { filter: brightness(1); } to { filter: brightness(1.6); } }
  @media print { .palette-switcher { display: none !important; } }

  /* PARTY MODE */
  @keyframes party-hue { from { filter: hue-rotate(0deg) saturate(1.4); } to { filter: hue-rotate(360deg) saturate(1.4); } }
  @keyframes party-shake {
    0%,100% { transform: translate(0,0) rotate(0deg); }
    20% { transform: translate(-4px,2px) rotate(-0.6deg); }
    40% { transform: translate(5px,-3px) rotate(0.8deg); }
    60% { transform: translate(-3px,4px) rotate(-0.4deg); }
    80% { transform: translate(4px,-2px) rotate(0.5deg); }
  }
  @keyframes party-wobble {
    0%,100% { transform: rotate(-1deg) scale(1); }
    50% { transform: rotate(1deg) scale(1.02); }
  }
  @keyframes party-strobe {
    0%,100% { opacity: 0; }
    45% { opacity: 0; }
    50% { opacity: 0.55; }
    55% { opacity: 0; }
  }
  @keyframes party-rainbow-text {
    0% { color: #ef4444; } 16% { color: #f97316; } 33% { color: #facc15; }
    50% { color: #22c55e; } 66% { color: #3b82f6; } 83% { color: #8b5cf6; } 100% { color: #ec4899; }
  }
  @keyframes party-confetti-fall {
    0% { transform: translateY(-10vh) rotate(0deg); opacity: 1; }
    100% { transform: translateY(110vh) rotate(720deg); opacity: 0.9; }
  }
  body.party-mode { animation: party-hue 4s linear infinite; }
  body.party-mode .header { animation: party-shake 0.4s ease-in-out infinite; }
  body.party-mode .header h1,
  body.party-mode .kpi-value,
  body.party-mode .section-title { animation: party-rainbow-text 1.6s linear infinite; }
  body.party-mode .kpi-card,
  body.party-mode .insight-card,
  body.party-mode .table-section { animation: party-wobble 0.6s ease-in-out infinite; }
  body.party-mode::before {
    content: ''; position: fixed; inset: 0; pointer-events: none; z-index: 9998;
    background: #ffffff; mix-blend-mode: difference;
    animation: party-strobe 0.45s steps(1) infinite;
  }
  .party-confetti {
    position: fixed; top: -10vh; width: 10px; height: 14px; z-index: 9999;
    pointer-events: none; will-change: transform;
    animation: party-confetti-fall linear infinite;
  }
  @media (prefers-reduced-motion: reduce) {
    body.party-mode, body.party-mode * { animation-duration: 6s !important; }
    body.party-mode::before { display: none; }
  }
  @media print { body.party-mode { animation: none !important; } body.party-mode::before, .party-confetti { display: none !important; } }
</style>
</head>
<body>

<!-- Header -->
<div class="header">
  <div class="header-top">
    <div>
      <h1>SQL600 HLS Executive Readout</h1>
      <div class="subtitle">Database Compete · Healthcare Industry · ${snapshot.AccountCount || 43} Accounts</div>
    </div>
    <div style="display:flex;align-items:center;gap:12px">
      <div class="badge">
        <span style="font-size:10px">🏆</span>
        <span>#${hlsRank} Industry by ACR (of ${ranking.filter(r => r.Industry).length})</span>
      </div>
      <button class="export-btn" id="exportBtn" title="Export to PDF">
        <svg viewBox="0 0 24 24"><path d="M19 8h-1V3H6v5H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zM8 5h8v3H8V5zm8 14H8v-4h8v4zm2-4v-2H6v2H4v-4c0-.55.45-1 1-1h14c.55 0 1 .45 1 1v4h-2z"/><circle cx="18" cy="11.5" r="1"/></svg>
        Export PDF
      </button>
    </div>
  </div>
  <div class="meta">
    <div class="meta-item">Generated <strong>${new Date(generated + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</strong></div>
    <div class="meta-item">Model <strong>SQL 600 Performance Tracking</strong>${hasAioData ? ' + <strong>Azure All-in-One</strong>' : ''}</div>
    <div class="meta-item">Scope <strong>FY26</strong></div>
  </div>
</div>

<div class="container">

<!-- KPI Cards -->
<div class="kpi-grid">
  <div class="kpi-card accent">
    <div class="kpi-label">ACR (Last Closed Month)</div>
    <div class="kpi-value">${fmtDollar(snapshot.ACR_LCM)}</div>
    <div class="kpi-sub">
      <span class="${arrowClass(momDir)}">${momDir}</span>
      <span>MoM · ${fmtPct(snapshot.ACR_YoY_Pct)} YoY</span>
    </div>
  </div>
  <div class="kpi-card green">
    <div class="kpi-label">Annualized Growth</div>
    <div class="kpi-value">${fmtDollar(snapshot.AnnualizedGrowth)}</div>
    <div class="kpi-sub">Since June 2025 baseline</div>
  </div>
  <div class="kpi-card blue">
    <div class="kpi-label">Committed Pipeline</div>
    <div class="kpi-value">${fmtDollar(snapshot.PipeCommitted)}</div>
    <div class="kpi-sub">${fmtDollar(snapshot.PipeQualified)} qualified total</div>
  </div>
  <div class="kpi-card yellow">
    <div class="kpi-label">Uncommitted Pipeline</div>
    <div class="kpi-value">${fmtDollar(snapshot.PipeUncommitted)}</div>
    <div class="kpi-sub">${fmtNum(snapshot.TotalOpps)} opps · ${fmtNum(snapshot.QualifiedOpps)} qualified</div>
  </div>
  <div class="kpi-card${parseDollar(snapshot.WoW_Change) >= 0 ? ' green' : ' red'}">
    <div class="kpi-label">WoW Movement</div>
    <div class="kpi-value"><span class="${arrowClass(wowDir)}">${wowDir}</span> ${fmtDollar(snapshot.WoW_Change)}</div>
    <div class="kpi-sub">Realized + Baseline + Pipe</div>
  </div>
  <div class="kpi-card accent">
    <div class="kpi-label">Pipeline Penetration</div>
    <div class="kpi-value">${fmtPct(snapshot.PipelinePenetration)}</div>
    <div class="kpi-sub">${fmtNum(snapshot.AcctsWithModPipe)} with mod pipeline</div>
  </div>
  <div class="kpi-card blue">
    <div class="kpi-label">SQL TAM</div>
    <div class="kpi-value">${fmtDollar(snapshot.SQLTotalTAM)}</div>
    <div class="kpi-sub">${fmtNum(snapshot.SQLCores)} cores on-prem</div>
  </div>
  <div class="kpi-card${parseDollar(snapshot.FactoryAttach) < 0.15 ? ' red' : ' green'}">
    <div class="kpi-label">Modernization</div>
    <div class="kpi-value">${fmtNum(snapshot.ModernizationOpps)} opps</div>
    <div class="kpi-sub">${fmtPct(snapshot.FactoryAttach)} factory attach · ${fmtNum(snapshot.AcctsWithoutModPipe)} accts without</div>
  </div>
</div>

<!-- Narrative Callout -->
<div class="callout">
  ${narrative.headline
    ? `<strong>Executive Read:</strong> ${mdInline(narrative.headline)}`
    : `<strong>DBC Narrative:</strong> Healthcare ranks <strong>#${hlsRank}</strong> among SQL600 industries with <strong>${fmtDollar(snapshot.ACR_LCM)}</strong> monthly ACR and <strong>${fmtPct(snapshot.PipelinePenetration)}</strong> pipeline penetration. With <strong>${fmtDollar(snapshot.AnnualizedGrowth)}</strong> in annualized growth and <strong>${fmtNum(snapshot.ModernizationOpps)}</strong> modernization opportunities, HLS carries <strong>${fmtNum(snapshot.AcctsWithoutModPipe)}</strong> accounts without modernization pipeline — direct <strong>GCP leakage risk</strong>.`}
</div>

<!-- Hero: ACR Trajectory (full-width) -->
<div class="section">
  <div class="section-header">
    <div class="section-title">📈 ACR Trajectory · Realized + Forward Pipe</div>
    <span class="section-badge ${momDir === '↑' ? 'badge-green' : momDir === '↓' ? 'badge-red' : 'badge-yellow'}">${momDir} ${trendValues.length >= 2 ? (((trendValues[trendValues.length - 1] - trendValues[trendValues.length - 2]) / trendValues[trendValues.length - 2]) * 100).toFixed(1) + '% MoM' : 'Flat'}</span>
  </div>
  <div class="chart-wrap chart-wrap-wide">${trendChartSvg}</div>
  <div class="chart-caption">
    ${narrative.trajectory
      ? mdInline(narrative.trajectory)
      : `FY26 realized ACR peaked at <strong>${fmtDollar(Math.max(...trendValues))}</strong> in ${new Date((trend[trendValues.indexOf(Math.max(...trendValues))]?.FiscalMonth || new Date().toISOString().slice(0,10)) + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' })}. <strong>${fmtDollar(parseDollar(snapshot.PipeCommitted) + parseDollar(snapshot.PipeUncommitted))}</strong> in forward pipeline is sitting behind this trajectory — of which only <strong>${fmtPct(parseDollar(snapshot.PipeCommitted) / (parseDollar(snapshot.PipeCommitted) + parseDollar(snapshot.PipeUncommitted)))}</strong> is committed.`}
  </div>
</div>

<!-- Two column: Ranking + Vertical Mix Donut -->
<div class="two-col">
  <!-- Industry Ranking -->
  <div class="section">
    <div class="section-header">
      <div class="section-title">🏆 Industry Ranking (SQL600)</div>
      <span class="section-badge badge-blue">${ranking.filter(r => r.Industry).length} Industries</span>
    </div>
    ${(() => {
      const sorted = [...ranking].filter(r => r.Industry).sort((a, b) => parseDollar(b.ACR_LCM) - parseDollar(a.ACR_LCM));
      const maxACR = parseDollar(sorted[0]?.ACR_LCM) || 1;
      return sorted.map((r, i) => {
        const isHLS = r.Industry === 'Healthcare';
        const pct = (parseDollar(r.ACR_LCM) / maxACR * 100).toFixed(1);
        return `<div class="rank-bar">
          <div class="rank-pos">${i + 1}</div>
          <div class="rank-name${isHLS ? ' highlight' : ''}">${r.Industry}</div>
          <div class="rank-track">
            <div class="rank-fill ${isHLS ? 'hls' : 'other'}" style="width:${pct}%">${fmtDollar(r.ACR_LCM)}</div>
          </div>
          <div class="rank-count">${r.AccountCount}</div>
        </div>`;
      }).join('\n      ');
    })()}
    ${narrative.ranking ? `<div class="chart-caption" style="margin-top:16px">${mdInline(narrative.ranking)}</div>` : ''}
  </div>

  <!-- Vertical Mix Donut -->
  <div class="section">
    <div class="section-header">
      <div class="section-title">🏥 Vertical Mix (ACR)</div>
      <span class="section-badge badge-blue">${verticals.length} Verticals</span>
    </div>
    <div class="chart-wrap chart-wrap-donut">${verticalMixSvg}</div>
    <div class="chart-caption">
      ${narrative.vertical
        ? mdInline(narrative.vertical)
        : `<strong>Health Payor</strong> carries <strong>${payorAcrPct}%</strong> of HLS ACR from <strong>${verticals.find(v => v.Vertical === 'Health Payor')?.AccountCount || 0} accounts</strong> — concentration risk. <strong>Health Provider</strong> is the inverse: <strong>${verticals.find(v => v.Vertical === 'Health Provider')?.AccountCount || 0} accounts</strong> with minimal ACR — largest modernization runway.`}
    </div>
  </div>
</div>

<!-- Renewal Pressure Timeline (full-width) -->
<div class="section">
  <div class="section-header">
    <div class="section-title">⏱️ Renewal Pressure Timeline</div>
    <span class="section-badge badge-red">${fmtNum(totalRenewalCores)} cores at risk</span>
  </div>
  <div class="chart-wrap chart-wrap-wide">${renewalPressureSvg}</div>
  <div class="chart-caption">
    ${narrative.renewal
      ? mdInline(narrative.renewal)
      : `<strong>FY26-Q4</strong> is the pressure point — only <strong>${fmtNum(renewalArcCores)} of ${fmtNum(totalRenewalCores)} cores</strong> (${((renewalArcCores / Math.max(totalRenewalCores, 1)) * 100).toFixed(0)}%) are Arc-enabled heading into Q3/Q4 renewals. Non-Arc cores are direct <strong>GCP migration targets</strong>.`}
  </div>
</div>

<!-- Vertical Breakdown -->
<div class="section">
  <div class="section-header">
    <div class="section-title">🏥 Vertical Breakdown</div>
    <span class="section-badge badge-blue">4 Verticals</span>
  </div>
  <table>
    <thead>
      <tr>
        <th>Vertical</th>
        <th class="right">Accounts</th>
        <th class="right">ACR (LCM)</th>
        <th class="right">Committed Pipe</th>
        <th class="right">Uncommitted Pipe</th>
        <th class="right">Ann. Growth</th>
        <th class="right">Mod Opps</th>
      </tr>
    </thead>
    <tbody>
      ${verticals.map(v => `<tr>
        <td><span class="tag tag-${v.Vertical?.toLowerCase().includes('payor') ? 'payor' : v.Vertical?.toLowerCase().includes('provider') ? 'provider' : v.Vertical?.toLowerCase().includes('pharma') ? 'pharma' : 'medtech'}">${v.Vertical}</span></td>
        <td class="right">${fmtNum(v.AccountCount)}</td>
        <td class="right">${fmtDollar(v.ACR_LCM, false)}</td>
        <td class="right">${fmtDollar(v.PipeCommitted, false)}</td>
        <td class="right">${fmtDollar(v.PipeUncommitted, false)}</td>
        <td class="right">${fmtDollar(v.AnnualizedGrowth)}</td>
        <td class="right">${fmtNum(v.ModOpps)}</td>
      </tr>`).join('\n      ')}
    </tbody>
  </table>
</div>

<!-- Top Accounts -->
<div class="section">
  <div class="section-header">
    <div class="section-title">🔝 Top Accounts by ACR</div>
    <span class="section-badge badge-green">${topAccounts.length} Accounts</span>
  </div>
  <table class="compact-table">
    <thead>
      <tr>
        <th>#</th>
        <th>Account</th>
        <th>Vertical</th>
        <th class="right">ACR (LCM)</th>
        <th class="right">Committed</th>
        <th class="right">Ann. Growth</th>
        <th class="right">SQL Cores</th>
      </tr>
    </thead>
    <tbody>
      ${topAccounts.map((a, i) => {
        const rationale = topAccountRationale(a, i);
        const nextStep = topAccountNextStep(a);
        return `<tr class="expand-toggle" data-detail="top-${i}">
        <td style="color:var(--text-muted)">${i + 1}</td>
        ${acctCell(a)}
        <td>
          <span class="tag tag-${a.Vertical?.toLowerCase().includes('payor') ? 'payor' : a.Vertical?.toLowerCase().includes('provider') ? 'provider' : a.Vertical?.toLowerCase().includes('pharma') ? 'pharma' : 'medtech'}">${a.Vertical || '—'}</span>
        </td>
        <td class="right" style="font-weight:600">${fmtDollar(a.ACR_LCM, false)}</td>
        <td class="right">${fmtDollar(a.PipeCommitted, false)}</td>
        <td class="right" style="color:var(--green)">${fmtDollar(a.AnnualizedGrowth)}</td>
        <td class="right">${fmtNum(a.SQLCores)}</td>
      </tr>
      <tr class="detail-row" id="top-${i}">
        <td colspan="7">
          <div class="detail-inner">
            <div class="detail-block"><div class="detail-label">Uncommitted</div><div class="detail-value">${fmtDollar(a.PipeUncommitted, false)}</div></div>
            <div class="detail-block"><div class="detail-label">Segment</div><div class="detail-value">${a.Segment || '—'}</div></div>
            <div class="detail-block"><div class="detail-label">Opps (Qual / Total)</div><div class="detail-value">${fmtNum(a.QualifiedOpps) || '—'} / ${fmtNum(a.TotalOpps) || '—'}</div></div>
            <div class="detail-block"><div class="detail-label">Signals</div><div class="detail-value">${rationale}</div></div>
            <div class="detail-block-full"><div class="detail-label">Recommended Next Step</div><div class="detail-next-step">${nextStep}</div></div>
          </div>
        </td>
      </tr>`;
      }).join('\n      ')}
    </tbody>
  </table>
  ${narrative.topAccounts ? `<div class="chart-caption" style="margin-top:12px">${mdInline(narrative.topAccounts)}</div>` : ''}
</div>

<!-- Modernization + AI Enablement -->
<div class="section">
  <div class="section-header">
    <div class="section-title">🧠 Modernization + AI Enablement Outlook</div>
    <span class="section-badge badge-blue">Future-ready platform signal</span>
  </div>
  <div class="callout">
    ${narrative.modernization
      ? mdInline(narrative.modernization)
      : (data._aiInsight?.modernizationOutlook
        ? mdInline(data._aiInsight.modernizationOutlook)
        : 'Run <code>generate-next-steps.js</code> to populate the AI-enablement outlook.')}
  </div>
</div>

<!-- Two column: Renewals + Gap -->
<div class="two-col">
  <!-- Renewal Watch -->
  <div class="section">
    <div class="section-header">
      <div class="section-title">⚠️ Renewal Watch</div>
      <span class="section-badge badge-red">${renewalQ3 + renewalQ4} Renewals</span>
    </div>
    <div class="callout risk">
      ${narrative.renewal
        ? mdInline(narrative.renewal)
        : `<strong>${renewalQ4} accounts</strong> renewing in <strong>FY26-Q4</strong> and <strong>${renewalQ3}</strong> in <strong>FY26-Q3</strong>. Only <strong>${arcEnabled}</strong> are Arc-enabled. DB modernization positioning is critical before renewal windows close.`}
    </div>
    <div style="max-height: 480px; overflow-y: auto;">
    <table class="compact-table">
      <thead>
        <tr>
          <th>Account</th>
          <th>Renewal</th>
          <th class="right">SQL Cores</th>
          <th>Arc?</th>
          <th class="right">Committed</th>
        </tr>
      </thead>
      <tbody>
        ${renewals.filter(r => r.RenewalQuarter).sort((a, b) => {
          const qa = a.RenewalQuarter || 'ZZ', qb = b.RenewalQuarter || 'ZZ';
          if (qa !== qb) return qa.localeCompare(qb);
          return (b.SQLCores || 0) - (a.SQLCores || 0);
        }).map((r, i) => {
          const rationale = renewalRationale(r);
          const nextStep = topAccountNextStep(r);
          return `<tr class="expand-toggle" data-detail="renewal-${i}">
          ${acctCell(r, { maxWidth: 180 })}
          <td><span class="tag tag-renewal">${r.RenewalQuarter || '—'}</span></td>
          <td class="right" style="font-weight:600">${fmtNum(r.SQLCores)}</td>
          <td><span class="tag ${r.ArcEnabled === 'Yes' ? 'tag-arc' : 'tag-no-arc'}">${r.ArcEnabled || 'No'}</span></td>
          <td class="right">${fmtDollar(r.PipeCommitted, false)}</td>
        </tr>
        <tr class="detail-row" id="renewal-${i}">
          <td colspan="5">
            <div class="detail-inner">
              <div class="detail-block"><div class="detail-label">Category</div><div class="detail-value"><span class="tag tag-${r.Category?.includes('Renewal') ? 'renewal' : r.Category?.includes('Cores') ? 'cores' : 'field'}">${r.Category?.replace('(Excl. renewals)', '').trim() || '—'}</span></div></div>
              <div class="detail-block"><div class="detail-label">ACR (LCM)</div><div class="detail-value">${fmtDollar(r.ACR_LCM, false)}</div></div>
              <div class="detail-block"><div class="detail-label">Signals</div><div class="detail-value">${rationale}</div></div>
              <div class="detail-block-full"><div class="detail-label">Recommended Next Step</div><div class="detail-next-step">${nextStep}</div></div>
            </div>
          </td>
        </tr>`;
        }).join('\n        ')}
      </tbody>
    </table>
    </div>
  </div>

  <!-- GCP Leakage Risk -->
  <div class="section">
    <div class="section-header">
      <div class="section-title">🔴 GCP Leakage Risk</div>
      <span class="section-badge badge-red">${gapAccounts.length} Accounts</span>
    </div>
    <div class="callout risk">
      ${narrative.gcp
        ? mdInline(narrative.gcp)
        : `<strong>${gapAccounts.length} HLS SQL600 accounts</strong> have <strong>zero committed pipeline</strong>. What they aren't spending with us, they're spending with <strong>GCP</strong>. These accounts represent DB modernization opportunities that directly compete with GCP capture.`}
    </div>
    <div style="max-height: 480px; overflow-y: auto;">
    <table class="compact-table">
      <thead>
        <tr>
          <th>Account</th>
          <th>Vertical</th>
          <th class="right">ACR</th>
          <th class="right">SQL Cores</th>
        </tr>
      </thead>
      <tbody>
        ${gapAccounts.sort((a, b) => parseDollar(b.ACR_LCM) - parseDollar(a.ACR_LCM)).map((g, i) => {
          const rationale = gapRationale(g);
          const nextStep = topAccountNextStep(g);
          return `<tr class="expand-toggle" data-detail="gap-${i}">
          ${acctCell(g, { maxWidth: 180 })}
          <td><span class="tag tag-${g.Vertical?.toLowerCase().includes('payor') ? 'payor' : g.Vertical?.toLowerCase().includes('provider') ? 'provider' : g.Vertical?.toLowerCase().includes('pharma') ? 'pharma' : 'medtech'}">${g.Vertical || '—'}</span></td>
          <td class="right">${fmtDollar(g.ACR_LCM, false)}</td>
          <td class="right">${fmtNum(g.SQLCores)}</td>
        </tr>
        <tr class="detail-row" id="gap-${i}">
          <td colspan="4">
            <div class="detail-inner">
              <div class="detail-block"><div class="detail-label">Uncommitted Pipe</div><div class="detail-value">${fmtDollar(g.PipeUncommitted, false)}</div></div>
              <div class="detail-block"><div class="detail-label">Signals</div><div class="detail-value">${rationale}</div></div>
              <div class="detail-block-full"><div class="detail-label">Recommended Next Step</div><div class="detail-next-step">${nextStep}</div></div>
            </div>
          </td>
        </tr>`;
        }).join('\n        ')}
      </tbody>
    </table>
    </div>
  </div>
</div>

${hasAioData ? `
<!-- AIO: Azure Consumption Deep Dive -->
<div class="section" id="aio-deep-dive">
  <div class="section-header">
    <div class="section-title">🔍 Azure Consumption Deep Dive</div>
    <span class="aio-source-badge">Source: Azure All-in-One (MSXI)</span>
  </div>

  ${heatmapData ? `
  <div style="margin-bottom: 28px;">
    <div style="font-size:14px;font-weight:600;color:var(--white);margin-bottom:4px">Account MoM ACR Trend</div>
    <div style="font-size:11px;color:var(--text-muted);margin-bottom:12px">Click any row to expand a Total vs SQL-Adjacent breakdown chart</div>
    <div style="overflow-x:auto">
    <table class="heatmap-table" id="hm-table">
      <thead>
        <tr>
          <th>Account</th>
          ${heatmapData.months.map(m => `<th class="right" style="min-width:72px">${m}</th>`).join('')}
          <th class="right">MoM Δ</th>
          <th>Dir</th>
        </tr>
      </thead>
      <tbody>
        ${heatmapData.accounts.slice(0, 20).map((a, idx) => {
          const maxVal = Math.max(...a.monthValues);
          const acctRow = topAccounts.find(t => t.TPID === a.tpid) || gapAccounts.find(g => g.TPID === a.tpid) || renewals.find(r => r.TPID === a.tpid) || { TopParent: a.name, TPID: a.tpid };
          const colSpan = heatmapData.months.length + 3;
          return `<tr class="hm-expand-row" data-tpid="${a.tpid}" data-idx="${idx}">
            ${acctCell(acctRow, { maxWidth: 200, showTpid: false })}
            ${a.monthValues.map(v => `<td class="hm-cell ${heatmapCellClass(v, maxVal)}">${v > 0 ? fmtDollar(v) : '—'}</td>`).join('')}
            <td class="right" style="font-weight:600;color:${a.delta >= 0 ? 'var(--green)' : 'var(--red)'}">${a.delta !== 0 ? (a.delta > 0 ? '+' : '') + fmtDollar(a.delta) : '—'}</td>
            <td class="hm-dir ${a.dir === '↑' ? 'arrow-up' : a.dir === '↓' ? 'arrow-down' : 'arrow-flat'}">${a.dir}</td>
          </tr>
          <tr class="hm-chart-row" id="chart-row-${a.tpid}">
            <td colspan="${colSpan}">
              <div class="hm-chart-container">
                <div class="hm-chart-header">
                  <div class="hm-chart-title">${a.name} — Total ACR vs SQL-Adjacent</div>
                  <div class="hm-chart-legend">
                    <div class="hm-chart-legend-item"><div class="hm-chart-legend-dot" style="background:var(--accent-light)"></div>Total ACR</div>
                    <div class="hm-chart-legend-item"><div class="hm-chart-legend-dot" style="background:var(--green)"></div>SQL-Adjacent (Data & AI + Infra)</div>
                  </div>
                </div>
                <div class="hm-chart-target" id="chart-target-${a.tpid}"></div>
              </div>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
    </div>
    <div class="chart-caption" style="margin-top:10px">
      Month-over-month ACR from full Azure consumption view. <strong>${heatmapData.accounts.filter(a => a.dir === '↑').length}</strong> accounts trending up, <strong>${heatmapData.accounts.filter(a => a.dir === '↓').length}</strong> declining.
      ${heatmapData.accounts.filter(a => a.dir === '↓').length > 0 ? ` Declining: <strong>${heatmapData.accounts.filter(a => a.dir === '↓').slice(0, 3).map(a => a.name).join(', ')}</strong>.` : ''}
    </div>
  </div>
  ` : ''}

  ${pillarData ? `
  <div style="margin-bottom: 28px;">
    <div style="font-size:14px;font-weight:600;color:var(--white);margin-bottom:12px">Service Pillar Mix (SQL600-Relevant Highlighted)</div>
    <div class="pillar-legend">
      ${[...allPillarsUsed].sort((a, b) => {
        const ai = SQL_REL_PILLARS_SET.has(a) ? 0 : 1;
        const bi = SQL_REL_PILLARS_SET.has(b) ? 0 : 1;
        return ai - bi || a.localeCompare(b);
      }).map(p => `<div class="pillar-legend-item${SQL_REL_PILLARS_SET.has(p) ? ' sql-rel' : ''}">
        <div class="pillar-legend-swatch" style="background:${PILLAR_COLORS_LEGEND[p] || '#8b8fa3'}"></div>
        <span class="pillar-legend-label">${p}</span>
        ${SQL_REL_PILLARS_SET.has(p) ? '<span class="pillar-legend-tag">SQL600</span>' : ''}
      </div>`).join('')}
    </div>
    <table id="pillar-table">
      <thead>
        <tr>
          <th>Account</th>
          <th style="min-width:280px">Service Mix</th>
          <th class="right">Total ACR</th>
          <th class="right">SQL-Adjacent %</th>
        </tr>
      </thead>
      <tbody>
        ${pillarData.slice(0, 20).map(a => {
          const acctRow = topAccounts.find(t => t.TPID === a.tpid) || gapAccounts.find(g => g.TPID === a.tpid) || renewals.find(r => r.TPID === a.tpid) || { TopParent: a.name, TPID: a.tpid };
          return `<tr>
            ${acctCell(acctRow, { maxWidth: 180, showTpid: false })}
            <td>
              <div class="pillar-bar-wrap" data-account="${(a.name || '').replace(/"/g, '&quot;')}">
                ${a.segments.map(s => `<div class="pillar-seg${s.sqlRelevant ? ' sql-relevant' : ''}" style="width:${Math.max(parseFloat(s.pct), 2)}%;background:${s.color}" data-pillar="${s.pillar}" data-value="${s.value}" data-pct="${s.pct}" data-sql="${s.sqlRelevant}">${parseFloat(s.pct) >= 15 ? s.pct + '%' : ''}</div>`).join('')}
              </div>
            </td>
            <td class="right" style="font-weight:600">${fmtDollar(a.total)}</td>
            <td class="right" style="font-weight:600;color:${parseFloat(a.sqlPct) >= 40 ? 'var(--green)' : parseFloat(a.sqlPct) >= 20 ? 'var(--yellow)' : 'var(--red)'}">${a.sqlPct}%</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
    <div class="chart-caption" style="margin-top:10px">
      SQL-adjacent = <strong style="color:var(--accent-light)">Data & AI</strong> + <strong style="color:var(--green)">Infra</strong> as % of total Azure consumption. Outlined segments = SQL600-relevant pillars.
    </div>
  </div>
  ` : ''}

  ${aioBudgetAttainment.length ? `
  <div>
    <div style="font-size:14px;font-weight:600;color:var(--white);margin-bottom:12px">Budget Attainment (Azure All-Up)</div>
    <table>
      <thead>
        <tr>
          <th>Account</th>
          <th class="right">ACR YTD</th>
          <th class="right">ACR LCM</th>
          <th class="right">Budget Attain %</th>
          <th>Signal</th>
        </tr>
      </thead>
      <tbody>
        ${[...aioBudgetAttainment].sort((a, b) => {
          const pa = parseDollar(a.BudgetAttainPct), pb = parseDollar(b.BudgetAttainPct);
          return (isNaN(pa) ? 999 : pa) - (isNaN(pb) ? 999 : pb);
        }).slice(0, 20).map(a => {
          const sig = budgetSignal(a.BudgetAttainPct);
          const acctRow = topAccounts.find(t => t.TPID === a.TPID) || gapAccounts.find(g => g.TPID === a.TPID) || renewals.find(r => r.TPID === a.TPID) || { TopParent: a.Account, TPID: a.TPID };
          return `<tr>
            ${acctCell(acctRow, { maxWidth: 200, showTpid: false })}
            <td class="right">${fmtDollar(a.ACR_YTD, false)}</td>
            <td class="right">${fmtDollar(a.ACR_LCM, false)}</td>
            <td class="right" style="font-weight:600">${a.BudgetAttainPct != null ? fmtPct(a.BudgetAttainPct) : '—'}</td>
            <td><span class="${sig.cls}">${sig.label}</span></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
    <div class="chart-caption" style="margin-top:10px">
      Budget attainment from Azure All-in-One (org-level targets). <strong class="budget-below">${aioBudgetAttainment.filter(a => { const v = typeof a.BudgetAttainPct === 'number' ? a.BudgetAttainPct : parseFloat(a.BudgetAttainPct); const p = v > 2 ? v : v * 100; return !isNaN(p) && p < 80; }).length}</strong> accounts below 80% target.
    </div>
  </div>
  ` : ''}
</div>

<!-- Pillar tooltip (shared) -->
<div class="pillar-tooltip" id="pillar-tt"></div>

<!-- AIO chart data + interaction JS -->
<script>
(function() {
  const CHART_DATA = ${JSON.stringify(acctChartData)};

  // ── Pillar tooltip ─────────────────────────────────────────────
  const tt = document.getElementById('pillar-tt');
  if (tt) {
    document.querySelectorAll('.pillar-seg').forEach(seg => {
      seg.addEventListener('mouseenter', e => {
        const pillar = seg.dataset.pillar;
        const value = Number(seg.dataset.value);
        const pct = seg.dataset.pct;
        const isSql = seg.dataset.sql === 'true';
        const acctName = seg.closest('.pillar-bar-wrap')?.dataset.account || '';
        tt.innerHTML = '<div class="tt-name">' + pillar + '</div>'
          + '<div class="tt-row"><span>ACR</span><span class="tt-val">' + fmtD(value) + '</span></div>'
          + '<div class="tt-row"><span>Share</span><span class="tt-val">' + pct + '%</span></div>'
          + (isSql ? '<div class="tt-sql">✦ SQL600-relevant pillar</div>' : '');
        tt.classList.add('show');
      });
      seg.addEventListener('mousemove', e => {
        tt.style.left = (e.clientX + 14) + 'px';
        tt.style.top = (e.clientY - 10) + 'px';
      });
      seg.addEventListener('mouseleave', () => { tt.classList.remove('show'); });
    });
  }

  function fmtD(v) {
    if (v == null) return '—';
    const abs = Math.abs(v);
    if (abs >= 1e9) return '$' + (v / 1e9).toFixed(1) + 'B';
    if (abs >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
    if (abs >= 1e3) return '$' + (v / 1e3).toFixed(0) + 'K';
    return '$' + Math.round(v);
  }

  // ── Expandable heatmap charts ──────────────────────────────────
  document.querySelectorAll('.hm-expand-row').forEach(row => {
    row.addEventListener('click', () => {
      const tpid = row.dataset.tpid;
      const chartRow = document.getElementById('chart-row-' + tpid);
      const target = document.getElementById('chart-target-' + tpid);
      if (!chartRow || !target) return;

      const wasExpanded = row.classList.contains('expanded');
      // Collapse all first
      document.querySelectorAll('.hm-expand-row.expanded').forEach(r => {
        r.classList.remove('expanded');
        const cr = document.getElementById('chart-row-' + r.dataset.tpid);
        if (cr) cr.classList.remove('show');
      });

      if (!wasExpanded) {
        row.classList.add('expanded');
        chartRow.classList.add('show');
        // Render chart if not already rendered
        if (!target.querySelector('svg')) renderChart(target, tpid);
      }
    });
  });

  function renderChart(container, tpid) {
    const d = CHART_DATA[tpid];
    if (!d || !d.months.length) {
      container.innerHTML = '<div style="padding:20px;color:var(--text-muted);font-size:13px">No monthly data available for this account</div>';
      return;
    }

    const W = container.clientWidth || 700;
    const H = 220;
    const M = { top: 28, right: 24, bottom: 32, left: 60 };
    const iw = W - M.left - M.right;
    const ih = H - M.top - M.bottom;
    const n = d.months.length;
    const maxV = Math.max(...d.total, 1) * 1.22;
    const x = i => M.left + (i / Math.max(n - 1, 1)) * iw;
    const y = v => M.top + ih - (v / maxV) * ih;

    // Create wrapper with relative positioning for the tooltip
    const wrapper = document.createElement('div');
    wrapper.style.position = 'relative';

    // Create tooltip element
    const tip = document.createElement('div');
    tip.className = 'chart-point-tip';
    wrapper.appendChild(tip);

    const yTicks = [0, 0.25, 0.5, 0.75, 1].map(r => r * maxV);

    const sqlAreaPts = d.sqlAdj.map((v, i) => [x(i), y(v)]);
    const sqlArea = 'M' + sqlAreaPts.map(p => p.join(',')).join(' L')
      + ' L' + x(n - 1) + ',' + (M.top + ih) + ' L' + x(0) + ',' + (M.top + ih) + ' Z';
    const sqlLine = 'M' + sqlAreaPts.map(p => p.join(',')).join(' L');

    const totalPts = d.total.map((v, i) => [x(i), y(v)]);
    const totalLine = 'M' + totalPts.map(p => p.join(',')).join(' L');

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('class', 'hm-chart-svg');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    let svgHTML = '<defs>'
      + '<linearGradient id="sqlGrad' + tpid + '" x1="0" y1="0" x2="0" y2="1">'
      + '<stop offset="0%" stop-color="#00b894" stop-opacity="0.45"/>'
      + '<stop offset="100%" stop-color="#00b894" stop-opacity="0.05"/>'
      + '</linearGradient></defs>';

    // Grid
    yTicks.forEach(v => {
      svgHTML += '<line x1="' + M.left + '" x2="' + (W - M.right) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="#2d3148" stroke-dasharray="2,3" opacity="0.6"/>';
      svgHTML += '<text x="' + (M.left - 8) + '" y="' + (y(v) + 4) + '" fill="#8b8fa3" font-size="10" text-anchor="end">' + fmtD(v) + '</text>';
    });

    // SQL-adjacent area + line
    svgHTML += '<path d="' + sqlArea + '" fill="url(#sqlGrad' + tpid + ')"/>';
    svgHTML += '<path d="' + sqlLine + '" fill="none" stroke="#00b894" stroke-width="2" stroke-dasharray="4,3"/>';

    // Total line
    svgHTML += '<path d="' + totalLine + '" fill="none" stroke="#a29bfe" stroke-width="2.5"/>';

    // Vertical hover lines (hidden, shown on hover)
    d.total.forEach((v, i) => {
      svgHTML += '<line x1="' + x(i) + '" x2="' + x(i) + '" y1="' + M.top + '" y2="' + (M.top + ih) + '" class="chart-hover-line" id="hline-' + tpid + '-' + i + '" opacity="0"/>';
    });

    // Data points with dollar labels
    d.total.forEach((v, i) => {
      const sqlV = d.sqlAdj[i];
      const month = d.months[i];

      // Total dot
      svgHTML += '<circle cx="' + x(i) + '" cy="' + y(v) + '" r="4" fill="#a29bfe" stroke="#1a1d27" stroke-width="1.5" class="chart-dot-hover" id="tdot-' + tpid + '-' + i + '"/>';
      // Total value label (above dot)
      svgHTML += '<text x="' + x(i) + '" y="' + (y(v) - 10) + '" fill="#a29bfe" class="chart-val-label" text-anchor="middle">' + fmtD(v) + '</text>';

      // SQL dot + label
      if (sqlV > 0) {
        svgHTML += '<circle cx="' + x(i) + '" cy="' + y(sqlV) + '" r="3" fill="#00b894" stroke="#1a1d27" stroke-width="1" class="chart-dot-hover" id="sdot-' + tpid + '-' + i + '"/>';
        // SQL label — position below the dot, but only if enough gap from total label
        const labelY = y(sqlV) + 16;
        svgHTML += '<text x="' + x(i) + '" y="' + labelY + '" fill="#00b894" class="chart-val-label" text-anchor="middle">' + fmtD(sqlV) + '</text>';
      }

      // Month label
      svgHTML += '<text x="' + x(i) + '" y="' + (H - 8) + '" fill="#8b8fa3" font-size="9" text-anchor="middle">' + month + '</text>';

      // Invisible hover zone (full height column)
      svgHTML += '<rect x="' + (x(i) - (iw / n / 2)) + '" y="' + M.top + '" width="' + (iw / n) + '" height="' + (ih + M.bottom) + '" fill="transparent" data-idx="' + i + '" class="chart-hover-zone"/>';
    });

    svg.innerHTML = svgHTML;
    wrapper.appendChild(svg);
    container.appendChild(wrapper);

    // ── Hover interaction ──────────────────────────────────────
    const zones = svg.querySelectorAll('.chart-hover-zone');
    zones.forEach(zone => {
      zone.addEventListener('mouseenter', function(e) {
        const i = parseInt(this.dataset.idx);
        const v = d.total[i], sqlV = d.sqlAdj[i], month = d.months[i];
        const prevV = i > 0 ? d.total[i - 1] : null;
        const prevSql = i > 0 ? d.sqlAdj[i - 1] : null;
        const sqlPct = v > 0 ? Math.round(sqlV / v * 100) : 0;

        // Show vertical line
        const hline = svg.getElementById('hline-' + tpid + '-' + i);
        if (hline) hline.setAttribute('opacity', '1');

        // Enlarge dots
        const tdot = svg.getElementById('tdot-' + tpid + '-' + i);
        const sdot = svg.getElementById('sdot-' + tpid + '-' + i);
        if (tdot) tdot.setAttribute('r', '6');
        if (sdot) sdot.setAttribute('r', '5');

        // Build tooltip
        let html = '<div class="cpt-month">' + month + '</div>';
        html += '<div class="cpt-row"><span class="cpt-label">Total ACR</span><span class="cpt-val cpt-total">' + fmtD(v) + '</span></div>';
        html += '<div class="cpt-row"><span class="cpt-label">SQL-Adjacent</span><span class="cpt-val cpt-sql">' + fmtD(sqlV) + ' (' + sqlPct + '%)</span></div>';
        html += '<div class="cpt-row"><span class="cpt-label">Non-SQL</span><span class="cpt-val" style="color:var(--text-muted)">' + fmtD(v - sqlV) + '</span></div>';

        if (prevV !== null) {
          const totalDelta = v - prevV;
          const sqlDelta = sqlV - prevSql;
          const totalDPct = prevV > 0 ? ((totalDelta / prevV) * 100).toFixed(1) : '—';
          const sqlDPct = prevSql > 0 ? ((sqlDelta / prevSql) * 100).toFixed(1) : '—';
          const tCls = totalDelta >= 0 ? 'cpt-up' : 'cpt-down';
          const sCls = sqlDelta >= 0 ? 'cpt-up' : 'cpt-down';
          html += '<div class="cpt-delta">';
          html += '<div class="cpt-row"><span class="cpt-label">Total MoM</span><span class="' + tCls + '">' + (totalDelta >= 0 ? '+' : '') + fmtD(totalDelta) + ' (' + (totalDelta >= 0 ? '+' : '') + totalDPct + '%)</span></div>';
          html += '<div class="cpt-row"><span class="cpt-label">SQL MoM</span><span class="' + sCls + '">' + (sqlDelta >= 0 ? '+' : '') + fmtD(sqlDelta) + ' (' + (sqlDelta >= 0 ? '+' : '') + sqlDPct + '%)</span></div>';
          html += '</div>';
        }

        tip.innerHTML = html;
        tip.classList.add('visible');
      });

      zone.addEventListener('mousemove', function(e) {
        const rect = wrapper.getBoundingClientRect();
        let left = e.clientX - rect.left + 16;
        // Flip to left side if near right edge
        if (left + 200 > rect.width) left = e.clientX - rect.left - 200;
        tip.style.left = left + 'px';
        tip.style.top = (e.clientY - rect.top - 10) + 'px';
      });

      zone.addEventListener('mouseleave', function() {
        const i = parseInt(this.dataset.idx);
        const hline = svg.getElementById('hline-' + tpid + '-' + i);
        if (hline) hline.setAttribute('opacity', '0');
        const tdot = svg.getElementById('tdot-' + tpid + '-' + i);
        const sdot = svg.getElementById('sdot-' + tpid + '-' + i);
        if (tdot) tdot.setAttribute('r', '4');
        if (sdot) sdot.setAttribute('r', '3');
        tip.classList.remove('visible');
      });
    });
  }
})();
</script>
` : ''}

${Array.isArray(narrative.takeaways) && narrative.takeaways.length ? `
<!-- Key Takeaways -->
<div class="section">
  <div class="section-header">
    <div class="section-title">💡 Key Takeaways</div>
    <span class="section-badge badge-blue">${narrative.takeaways.length} Insights</span>
  </div>
  <ul class="takeaways">
    ${narrative.takeaways.map(t => {
      const markerMap = { '!': { cls: 'important', label: 'Important' }, '*': { cls: 'highlight', label: 'Highlight' }, 'd': { cls: 'risk', label: 'Risk' }, '?': { cls: 'question', label: 'Open Question' }, 'i': { cls: 'info', label: 'FYI' }, '>': { cls: 'delegated', label: 'Delegated' } };
      const m = markerMap[t.marker] || { cls: 'info', label: '' };
      return `<li class="takeaway takeaway-${m.cls}"><span class="takeaway-marker" title="${m.label}">${t.marker === '!' ? '❗' : t.marker === '*' ? '⭐' : t.marker === 'd' ? '📉' : t.marker === '?' ? '❓' : t.marker === 'i' ? 'ℹ️' : '→'}</span><span class="takeaway-text">${mdInline(t.text)}</span></li>`;
    }).join('\n    ')}
  </ul>
</div>
` : ''}

</div><!-- /container -->

<div class="footer">
  <p>SQL600 HLS Executive Readout · Generated ${generated} · Source: <a href="https://msit.powerbi.com/groups/me/orgapps/b78312cf-0ea0-4148-8ce9-ff1d9c4aab17/report/3f626edb-2cc1-4d4d-ac0c-b2252777b7de">SQL 600 Performance Tracking</a> (Power BI)</p>
  <p style="margin-top:4px">L.C.G · Chief of Staff Tooling</p>
</div>

<!-- Easter Egg -->
<div class="easter-egg" id="egg" onclick="this.classList.remove('show')">
  🏥 HLS #${hlsRank} of ${ranking.filter(r => r.Industry).length} · ${fmtDollar(snapshot.ACR_LCM)} ACR · ${fmtPct(snapshot.PipelinePenetration)} penetration 💜
</div>
<script>
  // Export PDF
  document.getElementById('exportBtn').addEventListener('click', () => {
    // Detect VS Code Simple Browser / webview (no real print support)
    const isWebview = !window.matchMedia || navigator.userAgent.includes('Electron') || typeof acquireVsCodeApi !== 'undefined';
    if (isWebview || !window.print) {
      // Fallback: open in system browser via copy-to-clipboard
      const path = location.href;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(path).then(() => {
          alert('This viewer does not support printing.\\n\\nFile path copied to clipboard — paste into Safari or Chrome, then use Cmd+P to export as PDF.');
        });
      } else {
        alert('This viewer does not support printing.\\n\\nOpen this file in Safari or Chrome, then use Cmd+P to export as PDF:\\n\\n' + path);
      }
      return;
    }
    window.print();
  });

  // Easter egg
  let clicks = 0;
  document.querySelector('.header').addEventListener('click', (e) => {
    if (e.target.closest('.export-btn')) return;
    if (++clicks === 3) { document.getElementById('egg').classList.add('show'); clicks = 0; }
  });

  // Expandable detail rows
  document.querySelectorAll('.expand-toggle').forEach(row => {
    row.addEventListener('click', () => {
      const id = row.getAttribute('data-detail');
      const detail = document.getElementById(id);
      if (!detail) return;
      const isOpen = row.classList.toggle('open');
      detail.classList.toggle('open', isOpen);
    });
  });
</script>

<!-- Palette Switcher -->
<div class="palette-switcher-wrap">
<div class="palette-switcher" role="group" aria-label="Color palette">
  <span class="ps-label">Theme</span>
  <button class="palette-swatch active" data-palette="default" title="Default (purple)" style="background: linear-gradient(135deg,#0f1117 50%,#6c5ce7 50%);"></button>
  <button class="palette-swatch" data-palette="red" title="Red" style="background: linear-gradient(135deg,#170c0c 50%,#ef4444 50%);"></button>
  <button class="palette-swatch" data-palette="orange" title="Orange" style="background: linear-gradient(135deg,#1a120a 50%,#f97316 50%);"></button>
  <button class="palette-swatch" data-palette="yellow" title="Yellow" style="background: linear-gradient(135deg,#1a1608 50%,#facc15 50%);"></button>
  <button class="palette-swatch" data-palette="green" title="Green" style="background: linear-gradient(135deg,#0c1612 50%,#22c55e 50%);"></button>
  <button class="palette-swatch" data-palette="blue" title="Blue" style="background: linear-gradient(135deg,#0a1320 50%,#3b82f6 50%);"></button>
  <button class="palette-swatch" data-palette="indigo" title="Indigo" style="background: linear-gradient(135deg,#0d0e22 50%,#6366f1 50%);"></button>
  <button class="palette-swatch" data-palette="violet" title="Violet" style="background: linear-gradient(135deg,#160c1f 50%,#8b5cf6 50%);"></button>
  <button class="palette-swatch" data-palette="gold" title="Gold" style="background: linear-gradient(135deg,#1a1408 50%,#d4af37 50%);"></button>
  <button class="palette-swatch" data-palette="pink" title="Pink" style="background: linear-gradient(135deg,#1a0e15 50%,#ec4899 50%);"></button>
  <button class="palette-swatch" data-palette="rainbow" title="Rainbow" style="background: linear-gradient(135deg,#ef4444,#f97316,#facc15,#22c55e,#3b82f6,#8b5cf6,#ec4899);"></button>
  <button class="palette-swatch" data-palette="light" title="Light" style="background: linear-gradient(135deg,#f5f6fa 50%,#6c5ce7 50%);"></button>
  <button class="palette-swatch party-btn" data-palette="party" title="\u{1F389} PARTY MODE \u{1F389}" aria-label="Party mode"></button>
</div>
</div>
<script>
(function() {
  const PALETTES = {
    default: { '--bg':'#0f1117','--surface':'#1a1d27','--surface-2':'#242837','--border':'#2d3148','--text':'#e4e5eb','--text-muted':'#8b8fa3','--accent':'#6c5ce7','--accent-light':'#a29bfe','--green':'#00b894','--green-bg':'rgba(0,184,148,0.12)','--red':'#ff6b6b','--red-bg':'rgba(255,107,107,0.12)','--yellow':'#ffc048','--yellow-bg':'rgba(255,192,72,0.12)','--blue':'#74b9ff','--blue-bg':'rgba(116,185,255,0.12)','--white':'#ffffff','--header-gradient':'linear-gradient(135deg, #1e1240 0%, #2d1f6b 40%, #6c5ce7 100%)','--header-glow':'radial-gradient(circle, rgba(108,92,231,0.3) 0%, transparent 70%)' },
    red: { '--bg':'#170c0c','--surface':'#241414','--surface-2':'#33201f','--border':'#4a2b2b','--text':'#f3e6e6','--text-muted':'#a89090','--accent':'#ef4444','--accent-light':'#fca5a5','--green':'#84cc16','--green-bg':'rgba(132,204,22,0.14)','--red':'#dc2626','--red-bg':'rgba(220,38,38,0.14)','--yellow':'#fbbf24','--yellow-bg':'rgba(251,191,36,0.14)','--blue':'#60a5fa','--blue-bg':'rgba(96,165,250,0.14)','--white':'#ffffff','--header-gradient':'linear-gradient(135deg, #2a0808 0%, #6b1818 40%, #ef4444 100%)','--header-glow':'radial-gradient(circle, rgba(239,68,68,0.35) 0%, transparent 70%)' },
    orange: { '--bg':'#1a120a','--surface':'#241a10','--surface-2':'#33261a','--border':'#4a3826','--text':'#f3ebe0','--text-muted':'#a89684','--accent':'#f97316','--accent-light':'#fdba74','--green':'#84cc16','--green-bg':'rgba(132,204,22,0.14)','--red':'#dc2626','--red-bg':'rgba(220,38,38,0.14)','--yellow':'#facc15','--yellow-bg':'rgba(250,204,21,0.14)','--blue':'#38bdf8','--blue-bg':'rgba(56,189,248,0.14)','--white':'#ffffff','--header-gradient':'linear-gradient(135deg, #2a1408 0%, #6b3818 40%, #f97316 100%)','--header-glow':'radial-gradient(circle, rgba(249,115,22,0.35) 0%, transparent 70%)' },
    yellow: { '--bg':'#1a1608','--surface':'#241f0e','--surface-2':'#332c18','--border':'#4a4128','--text':'#f3eedb','--text-muted':'#a89e7d','--accent':'#facc15','--accent-light':'#fde68a','--green':'#22c55e','--green-bg':'rgba(34,197,94,0.14)','--red':'#ef4444','--red-bg':'rgba(239,68,68,0.14)','--yellow':'#eab308','--yellow-bg':'rgba(234,179,8,0.14)','--blue':'#38bdf8','--blue-bg':'rgba(56,189,248,0.14)','--white':'#1a1608','--header-gradient':'linear-gradient(135deg, #2a2008 0%, #6b5418 40%, #facc15 100%)','--header-glow':'radial-gradient(circle, rgba(250,204,21,0.35) 0%, transparent 70%)' },
    green: { '--bg':'#0c1612','--surface':'#15241d','--surface-2':'#1f3329','--border':'#2a4538','--text':'#e0ebe4','--text-muted':'#7d9489','--accent':'#22c55e','--accent-light':'#86efac','--green':'#16a34a','--green-bg':'rgba(22,163,74,0.14)','--red':'#ef4444','--red-bg':'rgba(239,68,68,0.14)','--yellow':'#facc15','--yellow-bg':'rgba(250,204,21,0.14)','--blue':'#38bdf8','--blue-bg':'rgba(56,189,248,0.14)','--white':'#ffffff','--header-gradient':'linear-gradient(135deg, #082014 0%, #186b3a 40%, #22c55e 100%)','--header-glow':'radial-gradient(circle, rgba(34,197,94,0.35) 0%, transparent 70%)' },
    blue: { '--bg':'#0a1320','--surface':'#13213a','--surface-2':'#1c2d4d','--border':'#27395c','--text':'#e0e8f5','--text-muted':'#7a8aa3','--accent':'#3b82f6','--accent-light':'#93c5fd','--green':'#10b981','--green-bg':'rgba(16,185,129,0.14)','--red':'#f87171','--red-bg':'rgba(248,113,113,0.14)','--yellow':'#fbbf24','--yellow-bg':'rgba(251,191,36,0.14)','--blue':'#60a5fa','--blue-bg':'rgba(96,165,250,0.14)','--white':'#ffffff','--header-gradient':'linear-gradient(135deg, #08172e 0%, #1d3f7d 40%, #3b82f6 100%)','--header-glow':'radial-gradient(circle, rgba(59,130,246,0.35) 0%, transparent 70%)' },
    indigo: { '--bg':'#0d0e22','--surface':'#171830','--surface-2':'#222345','--border':'#33345e','--text':'#e4e5f5','--text-muted':'#8b8fb3','--accent':'#6366f1','--accent-light':'#a5b4fc','--green':'#10b981','--green-bg':'rgba(16,185,129,0.14)','--red':'#f87171','--red-bg':'rgba(248,113,113,0.14)','--yellow':'#fbbf24','--yellow-bg':'rgba(251,191,36,0.14)','--blue':'#60a5fa','--blue-bg':'rgba(96,165,250,0.14)','--white':'#ffffff','--header-gradient':'linear-gradient(135deg, #0d0e2e 0%, #2a2c7d 40%, #6366f1 100%)','--header-glow':'radial-gradient(circle, rgba(99,102,241,0.35) 0%, transparent 70%)' },
    violet: { '--bg':'#160c1f','--surface':'#22152e','--surface-2':'#311e42','--border':'#46305c','--text':'#ede4f5','--text-muted':'#a08fb3','--accent':'#8b5cf6','--accent-light':'#c4b5fd','--green':'#10b981','--green-bg':'rgba(16,185,129,0.14)','--red':'#f87171','--red-bg':'rgba(248,113,113,0.14)','--yellow':'#fbbf24','--yellow-bg':'rgba(251,191,36,0.14)','--blue':'#60a5fa','--blue-bg':'rgba(96,165,250,0.14)','--white':'#ffffff','--header-gradient':'linear-gradient(135deg, #1e0d33 0%, #4a2580 40%, #8b5cf6 100%)','--header-glow':'radial-gradient(circle, rgba(139,92,246,0.35) 0%, transparent 70%)' },
    gold: { '--bg':'#1a1408','--surface':'#241c0e','--surface-2':'#332818','--border':'#4a3a26','--text':'#f3ecd9','--text-muted':'#a89a78','--accent':'#d4af37','--accent-light':'#f1d878','--green':'#84cc16','--green-bg':'rgba(132,204,22,0.14)','--red':'#dc2626','--red-bg':'rgba(220,38,38,0.14)','--yellow':'#fbbf24','--yellow-bg':'rgba(251,191,36,0.14)','--blue':'#60a5fa','--blue-bg':'rgba(96,165,250,0.14)','--white':'#ffffff','--header-gradient':'linear-gradient(135deg, #2a1f08 0%, #7a5a18 40%, #d4af37 100%)','--header-glow':'radial-gradient(circle, rgba(212,175,55,0.40) 0%, transparent 70%)' },
    pink: { '--bg':'#1a0e15','--surface':'#261520','--surface-2':'#36202d','--border':'#4d2e3f','--text':'#f3e0ec','--text-muted':'#a8869b','--accent':'#ec4899','--accent-light':'#f9a8d4','--green':'#10b981','--green-bg':'rgba(16,185,129,0.14)','--red':'#ef4444','--red-bg':'rgba(239,68,68,0.14)','--yellow':'#fbbf24','--yellow-bg':'rgba(251,191,36,0.14)','--blue':'#60a5fa','--blue-bg':'rgba(96,165,250,0.14)','--white':'#ffffff','--header-gradient':'linear-gradient(135deg, #2a0817 0%, #7d1e51 40%, #ec4899 100%)','--header-glow':'radial-gradient(circle, rgba(236,72,153,0.35) 0%, transparent 70%)' },
    rainbow: { '--bg':'#0f0f1a','--surface':'#1a1a2e','--surface-2':'#262640','--border':'#3a3a5c','--text':'#f0e6f5','--text-muted':'#9b8fb3','--accent':'#ec4899','--accent-light':'#facc15','--green':'#22c55e','--green-bg':'rgba(34,197,94,0.14)','--red':'#ef4444','--red-bg':'rgba(239,68,68,0.14)','--yellow':'#facc15','--yellow-bg':'rgba(250,204,21,0.14)','--blue':'#3b82f6','--blue-bg':'rgba(59,130,246,0.14)','--white':'#ffffff','--header-gradient':'linear-gradient(135deg, #ef4444 0%, #f97316 18%, #facc15 36%, #22c55e 54%, #3b82f6 72%, #8b5cf6 88%, #ec4899 100%)','--header-glow':'radial-gradient(circle, rgba(255,255,255,0.25) 0%, transparent 70%)' },
    light: { '--bg':'#f5f6fa','--surface':'#ffffff','--surface-2':'#eef0f6','--border':'#d8dce6','--text':'#1a1d27','--text-muted':'#5a6072','--accent':'#6c5ce7','--accent-light':'#5848c2','--green':'#00866a','--green-bg':'rgba(0,134,106,0.12)','--red':'#d63031','--red-bg':'rgba(214,48,49,0.10)','--yellow':'#c98a00','--yellow-bg':'rgba(201,138,0,0.12)','--blue':'#0984e3','--blue-bg':'rgba(9,132,227,0.10)','--white':'#1a1d27','--header-gradient':'linear-gradient(135deg, #e8eaf6 0%, #c5cae9 40%, #6c5ce7 100%)','--header-glow':'radial-gradient(circle, rgba(108,92,231,0.25) 0%, transparent 70%)' }
  };
  const STORAGE_KEY = 'sql600-palette';
  function applyPalette(name) {
    const p = PALETTES[name] || PALETTES.default;
    const root = document.documentElement;
    Object.entries(p).forEach(([k,v]) => root.style.setProperty(k, v));
    document.querySelectorAll('.palette-swatch').forEach(b => {
      b.classList.toggle('active', b.dataset.palette === name);
    });
    try { localStorage.setItem(STORAGE_KEY, name); } catch (e) {}
  }
  // Party mode
  const PARTY_PALETTES = ['red','orange','yellow','green','blue','indigo','violet','pink','rainbow','gold'];
  const CONFETTI_COLORS = ['#ef4444','#f97316','#facc15','#22c55e','#3b82f6','#8b5cf6','#ec4899','#ffffff','#d4af37'];
  let partyState = null;
  function startParty() {
    if (partyState) return;
    document.body.classList.add('party-mode');
    document.querySelectorAll('.palette-swatch').forEach(b => {
      b.classList.toggle('active', b.dataset.palette === 'party');
    });
    let i = 0;
    const cycle = setInterval(() => {
      const p = PARTY_PALETTES[i++ % PARTY_PALETTES.length];
      const obj = PALETTES[p];
      if (obj) {
        const root = document.documentElement;
        Object.entries(obj).forEach(([k,v]) => root.style.setProperty(k, v));
      }
    }, 350);
    const confettiLayer = document.createElement('div');
    confettiLayer.id = 'party-confetti-layer';
    document.body.appendChild(confettiLayer);
    const confetti = setInterval(() => {
      for (let n = 0; n < 4; n++) {
        const c = document.createElement('div');
        c.className = 'party-confetti';
        c.style.left = Math.random() * 100 + 'vw';
        c.style.background = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
        c.style.animationDuration = (1.8 + Math.random() * 2.4) + 's';
        c.style.transform = 'rotate(' + (Math.random()*360) + 'deg)';
        c.style.width = (6 + Math.random()*8) + 'px';
        c.style.height = (10 + Math.random()*10) + 'px';
        confettiLayer.appendChild(c);
        setTimeout(() => c.remove(), 4500);
      }
    }, 120);
    partyState = { cycle, confetti, confettiLayer };
  }
  function stopParty() {
    if (!partyState) return;
    clearInterval(partyState.cycle);
    clearInterval(partyState.confetti);
    partyState.confettiLayer.remove();
    document.body.classList.remove('party-mode');
    partyState = null;
  }
  document.querySelectorAll('.palette-swatch').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.palette;
      if (name === 'party') {
        if (partyState) { stopParty(); applyPalette('default'); }
        else { startParty(); }
      } else {
        stopParty();
        applyPalette(name);
      }
    });
  });
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && PALETTES[saved]) applyPalette(saved);
  } catch (e) {}
})();
</script>

</body>
</html>`;

// ── Output ───────────────────────────────────────────────────────────────────
if (!outputFile) {
  const docDir = resolve(process.cwd(), '.copilot', 'docs');
  mkdirSync(docDir, { recursive: true });
  outputFile = resolve(docDir, `sql600-hls-readout-${generated}.html`);
}

mkdirSync(dirname(outputFile), { recursive: true });
writeFileSync(outputFile, html, 'utf8');

// ── Render PDF via headless Chrome (best-effort) ─────────────────────────────
const pdfPath = outputFile.replace(/\.html$/, '.pdf');
let pdfRendered = false;
if (!noPdf) {
  const chromePaths = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ];
  const chrome = chromePaths.find(p => existsSync(p));
  if (chrome) {
    try {
      execSync(
        `"${chrome}" --headless --disable-gpu --no-pdf-header-footer --print-to-pdf="${pdfPath}" --virtual-time-budget=5000 "file://${outputFile}" 2>/dev/null`,
        { stdio: 'ignore' }
      );
      if (existsSync(pdfPath)) pdfRendered = true;
    } catch { /* non-fatal */ }
  }
}

// ── Copy to OneDrive sync folder (default behavior when folder exists) ──────
const oneDriveRoot = resolve(homedir(), 'Library/CloudStorage/OneDrive-Microsoft');
const oneDriveDest = resolve(oneDriveRoot, 'L.C.G Reports/SQL600 HLS');
let oneDriveSynced = null;
if (!noShare && existsSync(oneDriveRoot)) {
  try {
    mkdirSync(oneDriveDest, { recursive: true });
    const htmlDest = resolve(oneDriveDest, basename(outputFile));
    copyFileSync(outputFile, htmlDest);
    const result = { html: htmlDest };
    if (pdfRendered) {
      const pdfDest = resolve(oneDriveDest, basename(pdfPath));
      copyFileSync(pdfPath, pdfDest);
      result.pdf = pdfDest;
    }
    oneDriveSynced = result;
  } catch (err) {
    oneDriveSynced = { error: err.message };
  }
}

console.log(JSON.stringify({
  output: outputFile,
  pdf: pdfRendered ? pdfPath : null,
  oneDrive: oneDriveSynced,
  generated,
  accounts: topAccounts.length,
  narrative: narrativePath ? { source: narrativePath, sections: Object.keys(narrative) } : null
}, null, 2));
