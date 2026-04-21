# AGENTS.md — Developer Guide for AI Coding Agents

Scope: **editing this repo's code** (scripts, tasks, prompts, skills).
For the *runtime* Chief-of-Staff persona (triage, vault writes, M365 link policy, tone), read [.github/copilot-instructions.md](.github/copilot-instructions.md) — that is behavior when the toolkit runs, not when it is built. Do not duplicate it here.

## Start here

1. [README.md](README.md) — install + user story.
2. [narrative/NARRATIVE.md](narrative/NARRATIVE.md) — why this exists.
3. [.github/skills/SKILLS.md](.github/skills/SKILLS.md) — index of all skills.
4. [.github/specs/skill-modularity.md](.github/specs/skill-modularity.md) — how skills compose.

## What this repo is

`lcg` / **L.C.G.** ("Let Copilot Grind") — a Node.js ≥18, ESM-only CLI + prompt toolkit that wraps GitHub Copilot CLI. Surfaces:

- **Tasks** — [scripts/tasks/](scripts/tasks/), dispatched by [scripts/run.js](scripts/run.js). Scheduled or on-demand.
- **Prompts** — [.github/prompts/](.github/prompts/). Copilot-invocable workflows (`*.prompt.md`).
- **Skills** — [.github/skills/](.github/skills/). Progressive-disclosure domain expertise.
- **Helpers** — [scripts/helpers/](scripts/helpers/). Deterministic M365/CRM/PBI data shapers.
- **Lib** — [scripts/lib/](scripts/lib/): `runner`, `copilot`, `prompt`, `validate`, `vault-ops`, `secure-path`, `config`, `logger`.

## Commands

All in [package.json](package.json).

| Task | Command |
|---|---|
| Install & wire env | `npm run setup` |
| Prerequisite dry check | `npm run bootstrap:check` |
| List runnable tasks | `npm run task:list` |
| Run a task | `npm run task -- <name>` (e.g. `morning-triage`) |
| Vault bootstrap | `npm run vault:init` |
| Capture fixtures | `npm run fixtures:capture` |

Eval scripts (`npm run eval*`) reference `vitest.config.ts` and `evals/vitest.live.config.ts` — **those configs are not currently in the tree**. Don't assume evals run without also adding the missing config + specs.

Known [package.json](package.json) quirk: `"setup"` is defined twice in `scripts` — the second silently wins. Check for collisions before adding scripts.

## Task authoring — declarative, not imperative

Tasks **export a config object**; the runner executes it. Do not write a `run(ctx)` function. Mirror [scripts/tasks/morning-triage.js](scripts/tasks/morning-triage.js):

```js
export default {
  name: "morning-triage",
  prompt: "triage-morning.prompt.md",     // in .github/prompts/
  repairPrompt: "triage-morning-repair.prompt.md",
  skipWeekends: true,
  maxRepairAttempts: 1,
  variables: { TODAY: ({ date }) => date },
  artifactPath: ({ date, vaultDir }) => join(vaultDir, "Daily", `${date}.md`),
  validate: { requiredSections: [...], sectionCountPattern: /.../, assumptionCount: 3 },
  onSuccess: async (ctx) => { /* optional hook */ },
  schedule: { days: ["Mon","Tue","Wed","Thu","Fri"], time: "07:00" }, // optional
};
```

Then register a matching `task:<name>` npm alias in [package.json](package.json).

## Conventions

- **ESM only** (`"type": "module"`). Use `import`, `import.meta.dirname`. No `require`, no CJS.
- **Node ≥18**. Plain JavaScript in `scripts/`; TypeScript only under `evals/traces/` when present.
- **Helpers over inline parsing.** When shaping M365/CRM/PBI payloads, extend [scripts/helpers/](scripts/helpers/). See [.github/instructions/m365-data-helpers.instructions.md](.github/instructions/m365-data-helpers.instructions.md).
- **Prompts delegate, skills compose.** Prompts are workflows; domain logic lives in skills that compose from `_shared/`. New/edited skills: run the `dev-skill-authoring` checklist and update [SKILLS.md](.github/skills/SKILLS.md).
- **Filesystem writes that touch user input go through [scripts/lib/secure-path.js](scripts/lib/secure-path.js).** Cloud-synced roots (OneDrive / Dropbox / Google Drive / iCloud) are deliberately blocked — don't undo that.
- **Vault writes use OIL MCP tools** (`oil:create_note`, `oil:atomic_replace`, `oil:atomic_append`) — never `create_file`. Workspace artifacts (`.pptx`, `.xlsx`, `.docx`, `.pdf`) are the exception and go to `.copilot/docs/`.
- **MCP config changes are gated.** Before touching `.vscode/mcp.json` or suggesting a new server, load and run the `dev-mcp-security` skill.

## Pitfalls

- **Vault lives outside the workspace.** Repo searches won't find vault notes — use OIL tools.
- **Bootstrap GitHub auth uses the personal GitHub account**, not the `_microsoft` EMU account (documented in README, easy to trip on).
- **Windows-only installer paths.** Don't assume POSIX separators in installer or secure-path logic.
- **Don't re-embed operational rules.** Triage taxonomy, M365 link policy, tone, checkbox syntax — all already in `.github/copilot-instructions.md` and `.github/instructions/`. Link, don't copy.

## Adding a new capability — decision tree

1. Scheduled or CLI-invoked automation? → new file in [scripts/tasks/](scripts/tasks/) + `task:*` npm alias.
2. Copilot-invocable workflow? → new `.prompt.md` in [.github/prompts/](.github/prompts/).
3. Composable domain knowledge? → new skill folder in [.github/skills/](.github/skills/), pull reusable fragments from `_shared/`, update [SKILLS.md](.github/skills/SKILLS.md).
4. Data shape / scoring / parsing? → helper in [scripts/helpers/](scripts/helpers/). Never inline in a task or prompt.
