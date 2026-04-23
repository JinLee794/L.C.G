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
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Rest
)

$ErrorActionPreference = "Stop"
$MinNodeMajor = 18

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root      = Split-Path -Parent $ScriptDir

function Say-Ok   ($m) { Write-Host "  [OK] $m" -ForegroundColor Green }
function Say-Warn ($m) { Write-Host "  [WARN] $m" -ForegroundColor Yellow }
function Say-Fail ($m) { Write-Host "  [FAIL] $m" -ForegroundColor Red }
function Say-Info ($m) { Write-Host "  [INFO] $m" -ForegroundColor Cyan }

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
    & winget install --id $Id --silent --accept-package-agreements --accept-source-agreements
    $code = $LASTEXITCODE
    if ($code -eq 0) { return 0 }
    if ($busyCodes -notcontains $code) { return $code }
    $backoff = [math]::Min(30, 5 * $attempt)
    Say-Warn "winget reported another installer is busy (exit $code). Retrying in ${backoff}s (attempt $attempt of $MaxAttempts)..."
    Start-Sleep -Seconds $backoff
  }
  return $LASTEXITCODE
}

function Install-Node {
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    Say-Info "Installing Node via winget..."
    $code = Invoke-WingetInstall -Id "OpenJS.NodeJS.LTS"
    if ($code -ne 0) {
      Say-Fail "winget install OpenJS.NodeJS.LTS exited with code $code."
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

$argsToPass = @()
if ($Check)       { $argsToPass += "--check" }
if ($SkipInstall) { $argsToPass += "--skip-install" }
if ($Rest)        { $argsToPass += $Rest }

& node (Join-Path $Root "scripts\bootstrap.js") @argsToPass
if ($LASTEXITCODE -is [int]) {
  return $LASTEXITCODE
}
return 0
