# Install Experience Improvements — 2026-04-26

Polish the Windows install path for executive-level users so it feels like a real installer (not a developer script). Three workstreams landed in one session: noisy-output cleanup, messaging polish, and an interactive wizard with silent Azure sign-in.

## Goals

- Replace developer-grade console output with installer-grade UX.
- Eliminate prompts and jargon execs don't need to see (`npm run auth:packages`, "CLI installed but not signed in", winget progress dumps).
- Auto-detect what we can (Obsidian, vault paths, Azure identity); only ask when we genuinely don't know.
- Lock the audience: Windows + Entra-joined + `@microsoft.com` user. No fallback branches for personal devices.

## Audience constraint (locked)

The PS1 installer always runs on:

- Windows
- Entra-joined corporate device
- User signed into Windows as `alias@microsoft.com`

This unlocks silent Azure sign-in via WAM broker with no UPN detection or fallback logic.

---

## Workstream 1 — Quiet the winget progress noise

### Problem

`winget install` streams a garbled multi-line progress block (`ÆÆÆÆÆ...  1024 KB / 30.9 MB`) directly to the console because both `bootstrap.ps1` (`Out-Host`) and `bootstrap.js` (`stdio: "inherit"`) were piping winget's raw output through.

### Fix

- **scripts/bootstrap.ps1** — `Invoke-WingetInstall` now captures winget output (`2>&1` into a variable) instead of streaming it. On non-zero exit, surface only the last meaningful line as a single `[WARN]`.
- **scripts/bootstrap.js** — added `runCapture()` and `summarizeCommandOutput()` helpers; `installWithWingetOrChoco()` uses captured output and emits a one-line warning with the trailing winget message on failure.

### Result

Successful installs print zero progress noise. Failures still get a concise diagnostic.

---

## Workstream 2 — Messaging polish

### Problem

Two scary-looking lines fired during the prereq check even on successful installs:

```
[WARN] GitHub CLI installed but not signed in.
[WARN]   Run: npm run auth:packages
```

The next step *automatically* runs the GitHub Packages auth flow, so the warning is misleading and `npm run auth:packages` is implementation jargon execs don't need.

### Fix

- **scripts/init.js** — replaced the two `warn()` lines (and the parallel "signed in but no read:packages" branch) with a neutral `info()`:
  > "GitHub sign-in pending — you'll be prompted in the next step."
- Removed the redundant `"Private GitHub Packages can be bootstrapped with: npm run auth:packages"` line from the normal install path.
- Recovery hint preserved in two places where it actually belongs: the `--check` dry-run and the auth-failure recovery branch.

---

## Workstream 3 — Interactive install wizard + silent Azure sign-in

### Goal

Make `bootstrap.ps1` feel like a real installer the first time an executive runs it: a banner, smart defaults, no redundant prompts, silent Azure sign-in.

### Design decisions

| Decision | Choice | Rationale |
|---|---|---|
| Where the wizard lives | PowerShell, not Node | Windows-only detection (registry, `obsidian.json`) is cleaner in PS, and the PS1 banner is the executive's first impression. |
| Styling | Option B — boxed banner with `Clear-Host` + framed sections | Looks like an installer without breaking pasted-script paste-and-run flow. Option C (full-screen alternate buffer) is overkill and fragile in Windows Terminal. |
| Default vault when multiple detected | Most-recently-used (parsed from `obsidian.json`) | Matches user intent; falls back to local `.vault/` if no MRU data. |
| Azure auth | Silent WAM broker, single tenant, no branching | Audience constraint guarantees it works. |
| Out-of-scope | MSI packaging, code signing, .NET WPF GUI | Separate projects. |

### Steps

1. **Wizard entry & framing in `bootstrap.ps1`**
   - Add `-Silent` switch to bypass the wizard (CI / re-runs).
   - `Test-Interactive` auto-skips when stdin is redirected, `-Check`, or `-SkipInstall` is used.
   - Print a clean welcome banner: product name, what's about to happen (4 short bullets), estimated time, single `Press Enter to begin` gate.

2. **Auto-detect Obsidian Desktop**
   - `Find-ObsidianInstall` probes: `%LOCALAPPDATA%\Programs\Obsidian\Obsidian.exe`, `%LOCALAPPDATA%\Obsidian\Obsidian.exe`, `Program Files\Obsidian\Obsidian.exe`, `Program Files (x86)\Obsidian\Obsidian.exe`.
   - If found → "Detected Obsidian at `<path>`" and skip install.
   - If missing → `Install Obsidian Desktop now? [Y/n]` (default Y).

