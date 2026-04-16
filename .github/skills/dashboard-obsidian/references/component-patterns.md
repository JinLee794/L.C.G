# Component Pattern Library

Concrete patterns extracted from the live dashboard codebase. Copy and adapt these when building new panels.

## KPI Ribbon Card

Renders a horizontal row of stat cards with colored left borders.

```js
const cards = [
  { label: '✅ On Track', value: msOnTrack, color: '#00c853' },
  { label: '⚠️ At Risk',  value: msAtRisk,  color: '#ff9100' },
  // ...add more
];

const grid = dv.el('div', '', {
  attr: { style: 'display:flex;gap:10px;flex-wrap:wrap;margin:8px 0 16px 0;' }
});

for (const c of cards) {
  const card = grid.createEl('div', {
    attr: { style: `flex:1 1 120px;min-width:110px;padding:12px 14px;border-radius:10px;background:var(--background-secondary);border-left:4px solid ${c.color};` }
  });
  card.createEl('div', {
    text: c.label,
    attr: { style: 'font-size:0.7em;text-transform:uppercase;letter-spacing:0.04em;opacity:0.6;margin-bottom:3px;' }
  });
  card.createEl('div', {
    text: String(c.value),
    attr: { style: `font-size:1.7em;font-weight:700;color:${c.color};line-height:1.2;` }
  });
}
```

## Pipeline Stacked Bar

Horizontal bar showing milestone status distribution.

```js
if (msTotal > 0) {
  const barWrap = dv.el('div', '', { attr: { style: 'margin:8px 0 24px 0;' } });
  barWrap.createEl('div', {
    text: `PIPELINE: ${msTotal} milestones`,
    attr: { style: 'font-size:0.7em;text-transform:uppercase;letter-spacing:0.04em;opacity:0.5;margin-bottom:4px;' }
  });
  const bar = barWrap.createEl('div', {
    attr: { style: 'display:flex;border-radius:6px;overflow:hidden;height:16px;' }
  });
  for (const [cnt, col, lbl] of [[msOnTrack,'#00c853','On Track'],[msAtRisk,'#ff9100','At Risk'],[msBlocked,'#ff1744','Blocked']]) {
    if (cnt > 0) bar.createEl('div', {
      text: `${lbl} ${cnt}`,
      attr: { style: `width:${(cnt/msTotal)*100}%;background:${col};display:flex;align-items:center;justify-content:center;font-size:0.62em;font-weight:600;color:white;white-space:nowrap;` }
    });
  }
}
```

## Customer Health Card (with RAG)

One card per customer showing milestone counts, meeting recency, progress bar.

```js
const container = dv.el('div', '', {
  attr: { style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;margin:8px 0;' }
});

for (const [name, s] of sortedCustomers) {
  let ragColor = '#00c853';
  if (s.ms.blocked > 0 || !s.last || s.last < d14) ragColor = '#ff1744';
  else if (s.ms.atRisk > 0 || s.last < d7) ragColor = '#ff9100';

  const card = container.createEl('div', {
    attr: { style: `padding:12px 14px;border-radius:10px;background:var(--background-secondary);border-left:4px solid ${ragColor};` }
  });

  // Customer name as internal link
  card.createEl('a', {
    text: name,
    attr: { 'data-href': name, href: name, class: 'internal-link', style: 'font-weight:700;' }
  });

  // Milestone summary line
  card.createEl('div', {
    text: `Milestones: ${s.ms.total} (${s.ms.onTrack}✅ ${s.ms.atRisk}⚠️ ${s.ms.blocked}🔴)`,
    attr: { style: 'font-size:0.85em;margin:4px 0;' }
  });

  // Progress bar
  const pct = s.ms.total > 0 ? Math.round((s.ms.onTrack / s.ms.total) * 100) : 100;
  const bar = card.createEl('div', {
    attr: { style: 'height:6px;border-radius:3px;background:var(--background-modifier-border);overflow:hidden;display:flex;' }
  });
  if (s.ms.onTrack > 0) bar.createEl('div', { attr: { style: `width:${(s.ms.onTrack/s.ms.total)*100}%;background:#00c853;` } });
  if (s.ms.atRisk > 0) bar.createEl('div', { attr: { style: `width:${(s.ms.atRisk/s.ms.total)*100}%;background:#ff9100;` } });
  if (s.ms.blocked > 0) bar.createEl('div', { attr: { style: `width:${(s.ms.blocked/s.ms.total)*100}%;background:#ff1744;` } });
}
```

## Virtual Kanban (Columns by Status)

Read-only kanban rendered as flex columns with cards.

```js
const lanes = {
  'Blocked':  { color: '#ff1744', items: [] },
  'At Risk':  { color: '#ff9100', items: [] },
  'On Track': { color: '#00c853', items: [] },
};

