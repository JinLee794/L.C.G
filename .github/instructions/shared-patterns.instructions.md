---
applyTo: "**"
---
# Shared Patterns

## Artifact Output Directory

Generated artifacts (`.html`, `.pptx`, `.xlsx`, `.docx`, `.pdf`, `.csv`, and other non-markdown outputs) follow a three-tier resolution for their output directory:

### Resolution Order

| Priority | Condition | Output Path | Tool |
|---|---|---|---|
| 1 | Skill defines a specific vault path | Skill-defined OIL path (e.g., `Daily/SQL600-HLS/`) | `oil:create_note` / `oil:atomic_replace` |
| 2 | OIL MCP server is available, no skill-defined path | `LCG-Artifacts/` in the Obsidian vault | `oil:create_note` / `oil:atomic_replace` |
| 3 | OIL MCP server is NOT available | `.copilot/docs/` in the workspace | `create_file` (with `mkdirSync` / `os.makedirs`) |

### Detection

To determine OIL availability, attempt a lightweight OIL call (e.g., `oil:get_note_metadata` for the target path). If the call succeeds or returns a "not found" result, OIL is available. If the tool is not recognized or errors with a connection failure, fall back to `.copilot/docs/`.

### Rules

- **Markdown vault notes** (triage notes, meeting briefs, audit reports) always go through OIL per the Vault Write Policy in `copilot-instructions.md`. This section governs non-markdown and binary artifacts only when a skill does not already define its own OIL path.
- When writing to `LCG-Artifacts/` via OIL, organize by type or skill slug when the volume warrants it (e.g., `LCG-Artifacts/sql600-hls/`, `LCG-Artifacts/decks/`). For one-off artifacts, the root `LCG-Artifacts/` is fine.
- When writing to `.copilot/docs/` (tier 3), create the directory before writing if it does not exist.
- Scripts that hardcode output paths (e.g., `generate-sql600-report.js`) should check for `$OBSIDIAN_VAULT_PATH` and prefer `$OBSIDIAN_VAULT_PATH/LCG-Artifacts/` when set, falling back to `.copilot/docs/`.