3. **Auto-detect existing vaults**
   - `Get-KnownObsidianVaults` reads `%APPDATA%\obsidian\obsidian.json`, parses the `vaults` map, returns vault paths sorted by `ts` (most-recently-used first).
   - Numbered menu:
     - `1) <Vault A>  ->  C:\Users\...\VaultA`
     - `2) <Vault B>  ->  C:\Users\...\VaultB`
     - `N+1) Create a new vault inside the L.C.G folder  [recommended]`
     - `N+2) Enter a custom path`
   - Default = MRU vault if present, else local `.vault/`.

4. **Silent Azure sign-in (`Invoke-SilentAzLogin`)**
   - Enable WAM broker: `az config set core.enable_broker_on_windows=true`, `az config set core.login_experience_v2=off`.
   - Skip if `az account show` already returns a token.
   - Otherwise: `az login --tenant 72f988bf-86f1-41af-91ab-2d7cd011db47 --allow-no-subscriptions --output none`.
   - Tries once **before** Node handoff (covers re-runs where az is already installed) and once **after** (covers fresh installs where Node bootstrap just installed az).
   - Only possible interrupts: first-ever-tenant consent dialog or CA-mandated Windows Hello tap — both are unavoidable security controls; Windows handles them.

5. **Final summary screen**
   - 4-line review of choices (Vault, Vault mode, Obsidian, Azure sign-in) + `Proceed? [Y/n]`. Allow back-out with no side effects.

6. **Handoff via env vars (no duplicate prompts)**
   - `LCG_VAULT_PATH=<chosen path>` — consumed by `configureEnv()` short-circuit in `init.js`.
   - `LCG_VAULT_MODE=<local|new|existing|custom>` — passed through for sync-decision logic.
   - `LCG_SKIP_OBSIDIAN_INSTALL=1` — consumed by `ensureObsidianDesktop()`.
   - `LCG_AZ_AUTH_DONE=1` — suppresses the existing Y/n az login prompt in the prereq check.

7. **Minimal `init.js` plumbing**
   - `configureEnv()` (~line 792): if `process.env.LCG_VAULT_PATH` is set, write straight to `.env`, seed from `vault-starter/` if needed, return without prompting.
   - `ensureObsidianDesktop()` (~line 252): honor `LCG_SKIP_OBSIDIAN_INSTALL=1`.
   - Azure-CLI section: when `LCG_AZ_AUTH_DONE=1` and Node-side `az account show` doesn't see a token, print a neutral note instead of re-prompting.
   - No other Node logic changes.

8. **Final hardening pass (post-review)**
   - If `.env` already contains `OBSIDIAN_VAULT_PATH`, wizard now asks whether to keep that configured vault path before showing vault picker options.
   - `.env` writes now use replace-or-add behavior for `OBSIDIAN_VAULT_PATH` (no duplicate keys; newline-safe write).
   - Post-handoff silent Azure sign-in now runs only when Node handoff exits successfully.
   - `install.ps1` now prints a bootstrap preflight line (`ref` + short SHA256 of downloaded `scripts/bootstrap.ps1`) before execution, making branch/snapshot mismatches visible during remote install tests.
   - UAC guidance is now consistently shown across Windows install entry points (`install.ps1`, `bootstrap.ps1`, `bootstrap.js`, `init.js`) before package installs that may trigger elevation.
    - Long-running package installs now show active progress feedback instead of appearing stalled:
       - `bootstrap.ps1` Node install path shows a live PowerShell progress bar with elapsed time during `winget`/`choco` execution.
       - `bootstrap.js` Windows package installs (including Git and Azure CLI) show an indeterminate spinner with elapsed time.
    - `bootstrap.js` now prints an end-of-run installation summary table (component, result, duration, notes) so users can see what was already present, what got installed, and how long each step took.
   - Final output order now shows **Installation summary first**, then the post-install success panel (`'lcg' CLI installed successfully`) and sign-in/next-step guidance.
   - Wizard banner now includes an upfront estimated install-time table per component plus a full-stack expected range when everything is installed fresh.

---

## Files changed

### Core session changes