// Populate lanes from milestones...

const board = dv.el('div', '', {
  attr: { style: 'display:flex;gap:16px;overflow-x:auto;padding:8px 0;align-items:flex-start;' }
});

for (const [status, lane] of Object.entries(lanes)) {
  const col = board.createEl('div', { attr: { style: 'flex:1;min-width:260px;max-width:350px;' } });

  // Lane header
  const hdr = col.createEl('div', {
    attr: { style: `padding:8px 12px;border-radius:8px 8px 0 0;background:${lane.color}22;border-bottom:2px solid ${lane.color};display:flex;justify-content:space-between;` }
  });
  hdr.createEl('span', { text: status, attr: { style: `font-weight:700;color:${lane.color};` } });
  hdr.createEl('span', { text: String(lane.items.length), attr: { style: `font-size:0.8em;padding:2px 8px;border-radius:10px;background:${lane.color}33;color:${lane.color};` } });

  // Cards
  for (const item of lane.items) {
    const card = col.createEl('div', {
      attr: { style: 'padding:8px 10px;margin:4px 0;border-radius:6px;background:var(--background-secondary);border-left:3px solid ' + lane.color + ';' }
    });
    card.createEl('a', {
      text: item.ms.file.name,
      attr: { 'data-href': item.ms.file.name, href: item.ms.file.name, class: 'internal-link', style: 'font-weight:600;text-decoration:none;' }
    });
    card.createEl('div', {
      text: `${item.custName} · ${safeFmt(item.ms.milestonedate, 'MMM d')}`,
      attr: { style: 'font-size:0.78em;opacity:0.5;' }
    });
  }
}
```

## Milestone Table (Styled Rows)

Two-column grid of milestones sorted by severity, with status icons and overdue badges.

```js
const sortedMs = milestones.sort(m => m.status === 'Blocked' ? 0 : m.status === 'At Risk' ? 1 : 2);
const msGrid = container.createEl('div', {
  attr: { style: 'display:grid;grid-template-columns:1fr 1fr;gap:2px 10px;' }
});

for (const ms of sortedMs) {
  const isOverdue = ms.milestonedate && ms.milestonedate < today;
  const daysUntil = ms.milestonedate ? Math.round((ms.milestonedate - today) / (1000 * 60 * 60 * 24)) : null;
  const icon = ms.status === 'On Track' ? '✅' : ms.status === 'At Risk' ? '⚠️' : '🔴';

  const row = msGrid.createEl('div', {
    attr: { style: 'padding:3px 6px;border-radius:4px;background:var(--background-secondary);display:flex;align-items:center;gap:5px;font-size:0.82em;' }
  });
  row.createEl('span', { text: icon });
  const info = row.createEl('div', { attr: { style: 'flex:1;min-width:0;display:flex;align-items:baseline;gap:4px;' } });
  info.createEl('a', {
    text: ms.file.name,
    attr: { 'data-href': ms.file.name, href: ms.file.name, class: 'internal-link', style: 'font-weight:600;text-decoration:none;overflow:hidden;text-overflow:ellipsis;' }
  });
  if (isOverdue) info.createEl('span', {
    text: `${Math.abs(daysUntil)}d overdue`,
    attr: { style: 'font-size:0.72em;color:#d50000;font-weight:600;' }
  });
  row.createEl('span', {
    text: safeFmt(ms.milestonedate, 'MMM d'),
    attr: { style: 'font-size:0.78em;opacity:0.45;' }
  });
}
```

## Opportunity Grid (Two-Column)

Opportunities with linked milestone counts and stale badges.

```js
const oppGrid = container.createEl('div', {
  attr: { style: 'display:grid;grid-template-columns:1fr 1fr;gap:2px 10px;' }
});

