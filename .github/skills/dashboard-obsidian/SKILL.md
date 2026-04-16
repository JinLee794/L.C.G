---
name: dashboard-obsidian
description: 'Create, update, debug, and iterate on Obsidian dashboard UI components — KPI ribbons, customer health grids, milestone timelines, pipeline boards, scorecards, action streams, trend sparklines, and CSS snippets. Uses dataviewjs, Meta Bind, Kanban, Markwhen, Charts, Style Settings, and Cron plugins. USE FOR: dashboard layout, dataviewjs rendering, CSS status pills, progress bars, stacked bars, RAG logic, customer cards, milestone tables, pipeline funnel, kanban boards, timeline visualization, snapshot scripts, Meta Bind inputs, Style Settings tokens. DO NOT USE FOR: general Obsidian vault management, meeting notes, daily notes, frontmatter schema design (those are not dashboard concerns).'
argument-hint: 'Describe which dashboard panel to create, fix, or enhance'
---

# Obsidian Dashboard UI Components

Build and maintain data-rich, interactive dashboards inside an Obsidian vault using installed plugins and custom CSS/JS.

## When to Use

- Creating or editing `dataviewjs` panels (KPI cards, health grids, action streams, timelines)
- Adding or modifying CSS classes in `dashboard.css` or `dashboard-v2-settings.css`
- Wiring up Meta Bind inputs (customer selectors, status toggles)
- Generating or updating Kanban pipeline boards from milestone data
- Building trend sparklines or charts from snapshot data
- Debugging rendering issues in wide-page dashboard views

## Vault Data Model

Understand these entities before querying:

```
Customer  → Customers/{Name}/{Name}.md          (tag: #customer)
Milestone → Customers/{Name}/milestones/*.md     (tag: #milestone)
Opportunity → Customers/{Name}/opportunities/*.md (tag: #opportunity)
Project   → Projects/*.md                        (field: customer)
Meeting   → Meetings/*.md                        (field: customer, date)
People    → People/*.md                          (field: customers)
```

Key frontmatter fields:

| Entity | Fields |
|---|---|
| Milestone | `status` (On Track / At Risk / Blocked), `milestonedate`, `owner`, `opportunity`, `number` |
| Opportunity | `status` (Active), `salesplay`, `owner`, `guid`, `last_validated` |
| Project | `status` (active/on-hold/completed/archived), `type`, `priority`, `target_date`, `customer` |
| Meeting | `date`, `customer`, `project`, `status` (open/closed) |
| Customer | `has_unified`, `industry`, `MSX.account`, `MSX.accountId` |

### Relationship Resolution

- **Milestone → Customer**: Parse `file.folder.split('/')[indexOf('Customers') + 1]`
- **Milestone → Opportunity**: `opportunity` frontmatter field matches opp `file.name`
- **Project/Meeting → Customer**: `customer` frontmatter field (may be a Link object, array, or string — always use `getCust()` helper)
- **Stale detection**: Compare meeting dates against `today - dv.duration('14 days')`

## Dashboard Files

| File | Purpose | Plugins Used |
|---|---|---|
| [Dashboard/Command Center.md](../../Dashboard/Command%20Center.md) | Main hub — KPI cards, customer health, action stream, opp + milestone timelines | dataviewjs, CSS |
| [Dashboard/Customer Scorecard.md](../../Dashboard/Customer%20Scorecard.md) | Per-customer drill-down with selector | dataviewjs, Meta Bind, CSS |
| [Dashboard/Day View.md](../../Dashboard/Day%20View.md) | Date-picker daily focus — meetings, tasks, activity | dataviewjs, Meta Bind, CSS |
| [Dashboard/People Directory.md](../../Dashboard/People%20Directory.md) | People tables by org type | dataview |
| [.obsidian/snippets/dashboard.css](../../.obsidian/snippets/dashboard.css) | All dashboard CSS classes | Style Settings |
| [.obsidian/snippets/dashboard-v2-settings.css](../../.obsidian/snippets/dashboard-v2-settings.css) | Style Settings color/layout tokens | Style Settings |

## Plugin Reference

### Dataview / dataviewjs (Primary)

All dashboard panels render via `dataviewjs` blocks with inline HTML/CSS using `dv.el()` and `createEl()`.

**Standard helpers** (copy into every dataviewjs block that queries entities):

```js
// Extract customer name from Link objects, arrays, or strings
const getCust = (v) => {
  if (!v) return null;
  if (Array.isArray(v)) return getCust(v[0]);
  if (typeof v === 'object' && v.path) return v.path.split('/').pop();
  const s = String(v).trim();
  return s && s !== 'null' && s !== 'undefined' ? s : null;
};

// Safe date comparison (handles DateTime vs string mismatches)
const safeDate = (d) => {
  if (!d) return null;
  try { return typeof d === 'string' ? dv.date(d) : d; } catch(e) { return null; }
};

// Safe date formatting
const safeFmt = (d, fmt) => {
  const dt = safeDate(d);
  return dt ? dv.func.dateformat(dt, fmt) : '';
};
```

