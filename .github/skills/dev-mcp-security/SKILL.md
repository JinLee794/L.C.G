---
name: dev-mcp-security
description: "MCP server security guardrails: validates proposed MCP config changes, warns about risky server additions, checks package provenance, and blocks unsafe patterns before they reach .vscode/mcp.json. Fires proactively when the user discusses adding, changing, or troubleshooting MCP servers. Triggers: add MCP server, new MCP server, install MCP, configure MCP, mcp.json, change MCP config, connect MCP, third-party MCP, community MCP, MCP URL, MCP endpoint, npx MCP, stdio server, http server, MCP security, is this MCP safe, MCP risk, MCP permissions, MCP trust, untrusted server, unknown MCP package. DO NOT USE FOR: starting approved MCP servers already in mcp.json (those are safe), general Copilot usage questions, vault or CRM operations."
---

# MCP Security Guidance

## Purpose

Intercept risky MCP server operations before they happen. When a user asks about adding, changing, or debugging MCP servers, this skill fires to assess risk and provide security-conscious guidance — **before** any config change is made.

L.C.G. connects to MCP servers that hold the keys to corporate data: email, calendar, CRM, Teams, SharePoint, and the local vault. A single misconfigured or malicious server can exfiltrate everything. Non-technical users are the primary audience — guidance must be clear, concrete, and cautious.

## When This Fires

- User asks to add a new MCP server to `.vscode/mcp.json`.
- User pastes an MCP server URL, package name, or config snippet.
- User asks "is this MCP server safe?" or similar trust questions.
- User is troubleshooting an MCP server and considers changing config.
- User mentions a community/third-party MCP package.
- User wants to connect to a new HTTP endpoint.

## Risk Assessment Framework

When the user proposes any MCP server change, evaluate it against these criteria **before proceeding**:

### Step 1: Identify the Server Type

| Type | Example | Base Risk |
|------|---------|-----------|
| **Approved (ships in repo)** | `@microsoft/msx-mcp-server`, `agent365.svc.cloud.microsoft/*` | ✅ Low — already vetted |
| **First-party Microsoft** | `@microsoft/*` on npm or GitHub Packages | 🟡 Medium — likely safe but verify scope |
| **Internal team package** | `@jinlee794/*`, `@your-org/*` on GitHub Packages | 🟡 Medium — check source, verify publisher |
| **Community/open-source** | Any unscoped npm package, random GitHub repo | 🔴 High — assume hostile until proven otherwise |
| **Unknown HTTP endpoint** | Any URL not matching `*.cloud.microsoft` or `*.fabric.microsoft.com` | 🔴 Critical — could be anything |

### Step 2: Check Against the Approved List

Read `.vscode/mcp.json` and compare the proposed server against the existing approved set. If the server is already present, it's safe to start — no further review needed.

**Approved server patterns** (as of repo baseline):
- `@microsoft/msx-mcp-server@latest` (stdio/npx)
- `@jinlee794/obsidian-intelligence-layer@latest` (stdio/npx)
- `@microsoft/workiq@latest` (stdio/npx)
- `https://api.fabric.microsoft.com/v1/mcp/powerbi` (HTTP)
- `https://agent365.svc.cloud.microsoft/agents/tenants/*/servers/mcp_*` (HTTP)

### Step 3: Apply Risk Rules

For any server **not** in the approved list:

#### 🔴 BLOCK — Do Not Proceed
- Unknown npm packages (no `@microsoft/` or recognized internal scope).
- HTTP URLs not matching `*.cloud.microsoft` or `*.fabric.microsoft.com`.
- Any server that requires you to set API keys, tokens, or secrets in the `env` block of `mcp.json`.
- Servers from personal GitHub repos, blog posts, Discord links, or social media.
- Any config snippet someone "sent you" without context.

**Response template for BLOCK:**
```
⛔ I cannot help add this MCP server — it does not match any approved pattern.

MCP servers run with YOUR credentials and can access your email, calendar, CRM, 
and Teams. Adding an untrusted server is equivalent to giving a stranger your 
laptop password.

What this server could do if malicious:
- Read your entire inbox and CRM pipeline silently
- Send emails or Teams messages as you
- Inject hidden instructions that manipulate my behavior
- Cache your credentials beyond this session

Next steps:
1. Share the server details in the v-team channel for security review.
2. If approved, a team member will add it to .vscode/mcp.json via PR.
3. Never add MCP servers directly — all changes should go through code review.
```

