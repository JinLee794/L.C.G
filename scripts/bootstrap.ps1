<#
.SYNOPSIS
  Cross-platform entry point for first-time setup on Windows.

.DESCRIPTION
  This is the ONLY PowerShell script in the project. Its single job is to
  ensure Node.js (>=18) is installed, then hand off to scripts/bootstrap.js
  which does the real work. All other automation lives in Node.js modules
  under scripts/.

.EXAMPLE
  .\scripts\bootstrap.ps1
  .\scripts\bootstrap.ps1 -Check
  .\scripts\bootstrap.ps1 -SkipInstall
#>

[CmdletBinding()]
param(
  [switch]$Check,
  [switch]$SkipInstall,
  [switch]$Silent,
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Rest
)

$ErrorActionPreference = "Stop"
$MinNodeMajor = 18
$MicrosoftTenantId = "72f988bf-86f1-41af-91ab-2d7cd011db47"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root      = Split-Path -Parent $ScriptDir

function Say-Ok   ($m) { Write-Host "  [OK] $m" -ForegroundColor Green }
function Say-Warn ($m) { Write-Host "  [WARN] $m" -ForegroundColor Yellow }
function Say-Fail ($m) { Write-Host "  [FAIL] $m" -ForegroundColor Red }
function Say-Info ($m) { Write-Host "  [INFO] $m" -ForegroundColor Cyan }

# ───────────── Wizard helpers ─────────────────────────────────────

function Test-Interactive {
  # Wizard is skipped if -Silent, if stdin is redirected (piped script),
  # or if running non-interactively (e.g. CI).
  if ($Silent) { return $false }
  if ($Check -or $SkipInstall) { return $false }
  try {
    if (-not [Environment]::UserInteractive) { return $false }
    if ([Console]::IsInputRedirected) { return $false }
  } catch { return $false }
  return $true
}

function Show-Banner {
  Clear-Host
  $bar = "=" * 64
  Write-Host ""
  Write-Host "  $bar" -ForegroundColor DarkCyan
  Write-Host "    L.C.G.  -  Let Copilot Grind" -ForegroundColor White
  Write-Host "    Chief-of-Staff toolkit installer" -ForegroundColor Gray
  Write-Host "  $bar" -ForegroundColor DarkCyan
  Write-Host ""
  Write-Host "  This installer will:" -ForegroundColor White
  Write-Host "    - Install Node.js, Azure CLI, GitHub CLI, VS Code, Obsidian (as needed)"
  Write-Host "    - Sign you in to Azure silently using your Windows account"
  Write-Host "    - Configure your Obsidian vault location"
  Write-Host "    - Wire up MCP servers and the lcg CLI"
  Write-Host ""
  Write-Host "  Estimated time: ~5 minutes." -ForegroundColor DarkGray
  Write-Host ""
}

function Find-ObsidianInstall {
  $candidates = @(
    (Join-Path $env:LOCALAPPDATA "Programs\Obsidian\Obsidian.exe"),
    (Join-Path $env:LOCALAPPDATA "Obsidian\Obsidian.exe"),
    "C:\Program Files\Obsidian\Obsidian.exe",
    "C:\Program Files (x86)\Obsidian\Obsidian.exe"
  )
  foreach ($p in $candidates) {
    if ($p -and (Test-Path $p)) { return $p }
  }
  return $null
}

function Get-KnownObsidianVaults {
  $cfg = Join-Path $env:APPDATA "obsidian\obsidian.json"
  if (-not (Test-Path $cfg)) { return @() }
  try {
    $json = Get-Content -Raw -LiteralPath $cfg | ConvertFrom-Json
  } catch { return @() }
  if (-not $json.vaults) { return @() }
  $vaults = @()
  foreach ($prop in $json.vaults.PSObject.Properties) {
    $entry = $prop.Value
    if (-not $entry.path) { continue }
    if (-not (Test-Path $entry.path)) { continue }
    $vaults += [pscustomobject]@{
      Path  = $entry.path
      Name  = Split-Path -Leaf $entry.path
      Ts    = if ($entry.ts) { [int64]$entry.ts } else { 0 }
    }
  }
  # Most-recently-used first.
  return $vaults | Sort-Object -Property Ts -Descending
}