**Common query patterns:**

```js
const milestones = dv.pages('#milestone');
const opportunities = dv.pages('#opportunity');
const meetings = dv.pages('"Meetings"');
const projects = dv.pages('"Projects"');
const customers = dv.pages('"Customers"').where(c => c.tags && dv.func.contains(c.tags, 'customer'));
const today = dv.date('today');
const d7 = today - dv.duration('7 days');
const d14 = today - dv.duration('14 days');
const d30 = today - dv.duration('30 days');
```

**Rendering pattern** — always use `createEl()` for DOM building:

```js
const container = dv.el('div', '', { attr: { style: '...' } });
const card = container.createEl('div', { cls: 'customer-card rag-green', attr: { style: '...' } });
card.createEl('a', {
  text: name,
  attr: { 'data-href': name, href: name, class: 'internal-link', style: '...' }
});
```

**Performance rules:**
- Limit grids to ~20 cards; paginate action streams to ~25 items
- Cache query results in local vars — don't re-query inside loops
- Each `dataviewjs` block is isolated; helpers must be redeclared per block

### Meta Bind (`obsidian-meta-bind-plugin`)

Used for interactive inputs bound to frontmatter fields.

**Customer selector** (used in Customer Scorecard):
````markdown
```meta-bind
INPUT[suggester(optionQuery(#customer), useLinks(false)):selected_customer]
```
````

Then read in dataviewjs: `const selected = dv.current().selected_customer;`

**Status toggle** (for filtering):
````markdown
```meta-bind
INPUT[toggle:show_completed_milestones]
```
````

**Inline status editor** (for milestone notes):
````markdown
```meta-bind
INPUT[select(On Track, At Risk, Blocked):status]
```
````

### Kanban (`obsidian-kanban`)

For draggable pipeline boards. Requires this frontmatter:

```yaml
---
kanban-plugin: basic
---
```

Board format is markdown with lanes as `## Headings` and cards as list items with wiki-links. Generation scripts should produce this format. The live virtual kanban in `Pipeline Board (Live).md` is rendered via dataviewjs as a read-only alternative.

### Markwhen

Timeline/Gantt visualization. Used in `Milestone Timeline.md`. Format:

```markwhen
title: Milestone Pipeline
dateFormat: YYYY-MM-DD

group CustomerName #color
YYYY-MM-DD: Milestone title
```

The dataviewjs block below it generates a live HTML/CSS timeline as a fallback.

### Charts (`obsidian-charts`) — Optional

If installed, replaces pure-CSS bars with Chart.js visuals. Render via:

````markdown
```chart
type: doughnut
labels: [On Track, At Risk, Blocked]
series:
  - data: [28, 5, 3]
    backgroundColor: ['#00c853', '#ff9100', '#ff1744']
```
````

### Style Settings (`obsidian-style-settings`)

Color tokens and layout vars are exposed in `dashboard-v2-settings.css` using `@settings` block format. CSS classes reference these as `var(--color-green, #fallback)`.

**When adding new color tokens**, update both:
1. The `@settings` block in `dashboard-v2-settings.css`
2. The CSS class using it in `dashboard.css`

### Cron (`cron`)

Scheduled tasks for snapshot generation and board regeneration. Triggers on vault open or at configured intervals.

## CSS Architecture

All CSS lives in `.obsidian/snippets/dashboard.css` with v2 enhancements inline.

### Available CSS Classes

| Class | Purpose |
|---|---|
| `.wide-page` | Max-width override for dashboards (use in `cssclasses` frontmatter) |
| `.status-pill`, `.status-on-track`, `.status-at-risk`, `.status-blocked`, `.status-past-due`, `.status-active` | Colored status badges |
| `.customer-card`, `.rag-green`, `.rag-amber`, `.rag-red` | Customer health cards with RAG border |
| `.progress-bar`, `.progress-bar-fill` | Horizontal progress bars |
| `.stacked-bar` | Segmented horizontal bar (pipeline breakdown) |
| `.milestone-timeline`, `.timeline-item`, `.timeline-dot`, `.timeline-label`, `.timeline-date` | Horizontal scrollable timeline |
| `.action-stream-item`, `.priority-1` through `.priority-6` | Action feed items with priority border |
| `.funnel-row`, `.funnel-bar`, `.funnel-label`, `.funnel-count` | Funnel/horizontal bar chart rows |
| `.sparkline`, `.sparkline-bar` | Mini inline bar charts |
| `.two-col`, `.three-col` | Responsive grid layouts |
| `.scorecard-section` | Section wrapper in scorecard views |
| `.milestone-row` | Styled table row for milestone lists |
| `.heat-high`, `.heat-med`, `.heat-low`, `.heat-cold` | Customer heat-map legend colors |