#### 🟡 CAUTION — Proceed With Guidance
- First-party `@microsoft/*` packages not yet in the approved list.
- Internal team packages from recognized scopes.
- HTTP endpoints on `*.microsoft.com` domains not yet approved.

**Response template for CAUTION:**
```
⚠️ This appears to be a Microsoft-published server, but it's not in the current 
approved list (.vscode/mcp.json).

Before adding it:
1. Verify the package on https://npm.pkg.github.com or npmjs.com — check the publisher.
2. Review what tools/methods the server exposes — does it need more access than expected?
3. Add it via a PR to .vscode/mcp.json so the change is reviewed and tracked.
4. Never add secrets directly in mcp.json — use .env files (which are gitignored).

I can help you draft the mcp.json entry for PR review. Want me to proceed?
```

#### ✅ SAFE — Approved Server
- Server is already in `.vscode/mcp.json`.
- User is starting, restarting, or troubleshooting an approved server.

**Response:** Proceed normally. No warning needed.

### Step 4: Check for Dangerous Patterns

Even for approved servers, flag these anti-patterns:

| Pattern | Risk | Guidance |
|---------|------|----------|
| Secrets in `env` block of `mcp.json` | Secrets committed to source control | Move to `.env` file, use `envFile` property |
| `npx` with unversioned package | Supply-chain attack via package hijack | Always pin `@latest` or a specific version |
| HTTP URL without TLS (`http://`) | Credentials sent in plaintext | Must use `https://` |
| Wildcard or overly broad `args` | Unexpected command execution | Review each argument |
| `command: "node"` with a local script path | Script could be modified | Verify script integrity, prefer published packages |
| Removing existing servers | Breaks agent tool boundaries | Explain which agents/skills depend on the server |

## Common Scenarios

### "I found a cool MCP server on GitHub"

**Response:** Block. Explain that community servers have not been vetted and could exfiltrate corporate data. Direct to v-team channel for review.

### "Can I add the Slack MCP server?"

**Response:** Block. Even if the package is legitimate, it would grant the agent access to a new communication surface. This requires architectural review — it changes the trust boundary.

### "My MCP server isn't starting, can I change the config?"

**Response:** Safe to troubleshoot approved servers. Help with env vars, authentication, Node version issues. Do NOT suggest replacing an approved server with an alternative.

### "Can I point the calendar/mail server to a different tenant?"

**Response:** Caution. Changing tenant IDs in HTTP URLs changes whose data the agent accesses. Verify the user understands the implications and has authorization for the target tenant.

### "Someone on my team shared their mcp.json"

**Response:** Caution. Config from teammates may include servers or settings not in the approved baseline. Diff against the repo's `.vscode/mcp.json` and flag any deviations.

### "I want to build my own MCP server"

**Response:** Acknowledge this is a valid development activity, but:
1. Custom servers should NOT be wired into L.C.G. without v-team review.
2. Development/testing should use a separate VS Code workspace, not the L.C.G. repo.
3. When ready, submit a PR adding the server to `.vscode/mcp.json` with documentation.

## Trust Model Reference

This skill enforces the trust model in [_specs/06-trust-model.md](../../../_specs/06-trust-model.md):

- **MCP tool-server enforcement > instruction-level constraints** — If an action should be impossible, don't expose it in the server.
- **Delegation-as-isolation** — Agents only hold the MCP namespaces they need.
- **Read freely, gate outbound writes** — Broad read access, but external writes require confirmation.
- **Execute is for orchestration, not escape** — Shell access doesn't grant OAuth tokens; those live in MCP servers.

## Rules

1. **Always fire this skill** when the user discusses adding, changing, or connecting MCP servers — even if they didn't ask for security advice.
2. **Never help add an unapproved server** without first running the risk assessment above.
3. **Never suggest disabling security checks** (e.g., `--no-verify`, skipping auth, ignoring TLS errors).
4. **Default to blocking** when uncertain. A false positive (unnecessary warning) is infinitely better than a false negative (missed threat).
5. **Keep language non-technical** — the primary audience is GMs and business users, not engineers.
6. **Link to the README security section** when providing guidance: [README.md#️-mcp-security--read-this-before-changing-servers](../../../README.md#️-mcp-security--read-this-before-changing-servers).