function Read-Choice {
  param(
    [string]$Prompt,
    [int]$Max,
    [int]$Default
  )
  while ($true) {
    $raw = Read-Host "  $Prompt"
    if ([string]::IsNullOrWhiteSpace($raw)) { return $Default }
    $n = 0
    if ([int]::TryParse($raw.Trim(), [ref]$n) -and $n -ge 1 -and $n -le $Max) {
      return $n
    }
    Say-Warn "Enter a number between 1 and $Max (or press Enter for default)."
  }
}

function Read-YesNo {
  param([string]$Prompt, [bool]$Default = $true)
  $hint = if ($Default) { "[Y/n]" } else { "[y/N]" }
  while ($true) {
    $raw = (Read-Host "  $Prompt $hint").Trim().ToLowerInvariant()
    if ($raw -eq "") { return $Default }
    if ($raw -in @("y","yes")) { return $true }
    if ($raw -in @("n","no"))  { return $false }
    Say-Warn "Please answer y or n."
  }
}

function Invoke-SilentAzLogin {
  # Pre-condition: Entra-joined Windows + @microsoft.com user (locked audience).
  if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
    Say-Info "Azure CLI not installed yet — skipping silent sign-in (will retry after install)."
    return $false
  }

  Say-Info "Signing in to Azure (using your Windows account)..."
  & az config set core.enable_broker_on_windows=true --only-show-errors 2>$null | Out-Null
  & az config set core.login_experience_v2=off       --only-show-errors 2>$null | Out-Null

  $existing = (& az account show --query user.name -o tsv 2>$null)
  if ($LASTEXITCODE -eq 0 -and $existing) {
    Say-Ok "Already signed in as $existing"
    return $true
  }

  & az login --tenant $MicrosoftTenantId --allow-no-subscriptions --output none 2>$null | Out-Null
  $who = (& az account show --query user.name -o tsv 2>$null)
  if ($LASTEXITCODE -eq 0 -and $who) {
    Say-Ok "Signed in as $who"
    return $true
  }

  Say-Warn "Silent Azure sign-in did not complete — you can run 'az login' later."
  return $false
}