for (const opp of opportunities) {
  const isStale = opp.last_validated && (today - opp.last_validated) > dv.duration('30 days');
  const oppMs = milestones.where(m => m.opportunity === opp.file.name);

  const row = oppGrid.createEl('div', {
    attr: { style: 'padding:4px 7px;border-radius:4px;background:var(--background-secondary);font-size:0.82em;' }
  });
  const titleRow = row.createEl('div', { attr: { style: 'display:flex;align-items:center;gap:4px;' } });
  titleRow.createEl('a', {
    text: opp.file.name,
    attr: { 'data-href': opp.file.name, href: opp.file.name, class: 'internal-link', style: 'font-weight:600;' }
  });
  if (isStale) titleRow.createEl('span', {
    text: 'STALE',
    attr: { style: 'font-size:0.7em;color:#ff9100;font-weight:600;' }
  });
}
```

## Scorecard Header (Rich Card with Mini KPIs)

Full-width header card with RAG border, customer link, badge, and KPI row.

```js
const header = dv.el('div', '', {
  attr: { style: `padding:12px 16px;border-radius:10px;background:var(--background-secondary);border-left:4px solid ${ragColor};` }
});

// Name + RAG badge
const hRow = header.createEl('div', { attr: { style: 'display:flex;align-items:center;gap:10px;' } });
hRow.createEl('a', { text: name, attr: { 'data-href': name, href: name, class: 'internal-link', style: 'font-size:1.2em;font-weight:800;' } });
hRow.createEl('span', { text: ragText, attr: { style: `font-size:0.78em;padding:2px 8px;border-radius:10px;background:${ragColor}22;color:${ragColor};font-weight:600;` } });

// Mini KPI row
const kpiRow = header.createEl('div', { attr: { style: 'display:flex;gap:20px;margin-top:8px;' } });
const miniCard = (label, value, color) => {
  const c = kpiRow.createEl('div', { attr: { style: 'text-align:center;' } });
  c.createEl('div', { text: String(value), attr: { style: `font-size:1.4em;font-weight:700;color:${color};` } });
  c.createEl('div', { text: label, attr: { style: 'font-size:0.65em;text-transform:uppercase;opacity:0.5;' } });
};
miniCard('On Track', msOnTrack, '#00c853');
miniCard('At Risk', msAtRisk, '#ff9100');
miniCard('Blocked', msBlocked, '#ff1744');
```

## Side-by-Side Panels

Two columns for meetings + projects, or any paired data.

```js
const bWrap = container.createEl('div', {
  attr: { style: 'display:grid;grid-template-columns:1fr 1fr;gap:10px;' }
});

// Left column
const leftCol = bWrap.createEl('div');
leftCol.createEl('div', { text: '📅 Meetings', attr: { style: 'font-weight:700;font-size:0.85em;' } });
for (const m of recentMeetings) {
  const row = leftCol.createEl('div', {
    attr: { style: 'padding:3px 7px;margin:1px 0;border-radius:4px;background:var(--background-secondary);display:flex;justify-content:space-between;font-size:0.78em;' }
  });
  row.createEl('a', { text: m.file.name, attr: { 'data-href': m.file.name, href: m.file.name, class: 'internal-link' } });
  row.createEl('span', { text: safeFmt(m.date, 'MMM d'), attr: { style: 'opacity:0.45;' } });
}

// Right column follows same pattern
```

## Internal Link Pattern

All dashboard links MUST use this pattern to be clickable in Obsidian:

```js
element.createEl('a', {
  text: displayName,
  attr: {
    'data-href': targetNoteName,  // Required for Obsidian link resolution
    href: targetNoteName,          // Fallback
    class: 'internal-link',        // Required for Obsidian styling
    style: 'font-weight:600;text-decoration:none;'
  }
});
```
