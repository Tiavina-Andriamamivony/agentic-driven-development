# Lou — one-line installer for Windows (PowerShell 5+ / pwsh).
# Downloads the Lou sources from GitHub and wires the `lou` launcher (lou.cmd).
#   irm https://raw.githubusercontent.com/Tiavina-Andriamamivony/lou-agents-orchestrator/main/apps/cli/install/install.ps1 | iex

param(
  [string]$Prefix = $(if ($env:LOU_PREFIX) { $env:LOU_PREFIX } else { Join-Path $HOME '.lou' }),
  [string]$Version = $(if ($env:LOU_VERSION) { $env:LOU_VERSION } else { 'main' }),
  [string]$Node = 'node',
  [switch]$Quiet
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$Repo = 'Tiavina-Andriamamivony/lou-agents-orchestrator'

function Write-Step {
  param([string]$Label, [scriptblock]$Action)
  Write-Host "  o $Label ..." -NoNewline -ForegroundColor DarkGray
  try {
    & $Action 2>&1 | Out-Null
    Write-Host " [ OK ]" -ForegroundColor Green
  }
  catch {
    Write-Host " [FAIL]" -ForegroundColor Red
    Write-Host "       $($_.Exception.Message)" -ForegroundColor DarkGray
    throw
  }
}

function banner {
  Write-Host ''
  Write-Host '   ██      ██████ ██   ██' -ForegroundColor Cyan
  Write-Host '   ██     ██   ██ ██   ██' -ForegroundColor Cyan
  Write-Host '   ██     ██   ██ ██   ██' -ForegroundColor Cyan
  Write-Host '   ██     ██   ██ ██   ██' -ForegroundColor Cyan
  Write-Host '   ██████ ╚██████ ╚██████' -ForegroundColor Cyan
  Write-Host '   Lou · Agentic-Driven Orchestration — installer' -ForegroundColor White
  Write-Host ''
}

function usage {
  @"
Usage: install.ps1
  -Prefix    install directory (default: ~\.lou, or `$env:LOU_PREFIX)
  -Version   Lou version to install: a tag or 'main' (default: main)
  -Node      node binary to use (default: 'node')
  -Quiet     minimal output
"@ | Write-Host
}

function Find-Node {
  $command = Get-Command $Node -ErrorAction SilentlyContinue
  if (-not $command) {
    throw "Node.js was not found ($Node). Install Node 22 or newer: winget install OpenJS.NodeJS.LTS — then re-run."
  }
  & $command.Source --experimental-strip-types -e 'console.log("ok")' 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Your Node ($(& $command.Source --version)) lacks --experimental-strip-types. Use Node 22.7 or newer."
  }
  $script:NodePath = $command.Source
  $script:NodeVersion = & $NodePath --version
}

function Download-Archive {
  $url = if ($Version -eq 'main') {
    "https://github.com/$Repo/archive/refs/heads/main.zip"
  } else {
    "https://github.com/$Repo/archive/refs/tags/$Version.zip"
  }
  $script:ZipPath = Join-Path ([System.IO.Path]::GetTempPath()) "lou-$Version.zip"
  Invoke-WebRequest -Uri $url -OutFile $ZipPath
}

function Install-Sources {
  $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("lou-" + [guid]::NewGuid().ToString('N'))
  $current = Join-Path $Prefix 'current'
  Expand-Archive -Path $ZipPath -DestinationPath $tmp
  $root = Get-ChildItem -Path $tmp -Directory | Select-Object -First 1
  if (-not $root) { throw 'The archive did not contain the Lou sources.' }
  $target = Join-Path $Prefix $Version
  New-Item -ItemType Directory -Path $Prefix -Force | Out-Null
  Remove-Item -Recurse -Force $target -ErrorAction SilentlyContinue
  Remove-Item -Recurse -Force $current -ErrorAction SilentlyContinue
  Move-Item -Path $root.FullName -Destination $target
  New-Item -ItemType Directory -Path $current -Force | Out-Null
  Copy-Item -Path (Join-Path $target '*') -Destination $current -Recurse -Force
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
  Remove-Item -Force $ZipPath -ErrorAction SilentlyContinue
}

function Install-Launcher {
  $src = (Join-Path $Prefix "current\apps\cli\src\cli.ts")
  $binDir = Join-Path $Prefix 'bin'
  New-Item -ItemType Directory -Path $binDir -Force | Out-Null
  $louCmd = Join-Path $binDir 'lou.cmd'
  @"
@echo off
"$NodePath" --no-warnings --experimental-strip-types "$src" %*
"@ | Set-Content -Path $louCmd -Encoding ascii
}

function Add-ToPath {
  $binDir = Join-Path $Prefix 'bin'
  $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  if (-not $userPath) { $userPath = $binDir }
  elseif ($userPath -notlike "*$binDir*") { $userPath = "$userPath;$binDir" }
  [Environment]::SetEnvironmentVariable('Path', $userPath, 'User')
}

function Find-Pnpm {
  if (Get-Command pnpm -ErrorAction SilentlyContinue) {
    $script:Pnpm = 'pnpm'
  }
  elseif (Get-Command corepack -ErrorAction SilentlyContinue) {
    Write-Host '       using corepack to run pnpm (downloads on first use)' -ForegroundColor DarkGray
    $script:Pnpm = 'corepack pnpm'
  }
  elseif (Get-Command npm -ErrorAction SilentlyContinue) {
    Write-Host '       adopting pnpm via  npm install -g pnpm  (one-time)' -ForegroundColor DarkGray
    & npm install --global pnpm 2>$null | Out-Null
    if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
      throw 'npm failed to install pnpm.'
    }
    $script:Pnpm = 'pnpm'
  }
  else {
    throw 'pnpm was not found. Install it (https://pnpm.io/installation) or enable corepack, then re-run.'
  }
  & $Pnpm --version 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw 'pnpm did not start. Install pnpm (https://pnpm.io/installation), then re-run.'
  }
}

function Install-Deps {
  Push-Location (Join-Path $Prefix 'current')
  try {
    if (-not (& $Pnpm install --prod --frozen-lockfile --ignore-scripts)) { throw 'Installing Lou dependencies failed. Re-run with network access.' }
  }
  finally { Pop-Location }
}

function Verify {
  & $NodePath --no-warnings --experimental-strip-types (Join-Path $Prefix "current\apps\cli\src\cli.ts") --version 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'The lou launcher failed to start.' }
}

if ($args -contains '--help' -or $args -contains '-h') { usage; exit 0 }

banner
Write-Step 'Detecting system' { "$([System.Runtime.InteropServices.RuntimeInformation]::OSDescription) ($([System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture))" | Write-Host -ForegroundColor DarkGray }
Write-Step 'Locating Node runtime' { Find-Node }
Write-Host "       runtime: $NodeVersion" -ForegroundColor DarkGray
Write-Step 'Downloading Lou' { Download-Archive }
Write-Step 'Extracting sources' { Install-Sources }
Write-Step 'Locating pnpm tooling' { Find-Pnpm }
Write-Step 'Installing dependencies' { Install-Deps }
Write-Step 'Installing launcher' { Install-Launcher }
Write-Step 'Adding to PATH' { Add-ToPath }
Write-Step 'Verifying install' { Verify }

Write-Host ''
Write-Host "  Lou $Version installed." -ForegroundColor Green
Write-Host "  Binary : $(Join-Path $Prefix 'bin\lou.cmd')"
Write-Host "  Sources: $(Join-Path $Prefix 'current')"
Write-Host "  Version: $(& $NodePath --no-warnings --experimental-strip-types (Join-Path $Prefix 'current\apps\cli\src\cli.ts') --version)"
Write-Host ''
Write-Host 'Next steps:' -ForegroundColor Yellow
Write-Host '  1. Open a new terminal so lou is on your PATH'
Write-Host '  2. cd into a project and run  lou init'
Write-Host '  3. Drive a ticket to a PR with  lou run <issue-number>'
Write-Host ''
Write-Host "Re-run this installer to upgrade. Uninstall: remove $Prefix and the PATH entry added to your user environment."