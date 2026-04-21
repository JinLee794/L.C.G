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

function Install-Node {
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    Say-Info "Installing Node via winget..."
    & winget install --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
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
    Say-Info "Open a new PowerShell window and re-run this script."
    exit 1
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
exit $LASTEXITCODE