### RAG Status Logic (Standard)

Apply consistently across all dashboard panels:

```js
let rag = 'green';
if (blocked > 0 || !lastMeetingDate || lastMeetingDate < d14) rag = 'red';
else if (atRisk > 0 || lastMeetingDate < d7) rag = 'amber';
```

- **Green**: All milestones On Track, meeting within 7 days
- **Amber**: Any milestone At Risk OR no meeting in 7–14 days
- **Red**: Any milestone Blocked OR no meeting in 14+ days

### Color Palette

| Token | Hex | Usage |
|---|---|---|
| `--color-green` | `#00c853` | On Track / Healthy |
| `--color-amber` | `#ff9100` | At Risk / Warning |
| `--color-red` | `#ff1744` | Blocked / Danger |
| `--color-crimson` | `#d50000` | Past Due / Critical |
| `--color-blue` | `#448aff` | Active / Info |
| `--color-purple` | `#7c4dff` | Accent / Meetings |
| `--color-orange` | `#ff6d00` | Stale / Needs Attention |

## Procedures

### Adding a New KPI Card to the Ribbon

1. Add a query in the dataviewjs block that calculates the value
2. Push a new object to the `cards` array: `{ label: '...', value: count, color: '#hex' }`
3. The existing loop renders it automatically as a flex card

### Adding a New Customer Card Field

1. Compute the value inside the customer iteration loop
2. Add a `createEl('div', { text: ... })` inside the card builder
3. If it's a badge, use `<span>` with status-pill classes

### Creating a New Dashboard Panel

1. Create a new `dataviewjs` block with section comment header
2. Declare helpers (`getCust`, `safeDate`, `safeFmt`) at top
3. Query required entities
4. Build DOM using `dv.el()` + `createEl()` pattern
5. Use existing CSS classes from [dashboard.css reference](#available-css-classes)
6. Add `cssclasses: [wide-page]` to frontmatter if full-width

### Updating CSS

1. Edit `.obsidian/snippets/dashboard.css` for new visual classes
2. If adding configurable colors, also update `.obsidian/snippets/dashboard-v2-settings.css`
3. Use `var(--token-name, #fallback)` pattern for all colors
4. Test in both light and dark themes

### Generating Snapshot Data

Create `Dashboard/_snapshots/YYYY-MM-DD.json` with this schema:

```json
{
  "date": "YYYY-MM-DD",
  "milestones": {
    "total": 0, "on_track": 0, "at_risk": 0, "blocked": 0, "past_due": 0,
    "by_customer": { "Name": { "total": 0, "on_track": 0, "at_risk": 0, "blocked": 0 } }
  },
  "opportunities": {
    "total": 0, "active": 0,
    "by_customer": { "Name": { "total": 0, "active": 0 } }
  },
  "meetings": { "last_7d": 0, "last_30d": 0, "by_customer_7d": {} },
  "tasks_open": 0
}
```

### Debugging Dataviewjs Rendering

1. Check for unbalanced braces: `awk '/^```dataviewjs/{c=1;b=0;next} /^```$/{if(c){if(b!=0)print "UNBALANCED: "b" at line "NR;c=0}next} c{gsub(/[^{}]/,"");for(i=1;i<=length($0);i++){ch=substr($0,i,1);if(ch=="{")b++;if(ch=="}")b--}}' "file.md"`
2. Verify `dv.pages()` queries return expected results (check tags, folder paths)
3. Confirm frontmatter `cssclasses: [wide-page]` is present on dashboard pages
4. Check that CSS snippet is enabled in Obsidian → Appearance → CSS snippets
5. If `createEl` renders incorrectly, check for missing closing tags in attr style strings

### Wiring Meta Bind to Dataviewjs

1. Add Meta Bind input block above the dataviewjs block
2. Bind to a frontmatter field (e.g., `selected_customer`)
3. In dataviewjs, read with `dv.current().field_name`
4. Guard with `if (!selected) { dv.paragraph('*Select...*'); return; }`

## Design Principles

1. **Inline-styled HTML via createEl** — no external templates; everything renders inside dataviewjs blocks
2. **CSS classes for reusable visuals** — status pills, cards, timeline dots live in dashboard.css
3. **Progressive enhancement** — pure CSS/HTML first; Charts plugin as optional upgrade
4. **Mobile-responsive** — use `flex-wrap`, `minmax()` grids, and `@media` breakpoints in CSS
5. **Color consistency** — always use the 7-token palette via CSS custom properties
6. **Helper reuse** — copy `getCust`, `safeDate`, `safeFmt` into every block (blocks are isolated)
7. **Data locality** — query once at block top, filter in memory; avoid nested `dv.pages()` calls
