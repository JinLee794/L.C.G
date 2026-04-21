[CmdletBinding()]
param(
  [string]$Dir = (Join-Path (Get-Location).Path 'L.C.G'),
  [string]$Ref = 'main',
  [switch]$Force,
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$BootstrapArgs
)

$ErrorActionPreference = 'Stop'

$repoOwner = 'JinLee794'
$repoName = 'L.C.G'
$archiveUrl = "https://codeload.github.com/$repoOwner/$repoName/zip/refs/heads/$Ref"

function Write-Info($message) {
  Write-Host $message -ForegroundColor Cyan
}

$Dir = [System.IO.Path]::GetFullPath($Dir)

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
  exit 1
}

if ((Test-Path $Dir) -and -not $Force) {
  Write-Error "Destination already exists: $Dir`nRe-run with -Force to replace it, or pass -Dir to choose another path."
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

  if (Test-Path $Dir) {
    Remove-Item -Path $Dir -Recurse -Force
  }

  Move-Item -Path $expandedDir -Destination $Dir

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
  exit $LASTEXITCODE
}
finally {
  if (Test-Path $tempRoot) {
    Remove-Item -Path $tempRoot -Recurse -Force
  }
}