function Invoke-Wizard {
  Show-Banner

  $proceed = Read-YesNo -Prompt "Press Enter to begin (y/n)" -Default $true
  if (-not $proceed) {
    Say-Info "Installation cancelled. Re-run when ready."
    exit 0
  }

  # ─── Obsidian section ─────────────────────────────────────────
  Write-Host ""
  Write-Host "  --- Obsidian ---" -ForegroundColor DarkCyan
  $obsidian = Find-ObsidianInstall
  $skipObsidianInstall = $false
  if ($obsidian) {
    Say-Ok "Obsidian detected at $obsidian"
    $skipObsidianInstall = $true
  } else {
    $install = Read-YesNo -Prompt "Obsidian Desktop is not installed. Install it now?" -Default $true
    if (-not $install) {
      $skipObsidianInstall = $true
      Say-Info "Skipping Obsidian install."
    }
  }

  # ─── Vault selection ─────────────────────────────────────────
  Write-Host ""
  Write-Host "  --- Vault location ---" -ForegroundColor DarkCyan
  $localVault = Join-Path $Root ".vault"
  $vaults = Get-KnownObsidianVaults
  $options = @()
  $idx = 1
  foreach ($v in $vaults) {
    Write-Host ("    {0}) {1}" -f $idx, $v.Name)
    Write-Host ("       -> {0}" -f $v.Path) -ForegroundColor DarkGray
    $options += [pscustomobject]@{ Path = $v.Path; Mode = "existing" }
    $idx++
  }
  Write-Host ("    {0}) Create a new vault inside the L.C.G folder  [recommended]" -f $idx)
  Write-Host ("       -> {0}" -f $localVault) -ForegroundColor DarkGray
  $options += [pscustomobject]@{ Path = $localVault; Mode = "local" }
  $localChoice = $idx
  $idx++
  Write-Host ("    {0}) Enter a custom path" -f $idx)
  $options += [pscustomobject]@{ Path = $null; Mode = "custom" }
  $customChoice = $idx

  # Default: most-recently-used vault if any, else local.
  $default = if ($vaults.Count -gt 0) { 1 } else { $localChoice }

  $pick = Read-Choice -Prompt "Choice [Enter=$default]" -Max $options.Count -Default $default
  $selected = $options[$pick - 1]
  $vaultPath = $selected.Path
  $vaultMode = $selected.Mode

  if ($vaultMode -eq "custom") {
    while ($true) {
      $raw = (Read-Host "  Custom vault path").Trim().Trim('"').Trim("'")
      if ([string]::IsNullOrWhiteSpace($raw)) {
        Say-Warn "Path cannot be empty."
        continue
      }
      try {
        $vaultPath = [System.IO.Path]::GetFullPath($raw)
        $vaultMode = if (Test-Path $vaultPath) { "existing" } else { "new" }
        break
      } catch {
        Say-Warn "Invalid path: $($_.Exception.Message)"
      }
    }
  }

  # ─── Summary & confirm ─────────────────────────────────────
  Write-Host ""
  Write-Host "  --- Review your choices ---" -ForegroundColor DarkCyan
  Write-Host "    Vault:    $vaultPath"
  Write-Host "    Vault mode: $vaultMode"
  Write-Host "    Obsidian: $(if ($obsidian) { 'detected' } elseif ($skipObsidianInstall) { 'skip' } else { 'install' })"
  Write-Host "    Azure sign-in: silent (WAM broker)"
  Write-Host ""
  $go = Read-YesNo -Prompt "Proceed with installation?" -Default $true
  if (-not $go) {
    Say-Info "Installation cancelled. Re-run when ready."
    exit 0
  }

  # Hand off to Node via env vars.
  $env:LCG_VAULT_PATH = $vaultPath
  $env:LCG_VAULT_MODE = $vaultMode
  if ($skipObsidianInstall) { $env:LCG_SKIP_OBSIDIAN_INSTALL = "1" }
}

function Test-Node {
  $node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $node) { return $false }
  $v = (& node -v) -replace '^v',''
  $major = [int]($v.Split('.')[0])
  return ($major -ge $MinNodeMajor)
}

function Wait-MsiIdle {
  param([int]$TimeoutSec = 180)
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    $busy = Get-Process -Name msiexec -ErrorAction SilentlyContinue |
      Where-Object { $_.Id -ne $PID }
    if (-not $busy) { return $true }
    Start-Sleep -Seconds 3
  }
  return $false
}

function Invoke-WingetInstall {
  param([string]$Id, [int]$MaxAttempts = 4)
  # Codes that indicate "another MSI is in progress" (1618 and winget hex variants).
  $busyCodes = @(1618, -1978335006, -1978334974)
  for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
    Wait-MsiIdle | Out-Null
    $output = @(& winget install --id $Id --silent --accept-package-agreements --accept-source-agreements 2>&1)
    # Coerce $LASTEXITCODE to int; winget can leave it null or as a non-numeric string
    # in some edge cases (which would otherwise look like a non-zero failure below).
    $raw = $LASTEXITCODE
    $code = 0
    if ($null -ne $raw -and -not [int]::TryParse([string]$raw, [ref]$code)) { $code = -1 }
    elseif ($null -ne $raw) { $code = [int]$raw }
    if ($code -eq 0) { return 0 }
    if ($output) {
      $lines = $output | ForEach-Object { $_.ToString().Trim() } | Where-Object { $_ }
      if ($lines.Count -gt 0) {
        Say-Warn "winget: $($lines[-1])"
      }
    }
    if ($busyCodes -notcontains $code) { return $code }
    $backoff = [math]::Min(30, 5 * $attempt)
    Say-Warn "winget reported another installer is busy (exit $code). Retrying in ${backoff}s (attempt $attempt of $MaxAttempts)..."
    Start-Sleep -Seconds $backoff
  }
  return $code
}