| File | Change |
|---|---|
| `scripts/bootstrap.ps1` | Added `-Silent` switch, `Test-Interactive`, `Show-Banner`, `Find-ObsidianInstall`, `Get-KnownObsidianVaults`, `Read-Choice`, `Read-YesNo`, `Invoke-SilentAzLogin`, `Invoke-Wizard`. Wizard call site before `--- Ensuring Node.js ---`. Silent az login attempt before and after Node handoff. Quieted `Invoke-WingetInstall` output. |
| `scripts/bootstrap.js` | Added `runCapture()` + `summarizeCommandOutput()`. Quieted `installWithWingetOrChoco()` output. |
| `scripts/init.js` | Wizard handoff short-circuit in `configureEnv()`. Honors `LCG_SKIP_OBSIDIAN_INSTALL` in `ensureObsidianDesktop()`. Honors `LCG_AZ_AUTH_DONE` in Azure-CLI prereq branch. Replaced "GitHub CLI installed but not signed in" warnings with neutral "sign-in pending" info line. Removed redundant `npm run auth:packages` line from normal install path. |

### Follow-up hardening changes discussed and implemented

| File | Change |
|---|---|
| `scripts/bootstrap.ps1` | Added `Get-ConfiguredVaultPath` and wizard prompt to keep/reuse existing `.env` vault path. Gated post-handoff `Invoke-SilentAzLogin` retry to `nodeExit == 0` only. |
| `scripts/init.js` | Added `.env` `upsertEnvVar` helper and switched vault path persistence to replace-or-add semantics (prevents duplicate `OBSIDIAN_VAULT_PATH` entries and malformed newline joins). |
| `scripts/install.ps1` | Added bootstrap preflight validation and fingerprint output (`Ref` + short SHA256) before invoking `scripts/bootstrap.ps1`. |
| `scripts/bootstrap.js` | Added one-time professional UAC guidance before Windows package install attempts. |
| `scripts/bootstrap.ps1` | Added live PowerShell progress bar + elapsed time for long-running Node package installs (`winget`/`choco`) so users can see active progress. |
| `scripts/bootstrap.js` | Added final installation summary table with per-component status and elapsed time. |

---

## Verification

- PowerShell parse check on `bootstrap.ps1`: clean.
- `node --check scripts/bootstrap.js`: clean.
- `node --check scripts/init.js`: clean.
- `pwsh -Silent -Check` smoke test: wizard cleanly bypassed, current behavior preserved, prereq check completes.
- Re-run after hardening updates: `pwsh -NoProfile -Command "& { . './scripts/bootstrap.ps1' -Silent -Check }"` and `node --check scripts/init.js` both clean.

### Manual verification scenarios (run on real Windows box)

1. **Fresh machine, no Obsidian** → wizard offers install, suggests local vault, silent az sign-in succeeds.
2. **Obsidian installed + vaults registered** → wizard lists them MRU-first, user picks one.
3. **`-Silent` flag** → no wizard, current behavior.
4. **Piped/non-interactive input** → no wizard (auto-fallback).
5. Confirm `.env` contains correct `OBSIDIAN_VAULT_PATH` after each run.

---

## Out of scope (explicitly excluded)

- **MSI packaging.** Real installer if/when this graduates beyond pasted PowerShell.
- **Code signing.** Required for SmartScreen-friendly distribution; separate project.
- **.NET 8 WPF GUI.** Considered and rejected for this pass — STA/MTA issues with `irm | iex`-launched PowerShell, SmartScreen friction, audience reality (execs don't install software themselves; the bar is "credible + finishes + EA can repeat it"), and 2x maintenance cost for prompts.
- **GitHub sign-in changes.** Stays in the Node-side flow (browser handoff and account picking are well-tested there).
- **macOS/Linux wizard.** PS1 wizard is Windows-only by design; Node-side prompts unchanged on other platforms.

---

## Future considerations

1. If/when audience expands beyond `@microsoft.com`, add UPN detection in `Invoke-SilentAzLogin` and a fallback to interactive `az login` for non-Microsoft tenants.
2. Detect VS Code Insiders alongside stable VS Code in the install probe.
3. Consider a `-Reconfigure` switch that re-runs only the wizard (vault repick, Obsidian recheck) without re-running the full Node bootstrap.
4. If the wizard's `Clear-Host` proves disruptive in some terminals (older conhost), fall back to a printed separator line instead.
