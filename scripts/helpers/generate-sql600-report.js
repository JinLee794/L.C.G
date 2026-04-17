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
    background: linear-gradient(135deg, #1e1240 0%, #2d1f6b 40%, #6c5ce7 100%);
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
    background: radial-gradient(circle, rgba(108,92,231,0.3) 0%, transparent 70%);
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
    <div class="meta-item">Model <strong>SQL 600 Performance Tracking</strong></div>
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
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Account</th>
        <th>Vertical</th>
        <th class="right">ACR (LCM)</th>
        <th class="right">Committed</th>
        <th class="right">Uncommitted</th>
        <th class="right">Ann. Growth</th>
        <th class="right">Opps</th>
        <th class="right">SQL Cores</th>
        <th>Why flagged</th>
      </tr>
    </thead>
    <tbody>
      ${topAccounts.map((a, i) => `<tr>
        <td style="color:var(--text-muted)">${i + 1}</td>
        ${acctCell(a)}
        <td>
          <span class="tag tag-${a.Vertical?.toLowerCase().includes('payor') ? 'payor' : a.Vertical?.toLowerCase().includes('provider') ? 'provider' : a.Vertical?.toLowerCase().includes('pharma') ? 'pharma' : 'medtech'}">${a.Vertical || '—'}</span>
          ${a.Segment ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px">${a.Segment}</div>` : ''}
        </td>
        <td class="right" style="font-weight:600">${fmtDollar(a.ACR_LCM, false)}</td>
        <td class="right">${fmtDollar(a.PipeCommitted, false)}</td>
        <td class="right">${fmtDollar(a.PipeUncommitted, false)}</td>
        <td class="right" style="color:var(--green)">${fmtDollar(a.AnnualizedGrowth)}</td>
        <td class="right">${fmtNum(a.QualifiedOpps) || '—'}/${fmtNum(a.TotalOpps) || '—'}</td>
        <td class="right">${fmtNum(a.SQLCores)}</td>
        <td class="why-cell">${topAccountRationale(a, i)}</td>
      </tr>`).join('\n      ')}
    </tbody>
  </table>
  ${narrative.topAccounts ? `<div class="chart-caption" style="margin-top:12px">${mdInline(narrative.topAccounts)}</div>` : ''}
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
    <div style="max-height: 400px; overflow-y: auto;">
    <table>
      <thead>
        <tr>
          <th>Account</th>
          <th>Category</th>
          <th>Renewal Q</th>
          <th class="right">SQL Cores</th>
          <th>Arc?</th>
          <th class="right">ACR</th>
          <th class="right">Committed</th>
          <th>Why flagged</th>
        </tr>
      </thead>
      <tbody>
        ${renewals.filter(r => r.RenewalQuarter).sort((a, b) => {
          const qa = a.RenewalQuarter || 'ZZ', qb = b.RenewalQuarter || 'ZZ';
          if (qa !== qb) return qa.localeCompare(qb);
          return (b.SQLCores || 0) - (a.SQLCores || 0);
        }).map(r => `<tr>
          ${acctCell(r, { maxWidth: 200 })}
          <td><span class="tag tag-${r.Category?.includes('Renewal') ? 'renewal' : r.Category?.includes('Cores') ? 'cores' : 'field'}">${r.Category?.replace('(Excl. renewals)', '').trim() || '—'}</span></td>
          <td><span class="tag tag-renewal">${r.RenewalQuarter || '—'}</span></td>
          <td class="right" style="font-weight:600">${fmtNum(r.SQLCores)}</td>
          <td><span class="tag ${r.ArcEnabled === 'Yes' ? 'tag-arc' : 'tag-no-arc'}">${r.ArcEnabled || 'No'}</span></td>
          <td class="right">${fmtDollar(r.ACR_LCM, false)}</td>
          <td class="right">${fmtDollar(r.PipeCommitted, false)}</td>
          <td class="why-cell">${renewalRationale(r)}</td>
        </tr>`).join('\n        ')}
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
    <div style="max-height: 400px; overflow-y: auto;">
    <table>
      <thead>
        <tr>
          <th>Account</th>
          <th>Vertical</th>
          <th class="right">ACR</th>
          <th class="right">Uncommitted</th>
          <th class="right">SQL Cores</th>
          <th>Why flagged</th>
        </tr>
      </thead>
      <tbody>
        ${gapAccounts.sort((a, b) => parseDollar(b.ACR_LCM) - parseDollar(a.ACR_LCM)).map(g => `<tr>
          ${acctCell(g, { maxWidth: 220 })}
          <td><span class="tag tag-${g.Vertical?.toLowerCase().includes('payor') ? 'payor' : g.Vertical?.toLowerCase().includes('provider') ? 'provider' : g.Vertical?.toLowerCase().includes('pharma') ? 'pharma' : 'medtech'}">${g.Vertical || '—'}</span></td>
          <td class="right">${fmtDollar(g.ACR_LCM, false)}</td>
          <td class="right">${fmtDollar(g.PipeUncommitted, false)}</td>
          <td class="right">${fmtNum(g.SQLCores)}</td>
          <td class="why-cell">${gapRationale(g)}</td>
        </tr>`).join('\n        ')}
      </tbody>
    </table>
    </div>
  </div>
</div>

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
