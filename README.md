<p align="center">
  <img src="image/README/avatar.png" alt="L.C.G. — Let Copilot Go" width="200">
</p>

# L.C.G.

### Let Copilot Go!

*Stop doing the low value cognitive work yourself. Let Copilot do it.*

<br/>

[![Node.js](https://img.shields.io/badge/Node.js-≥18-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Copilot](https://img.shields.io/badge/GitHub_Copilot-VS_Code-000?logo=github&logoColor=white)](https://github.com/features/copilot)
[![License](https://img.shields.io/badge/License-Private-red)](#)


---

## Quick Start (5 Minutes)
Before you begin, make sure you have:

- [ ] **Microsoft corporate VPN** connected
- [ ] **Microsoft corp account** (e.g., `your-alias@microsoft.com`) for Azure CLI sign-in
- [ ] **Personal GitHub account** (NOT your `_microsoft` EMU account) for GitHub Packages auth
- [ ] **GitHub Copilot License** — [Get one here (Microsoft Internal)](https://aka.ms/copilot)

---

### Step 0: Run The Installer

The one-liner below downloads the repo, verifies prerequisites, installs missing tools (Node.js, Azure CLI, GitHub CLI, VS Code, Obsidian, Copilot CLI), and walks you through Azure + GitHub sign-in. The whole flow takes about 5 minutes.

Installer behavior at a glance:

- **Default install directory:** `~/L.C.G` (your home folder). Press Enter at the prompt to accept, or type any path.
- **Cloud-synced paths are blocked:** OneDrive, Dropbox, Google Drive, and iCloud locations are rejected so local secrets never sync to the cloud.
- **Existing folder:** an empty folder is reused; a non-empty folder requires `-Force` and will be replaced.
- **Execution policy:** set to `Bypass` for the installer process only (no machine-wide change).

#### macOS / Linux

1. Open **Terminal** (Spotlight → search "Terminal").
2. Paste this and press **Enter**:

```bash
curl -fsSL https://raw.githubusercontent.com/JinLee794/L.C.G/main/scripts/install.sh | bash
```

#### Windows

1. Open **Windows PowerShell** — Start → type "PowerShell" → click **Windows PowerShell** (not Command Prompt, not PowerShell ISE).

   ![Open Windows PowerShell from Start](image/README/install-01-powershell.jpg)

2. Paste this one-liner and press **Enter**:

   ```powershell
   Set-ExecutionPolicy -Scope Process Bypass -Force; irm "https://raw.githubusercontent.com/JinLee794/L.C.G/main/scripts/install.ps1?nocache=$(Get-Date -UFormat %s)" | iex
   ```

---

### What you'll be asked during the install

The installer is interactive — it will stop and ask you a few things. Here's exactly what to do at each prompt.

#### 1. Install directory

Accept the default (`C:\Users\<you>\L.C.G` on Windows, `~/L.C.G` on macOS/Linux) by pressing **Enter**, or type a different path. Anything inside OneDrive, Dropbox, Google Drive, or iCloud is rejected by design.

![Install directory prompt — press Enter for default](image/README/install-03-install-dir.jpg)

#### 2. Risk acknowledgement

Before any MCP servers are configured, the installer shows a security notice. Read it, then type **`yes`** and press **Enter** to continue. Typing anything else cancels the install.

![Risk acknowledgement — type yes](image/README/install-04-risk-ack.jpg)

#### 3. Azure sign-in (`az login`)

When prompted **`Run 'az login' now? [Y/n]:`**, press **Enter** (or type `Y`). A browser window pops up — **pick your Microsoft work account** (e.g. `alias@microsoft.com`) and click **Continue**.

![az login — choose your Microsoft work account](image/README/install-05-az-login.jpg)

If your tenant shows a subscription picker in the terminal, press **Enter** to accept the default.

#### 4. GitHub Packages auth — **use your personal GitHub account**

This is the single most important step. Private MCP packages (`@microsoft/msx-mcp-server`, `@jinlee794/obsidian-intelligence-layer`) are hosted on GitHub Packages, which requires a GitHub sign-in with `read:packages`.

> [!IMPORTANT]
> Sign in with your **personal GitHub account** (e.g. `JohnDoe`). **Do NOT** use your Enterprise Managed User account ending in `_microsoft`.

- At the **preferred protocol** prompt, select **HTTPS** (default).
- At **Authenticate Git with your GitHub credentials?**, press **Enter** for `Yes`.

![GitHub Packages auth — personal account required](image/README/install-06-gh-personal-warning.jpg)

The installer prints a one-time code (e.g. `F7A5-ADE0`) and then opens `https://github.com/login/device` in your browser. Copy the code, switch to the browser, and paste it.

![Copy the one-time device code](image/README/install-07-gh-device-code.jpg)

Sign in on github.com with your **personal** account — if your browser auto-fills the `_microsoft` EMU account, click **Use a different account** first.

![Sign in with personal GitHub account](image/README/install-08-gh-signin.jpg)

Finally, click **Authorize github** to grant the device the `read:packages` scope.

![Authorize the device](image/README/install-09-gh-authorize.jpg)

#### 5. Obsidian Desktop — install it?

L.C.G. uses an [Obsidian](https://obsidian.md) vault as its local "second brain" (plain Markdown files for customer notes, meeting history, drafts, and learning log). The Obsidian Desktop app is the recommended UI for browsing it, but it's optional — everything is Markdown and any editor works.

At the prompt **`Install Obsidian Desktop now? [Y/n]:`** press **Enter** to accept (default Yes) or type `n` to skip. On Windows it installs via `winget`; on macOS via Homebrew.

#### 6. Vault location — where should L.C.G. store your vault?

The installer will ask where your vault should live and offers three options:

1. **Inside the L.C.G. folder** *(recommended, default)* — creates `.vault/` inside your install directory. Easiest to find, nothing else to configure. Press **Enter** to accept.
2. **Create a new vault at a custom location** — type any path when prompted. The installer creates the folder and seeds it with starter templates.
3. **Use an existing Obsidian vault** — type the full path to a vault you already have (e.g. `C:\Users\you\Documents\ObsidianVault` or `/Users/you/Documents/Obsidian/My Vault`). Starter templates are seeded without overwriting your existing notes.

Whichever option you pick, the path is saved to `.env` as `OBSIDIAN_VAULT_PATH`. You can change it later — see [Switch to a different Obsidian vault](#switch-to-a-different-obsidian-vault) at the bottom of this section.

Return to the terminal. The installer scaffolds your vault, links the global `lcg` command, and prints `✔ Bootstrap complete.`

---

### Step 1: Start Using L.C.G.

When the installer finishes, everything is ready to go. Pick either path:

**VS Code (recommended):**

Open VS Code in your install folder (`code ~/L.C.G` or just double-click the folder in VS Code) → open **Copilot Chat** (`⌃⌘I` on macOS / `Ctrl+Alt+I` on Windows) → select the **Chief of Staff** agent → start typing.

**Terminal:**

Open any terminal, anywhere, and type `lcg`. A new `copilot` session launches with all L.C.G. servers, agents, and skills loaded.

> Both interfaces are fully equivalent — same agents, skills, and MCP servers. See [Two Ways to Use L.C.G.](#two-ways-to-use-lcg) for details.

---

### Step 2: Personalize It (Optional, 5 Minutes)

Defaults are fine for day one. When you want L.C.G. to match *your* role, VIPs, and cadence, run the onboarding wizard.

In VS Code → **Copilot Chat** → **Chief of Staff** agent → type:

```
/onboarding
```

The wizard asks about your:

1. **Role** — GM, CSAM, Specialist, or M1 Manager
2. **Industry** — Segment you cover (scopes CRM + Power BI queries)
3. **Team** — By territory, seller list, org hierarchy, or just you
4. **Forecast targets** — Optional quota and coverage multiple
5. **VIP list** — High-priority senders
6. **Operating rhythm** — Default weekly cadences

Answers are saved in your vault under `_lcg/` as plain markdown. Re-run `/onboarding` anytime, or edit the files directly.

---

<details>
<summary><strong>What the installer actually did (click to expand)</strong></summary>

The installer and bootstrap are designed to finish with minimal questions. For the curious, here's everything that happened:

1. **Downloaded** the repo to your install directory (default: `~/L.C.G`).
2. **Verified prerequisites** — Node.js 18+, npm, git.
3. **Installed missing tools automatically** (Windows via `winget` / Chocolatey; macOS via Homebrew):
   - **Azure CLI** (`az`) — for corp auth against CRM and M365.
   - **GitHub Copilot CLI** — the official `@github/copilot` npm package, which provides the `copilot` binary used by `lcg`. A `gh copilot` extension is configured as a fallback.
   - **Obsidian Desktop** — installed only if you answered **Yes** at the prompt.
4. **Prompted for `az login`** — sign in as `alias@microsoft.com`.
5. **Ran `npm install`** for repo dependencies.
6. **Walked through GitHub Packages auth** — uses your personal GitHub account (not your `_microsoft` EMU account).
7. **Created (or pointed at) your vault** based on your choice at the vault-location prompt, and seeded it with starter templates under `_lcg/` (never overwriting existing files).
8. **Registered the global `lcg` command** using a `.cmd` shim on Windows so it works in restricted-policy PowerShell.

> [!IMPORTANT]
> When prompted for GitHub auth, use your **personal GitHub account** (e.g., `JohnDoe`), not your Enterprise Managed User account ending in `_microsoft`.

> [!TIP]
> Run `./scripts/bootstrap.sh --check` (macOS/Linux) or `./scripts/bootstrap.ps1 -Check` (Windows) for a dry prerequisite check at any time.

</details>

<details id="switch-to-a-different-obsidian-vault">
<summary><strong>Switch to a different Obsidian vault (click to expand)</strong></summary>

You already picked a vault location during install. If you want to change your mind — point L.C.G. at a different existing vault, or create a new one elsewhere:

**a. Create or choose a vault.** If you don't have one yet, download [Obsidian](https://obsidian.md) → **Create new vault** → pick a name and location you'll remember. Otherwise note the full path to your existing vault (e.g. `/Users/you/Documents/Obsidian/My Vault`).

**b. Point `.env` at it.** Open `.env` in your install folder and update:

```dotenv
OBSIDIAN_VAULT_PATH="/Path/To/Your/Obsidian/Vault"
```

**c. Seed the L.C.G. structure** (safe — never overwrites existing files):

```bash
npm run vault:init
```

This adds the following under your vault, without touching any of your existing notes:

| Added | Purpose |
|---------|---------|
| `_lcg/preferences.md` | Triage labels, display preferences |
| `_lcg/vip-list.md` | VIP senders that get priority in triage |
| `_lcg/operating-rhythm.md` | Weekly cadences (triage time, review days) |
| `_lcg/communication-style.md` | Tone guidance for drafted emails |
| `_lcg/learning-log.md` | Corrections L.C.G. remembers across sessions |
| `_lcg/templates/` | Meeting briefs, update requests, weekly summaries |
| `Daily/`, `Meetings/`, `Weekly/` | Working output folders |

> `.env` is git-ignored. Your paths and secrets stay local.

</details>

---

## Why L.C.G. Exists

You already know the pain:

- **Hundreds of emails** — and you're manually deciding what matters before your first coffee
- **Back-to-back meetings** — prep means hunting across 5+ tools you didn't build and don't love
- **Same deliverables, every week** — rebuilt from scratch instead of compounding
- **Institutional memory** — trapped in your head, not in a system
- **Follow-ups everywhere** — scattered across email, CRM, Teams, and sticky notes

No single tool today reads across your M365 + CRM stack, remembers *your* priorities, and still lets you own every final call. So you Go. Every. Single. Day.

L.C.G. turns GitHub Copilot into the tireless junior staffer you always wanted — one that **pre-reads, pre-researches, and pre-drafts everything** so you can focus on judgment, relationships, and the work that actually needs a human.

---

## What You Get — Day One

Just type a command in Copilot Chat. No menus, no screens, no training required.

### ☀️ Every Morning

| Say this…                | …and get this                                                  |
| ------------------------ | -------------------------------------------------------------- |
| `/morning-triage`      | Prioritized daily brief: what's urgent, what can wait, who's waiting on you |
| `/meeting-brief`       | One-page prep for your next meeting — context, attendees, open items, risks |
| `/meeting-followup`    | Action items and next steps written for you after a meeting ends |
| `/update-request`      | Polished follow-up emails to customers who owe you an answer   |

### 📆 Every Week

| Say this…                | …and get this                                       |
| ------------------------ | --------------------------------------------------- |
| `/weekly-rob`          | Your rhythm-of-business summary, ready to send      |
| `/winning-wednesdays`  | Win-Room highlights condensed to what matters       |
| `/win-wire-digest`     | Big-deal recaps compiled for your team              |
| `/stu-highlights`      | Channel highlights you'd otherwise miss             |

### 🎯 On Demand

| Say this…                | …and get this                                                         |
| ------------------------ | --------------------------------------------------------------------- |
| "Review this opportunity" | Full deal deep-dive with recent signals, risks, and recommended next steps |
| "Run pipeline hygiene"   | Stale deals, missing fields, close-date drift — ranked by severity   |
| "Prep me for my 1:1"     | Seller's pipeline, recent movement, coaching opportunities            |
| "Build a deck on…"        | PowerPoint draft pulled from your vault + CRM data                    |

> **34+ skills** are bundled in. You never need to memorize names — just describe the outcome you want.

---

## How It Works (in plain English)

L.C.G. runs on three simple layers. You only ever interact with the first one.

```mermaid
flowchart TB
  U["👤 YOU — type what you want in plain English"] --> L1

  subgraph L1["🧠 1. Instructions — how L.C.G. thinks"]
    direction LR
    I1["Your preferences"] --- I2["VIP list"] --- I3["Operating rhythm"] --- I4["Skills library"]
  end

  L1 --> L2

  subgraph L2["🔌 2. Live Data — what L.C.G. reads"]
    direction LR
    D1["📧 Outlook"] --- D2["📅 Calendar"] --- D3["💬 Teams"] --- D4["📊 CRM (MSX)"] --- D5["📈 Power BI"] --- D6["📁 SharePoint"]
  end

  L2 --> L3

  subgraph L3["💾 3. Second Brain — what L.C.G. remembers"]
    direction LR
    M1["Customer notes"] --- M2["Meeting history"] --- M3["Drafted emails"] --- M4["Learning log"]
  end

  style U fill:#0d1117,stroke:#58a6ff,stroke-width:2px,color:#e6edf3
  style L1 fill:#1a1a2e,stroke:#4cc9f0,color:#e0e0e0
  style L2 fill:#1b4332,stroke:#52b788,color:#e0e0e0
  style L3 fill:#3a0ca3,stroke:#c77dff,color:#e0e0e0
```

| Layer | What it means for you |
| --- | --- |
| **1. Instructions** | Your style, your VIPs, your priorities — written in plain markdown. Edit anytime. |
| **2. Live Data** | One request, many systems read at once. No more tab-hopping. |
| **3. Second Brain** | L.C.G. remembers your customers, deals, and corrections. **It gets smarter every week.** |

### Two Agents — One Brain, One Set of Hands

```mermaid
flowchart LR
  U["👤 YOU"] --> B

  subgraph B["🧠 Chief of Staff — the brain"]
    B1["Thinks, triages, drafts, recommends"]
  end

  B -- "delegates safely" --> H

  subgraph H["🤖 M365-Actions — the hands"]
    H1["Sends drafts, creates meetings, posts to Teams"]
  end

  style U fill:#0d1117,stroke:#58a6ff,color:#e6edf3
  style B fill:#1a1a2e,stroke:#4cc9f0,stroke-width:2px,color:#e0e0e0
  style H fill:#1a1a2e,stroke:#f72585,stroke-width:2px,color:#e0e0e0
```

The **brain** does all the thinking and never touches your inbox or Teams directly. The **hands** only act on scoped, approved instructions. If the brain wants to send a message, it hands off a draft — you approve before it leaves.

---

## You Stay in Control

Copilot Go's, but **nothing ships without you**.

| What L.C.G. does | What it won't do |
| --- | --- |
| ✅ **Drafts emails** in your voice | ❌ Never sends email without your review |
| ✅ **Prepares Teams messages** | ❌ Never posts without explicit approval |
| ✅ **Stages CRM updates** for review | ❌ Never writes to CRM silently |
| ✅ **Reads your vault** for context | ❌ Never syncs vault data to the cloud |
| ✅ **Logs every action** it takes | ❌ No surprise automation — ever |

> **Your data stays local.** Your vault lives on your machine. Your CRM credentials never leave your session. No external training. No "cloud memory." Just you and Copilot.

---

## What's Under the Hood

L.C.G. is built on four design principles that make it different from a chatbot:

| | Principle | Why it matters to you |
|---|---|---|
| 💬 | **Plain English config** | Change any behavior by editing a markdown file — no code, no IT ticket |
| 🏠 | **Local-first** | Your data never leaves your laptop |
| 🔀 | **Multi-signal** | One request cross-references email + calendar + CRM + your notes |
| 🔄 | **Self-correcting** | When you correct L.C.G., it remembers — and doesn't make the same mistake twice |

<details>
<summary><strong>Connected systems (for the curious)</strong></summary>

L.C.G. connects to your live enterprise data through a secure local bridge. One request reads from all of these at once:

| Category | Systems |
|---|---|
| 📧 **Communication** | Outlook Mail, Teams Chat, Teams Channels |
| 📅 **Scheduling** | Outlook Calendar, room booking |
| 📊 **CRM** | Microsoft Sales Experience (MSX) — opportunities, milestones, accounts |
| 📈 **Analytics** | Power BI — billed pipeline, consumption, SQL600, and more |
| 📁 **Files** | SharePoint, OneDrive, Word |
| 🗄️ **Memory** | Your local Obsidian vault |
| 🔍 **Search** | WorkIQ cross-M365 retrieval |

</details>

<details>
<summary><strong>Developer reference</strong></summary>

### Project structure
```
L.C.G/
├── .github/
│   ├── instructions/        ← behavior rules (triage, prep, CRM, comms)
│   ├── prompts/             ← workflow templates
│   ├── skills/              ← 34+ domain skills
│   └── agents/              ← agent definitions
├── scripts/                 ← automation helpers
├── vault-starter/           ← Obsidian vault templates
└── package.json
```

### MCP config
All live-data connections are declared in `.vscode/mcp.json`.

### npm scripts (optional, for headless runs)

| Command | Purpose |
| --- | --- |
| `npm run setup` | Verify prerequisites and configure local env |
| `npm run check` | Verify environment and workspace config |
| `npm run vault:init` | Bootstrap Obsidian vault from templates |
| `npm run morning:validate` | Validate morning brief output |
| `npm run meeting:validate` | Validate meeting brief |
| `npm run eval` | Run evaluation suite |

</details>

---

## Troubleshooting

### `npm ERR! 404 Not Found` or `401 Unauthorized` from `npm.pkg.github.com`

**What's happening:** Some MCP server packages (`@microsoft/msx-mcp-server`, `@jinlee794/obsidian-intelligence-layer`) are published to GitHub Packages, not the public npm registry. The project `.npmrc` already routes these scopes to the right place — but GitHub Packages requires a personal access token (PAT) for authentication, even for read-only access.

**Fix it in one step:**

```bash
npm login --registry=https://npm.pkg.github.com
```

When prompted:

- **Username:** your GitHub username
- **Password:** a personal access token (classic) with the `read:packages` scope
- **Email:** your GitHub email

That's it. The token is saved to your user-level `~/.npmrc` and applies everywhere.

<details>
<summary>Manual alternative (if <code>npm login</code> doesn't work)</summary>

1. Go to [github.com/settings/tokens](https://github.com/settings/tokens)
2. Click **Generate new token (classic)**
3. Select the **`read:packages`** scope
4. Copy the token
5. Open (or create) `~/.npmrc` and add this line:

```
//npm.pkg.github.com/:_authToken=ghp_YOUR_TOKEN_HERE
```

Replace `ghp_YOUR_TOKEN_HERE` with your actual token.

</details>

> **Why is this needed?** GitHub Packages doesn't support anonymous reads. The project-level `.npmrc` in this repo handles *which* packages go to GitHub vs. public npm — you just need to provide a token so GitHub lets you in.

### MCP server fails to start with `ERR_UNSUPPORTED_ESM_URL_SCHEME`

This usually means you're running a Node version older than 18. Check with `node --version` and upgrade if needed.

### `copilot CLI not found` when running automations

The task runner uses GitHub Copilot's CLI binary. It looks for it in:

1. `COPILOT_CLI_PATH` environment variable
2. `copilot` on your system PATH
3. VS Code's bundled location (`AppData/Code/User/globalStorage/github.copilot-chat/copilotCli/`)

Make sure GitHub Copilot Chat is installed in VS Code — it bundles the CLI automatically.

### Azure CLI token expired

CRM and M365 operations require an active Azure CLI session. If you see token errors:

```bash
az login
```

---

<div align="center">

*L.C.G. — Let Copilot Go — Private repository — Internal use only*

</div>