function Install-Node {
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    Say-Info "Installing Node via winget..."
    $code = Invoke-WingetInstall -Id "OpenJS.NodeJS.LTS"
    # Don't trust the exit code alone - winget sometimes reports non-zero / null even on success.
    # The caller verifies via Test-Node; just emit a soft warning here so the log is honest.
    if ($code -ne 0) {
      Say-Warn "winget reported exit code $code for OpenJS.NodeJS.LTS - will verify with Test-Node next."
    }
    return
  }
  if (Get-Command choco -ErrorAction SilentlyContinue) {
    Say-Info "Installing Node via Chocolatey..."
    & choco install nodejs-lts -y
    return
  }
  Say-Fail "Neither winget nor Chocolatey found."
  Say-Info "Install Node >= $MinNodeMajor manually: https://nodejs.org"
  throw "Cannot auto-install Node.js"
}

# -- Wizard (Windows installer experience) -------------------------
$RunWizard = Test-Interactive
if ($RunWizard) {
  Invoke-Wizard
}

# -- Ensure Node ----------------------------------------------------
Write-Host "--- Ensuring Node.js >= $MinNodeMajor ---" -ForegroundColor Cyan

if (Test-Node) {
  Say-Ok "Node.js $((& node -v)) detected"
} else {
  Say-Warn "Node.js >= $MinNodeMajor not found."
  Install-Node

  # Refresh PATH so the newly installed node is visible in this session.
  $env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" +
              [Environment]::GetEnvironmentVariable("Path","User")

  if (-not (Test-Node)) {
    Say-Fail "Node installation did not succeed (or PATH needs a new shell)."
    Say-Info "If winget reported exit 1618, another installer (often Windows Update or"
    Say-Info "DesktopAppInstaller self-update) is holding the MSI lock."
    Say-Info "Wait ~60s, then open a new PowerShell window and re-run this script."
    return 1
  }
  Say-Ok "Node.js $((& node -v)) installed"
}

# -- Hand off to bootstrap.js --------------------------------------
Write-Host "--- Handing off to scripts/bootstrap.js ---" -ForegroundColor Cyan

# Try silent Azure sign-in early (works when Azure CLI is already installed
# from a prior run). If not, we'll retry after the Node bootstrap installs it.
if ($RunWizard) {
  $azReady = Invoke-SilentAzLogin
  if ($azReady) { $env:LCG_AZ_AUTH_DONE = "1" }
}

$argsToPass = @()
if ($Check)       { $argsToPass += "--check" }
if ($SkipInstall) { $argsToPass += "--skip-install" }
if ($Rest)        { $argsToPass += $Rest }

& node (Join-Path $Root "scripts\bootstrap.js") @argsToPass
$nodeExit = $LASTEXITCODE

# Post-handoff: if Azure CLI was just installed and silent sign-in hasn't
# happened yet, try now so the user doesn't have to deal with az login later.
if ($RunWizard -and -not $env:LCG_AZ_AUTH_DONE) {
  Write-Host ""
  Write-Host "--- Azure sign-in ---" -ForegroundColor Cyan
  if (Invoke-SilentAzLogin) { $env:LCG_AZ_AUTH_DONE = "1" }
}

if ($nodeExit -is [int]) {
  return $nodeExit
}
return 0
