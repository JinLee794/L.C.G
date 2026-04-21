[CmdletBinding()]
param(
  [string]$Dir = (Join-Path (Get-Location).Path 'L.C.G'),
  [string]$Ref = 'main',
  [string]$RepoOwner = 'JinLee794',
  [switch]$Force,
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$BootstrapArgs
)

$ErrorActionPreference = 'Stop'

$repoOwner = if (-not [string]::IsNullOrWhiteSpace($env:LCG_INSTALL_OWNER)) { $env:LCG_INSTALL_OWNER } else { $RepoOwner }
$repoName = 'L.C.G'
$archiveUrl = "https://codeload.github.com/$repoOwner/$repoName/zip/refs/heads/$Ref"

function Write-Info($message) {
  Write-Host $message -ForegroundColor Cyan
}

$dirWasExplicit = $PSBoundParameters.ContainsKey('Dir')
$defaultInstallDir = Join-Path $HOME 'L.C.G'

if (-not $dirWasExplicit) {
  Write-Info "Install directory (press Enter for '$defaultInstallDir'):"

  $requestedDir = $null
  try {
    $requestedDir = Read-Host "Install directory"
  }
  catch {
    # In non-interactive shells, fall back to the safe default.
  }

  if ([string]::IsNullOrWhiteSpace($requestedDir)) {
    $Dir = $defaultInstallDir
    Write-Info "Using default install directory '$Dir'."
  } else {
    $Dir = $requestedDir.Trim()
    Write-Info "Using install directory '$Dir'."
  }
}

$Dir = [System.IO.Path]::GetFullPath($Dir)
$dirExists = Test-Path $Dir
$dirIsEmpty = $false

if ($dirExists) {
  $dirIsEmpty = -not (Get-ChildItem -Path $Dir -Force | Select-Object -First 1)
}

# Block installation into cloud-synced directories (credentials would sync to the cloud).
$dirLower = $Dir.ToLower()
if ($dirLower -match 'onedrive|dropbox|google drive|icloud') {
  Write-Host ''
  Write-Host 'ERROR: Install path appears to be inside a cloud-synced folder:' -ForegroundColor Red
  Write-Host "  $Dir" -ForegroundColor Red
  Write-Host ''
  Write-Host 'L.C.G. stores cached credentials locally (.env, .npmrc tokens). Installing' -ForegroundColor Yellow
  Write-Host 'here would sync those secrets to the cloud - which will get you an email' -ForegroundColor Yellow
  Write-Host 'from CISO you don''t want.' -ForegroundColor Yellow
  Write-Host ''
  Write-Host 'Choose a non-synced directory instead:' -ForegroundColor Cyan
  Write-Host '  ... | iex; Install-LCG -Dir "$HOME\L.C.G"' -ForegroundColor Cyan
  return 1
}

if ($dirExists -and -not $Force -and -not $dirIsEmpty) {
  Write-Error "Destination already exists and is not empty: $Dir`nRe-run with -Force to replace it, or pass -Dir to choose another path."
}

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ([System.Guid]::NewGuid().ToString())
$archivePath = Join-Path $tempRoot "$repoName.zip"
$extractPath = Join-Path $tempRoot 'extract'

New-Item -ItemType Directory -Path $tempRoot | Out-Null

try {
  Write-Info "Downloading $repoOwner/$repoName@$Ref..."
  Invoke-WebRequest -Uri $archiveUrl -OutFile $archivePath

  Write-Info 'Extracting archive...'
  Expand-Archive -Path $archivePath -DestinationPath $extractPath -Force

  $expandedDir = Join-Path $extractPath "$repoName-$Ref"
  if (-not (Test-Path $expandedDir)) {
    throw "Expected extracted directory not found: $expandedDir"
  }

  $parent = Split-Path -Parent $Dir
  if ($parent) {
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
  }

  if ($dirExists) {
    if ($Force -and -not $dirIsEmpty) {
      Remove-Item -Path $Dir -Recurse -Force
      Move-Item -Path $expandedDir -Destination $Dir
    } else {
      # Existing empty directory: move extracted repo contents into it.
      Get-ChildItem -Path $expandedDir -Force | Move-Item -Destination $Dir
    }
  } else {
    Move-Item -Path $expandedDir -Destination $Dir
  }

  Write-Info "Running bootstrap from $Dir..."
  Set-Location $Dir

  # Ensure execution policy allows running the bootstrap script in this process
  # (avoids hardcoding 'powershell' vs 'pwsh' and spawning a mismatched engine).
  Set-ExecutionPolicy -Scope Process Bypass -Force -ErrorAction SilentlyContinue
  if ($BootstrapArgs) {
    & .\scripts\bootstrap.ps1 @BootstrapArgs
  } else {
    & .\scripts\bootstrap.ps1
  }

  $bootstrapCode = if ($LASTEXITCODE -is [int]) { $LASTEXITCODE } else { 0 }
  if ($bootstrapCode -ne 0) {
    throw "Bootstrap failed with exit code $bootstrapCode. Re-run .\\scripts\\bootstrap.ps1 in '$Dir' to see details."
  }

  Write-Info 'Bootstrap completed successfully.'
  return 0
}
finally {
  if (Test-Path $tempRoot) {
    Remove-Item -Path $tempRoot -Recurse -Force
  }
}