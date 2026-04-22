#!/usr/bin/env node

/**
 * bootstrap-vault.js
 *
 * Copies vault starter files (vault-starter/_lcg/) into the configured
 * OBSIDIAN_VAULT_PATH without overwriting existing user-owned files.
 *
 * Also ensures required vault subdirectories (Daily, Meetings, Weekly,
 * _lcg/templates) exist and sanity-checks the config folder for
 * unauthorised (non-.md/.html) files.
 *
 * Usage:
 *   node scripts/bootstrap-vault.js
 */

import {
  existsSync,
  mkdirSync,
  copyFileSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  statSync,
} from "node:fs";
import { resolve, join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDotenv } from "./lib/config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const STARTER_DIR = join(ROOT, "vault-starter");
const CONFIG_SUBDIR = "_lcg";

if (!existsSync(STARTER_DIR)) {
  console.log(`[vault:init] ERROR: Starter directory not found: ${STARTER_DIR}`);
  process.exit(1);
}

loadDotenv();

let vaultDir = process.env.OBSIDIAN_VAULT_PATH || "";
if (!vaultDir) {
  vaultDir = join(ROOT, ".vault");
  console.log(`[vault:init] No OBSIDIAN_VAULT_PATH set — using local vault: ${vaultDir}`);
}

if (!existsSync(vaultDir)) {
  console.log(`[vault:init] Creating vault directory: ${vaultDir}`);
  mkdirSync(vaultDir, { recursive: true });
}

// Ensure required subdirectories exist
for (const sub of [
  join(vaultDir, CONFIG_SUBDIR, "templates"),
  join(vaultDir, "Daily"),
  join(vaultDir, "Meetings"),
  join(vaultDir, "Weekly"),
]) {
  mkdirSync(sub, { recursive: true });
}

function copyIfMissing(src, dst) {
  if (!existsSync(src)) return;
  if (existsSync(dst)) {
    console.log(`[vault:init] skip (exists): ${dst}`);
  } else {
    copyFileSync(src, dst);
    console.log(`[vault:init] created: ${dst}`);
  }
}

// Copy every file from vault-starter/<CONFIG_SUBDIR>/ into vaultDir/<CONFIG_SUBDIR>/
function copyStarterTree(subdir) {
  const srcDir = join(STARTER_DIR, subdir);
  const dstDir = join(vaultDir, subdir);
  if (!existsSync(srcDir)) return;
  for (const name of readdirSync(srcDir)) {
    const srcPath = join(srcDir, name);
    const dstPath = join(dstDir, name);
    const s = statSync(srcPath);
    if (s.isDirectory()) {
      mkdirSync(dstPath, { recursive: true });
      copyStarterTree(join(subdir, name));
    } else if (s.isFile()) {
      copyIfMissing(srcPath, dstPath);
    }
  }
}

copyStarterTree(CONFIG_SUBDIR);

// ── Set lcg_repo in preferences.md frontmatter ─────────────────────
// The automation dashboard reads this to invoke repo scripts directly.
const prefsPath = join(vaultDir, CONFIG_SUBDIR, "preferences.md");
if (existsSync(prefsPath)) {
  const prefsContent = readFileSync(prefsPath, "utf-8");
  const repoPathValue = ROOT.replace(/\\/g, "/");
  if (prefsContent.includes('lcg_repo: ""') || prefsContent.includes("lcg_repo: ''")) {
    const updated = prefsContent.replace(/lcg_repo:\s*["']{2}/, `lcg_repo: "${repoPathValue}"`);
    writeFileSync(prefsPath, updated, "utf-8");
    console.log(`[vault:init] set lcg_repo → ${repoPathValue}`);
  } else if (!prefsContent.includes("lcg_repo:")) {
    // Frontmatter exists but lcg_repo property is missing — inject it
    const updated = prefsContent.replace(/^---\n/, `---\nlcg_repo: "${repoPathValue}"\n`);
    writeFileSync(prefsPath, updated, "utf-8");
    console.log(`[vault:init] added lcg_repo → ${repoPathValue}`);
  } else {
    console.log(`[vault:init] lcg_repo already set in preferences.md`);
  }
}

// Integrity check — only .md and .html files belong in the config subdir
let unauthorized = 0;
const configDir = join(vaultDir, CONFIG_SUBDIR);
function walk(dir, depth) {
  if (depth > 2 || !existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, depth + 1);
    } else if (entry.isFile()) {
      const ext = extname(entry.name).slice(1).toLowerCase();
      if (ext !== "md" && ext !== "html") {
        console.log(`[vault:init] ⚠ UNAUTHORIZED file in ${CONFIG_SUBDIR}/: ${entry.name}`);
        unauthorized++;
      }
    }
  }
}
walk(configDir, 0);

if (unauthorized > 0) {
  console.log(`[vault:init] ⚠ Found ${unauthorized} unauthorized file(s) in ${CONFIG_SUBDIR}/.`);
  console.log(`[vault:init]   ${CONFIG_SUBDIR}/ should only contain .md and .html config files.`);
  console.log(`[vault:init]   Run 'npm run vault:hygiene' to quarantine them.`);
}

console.log("[vault:init] Done.");
