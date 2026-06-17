# scripts/launcher/start-beatos.ps1 — BeatOS one-click launcher (Windows).
# For non-technical users: checks/installs dependencies, then starts BeatOS
# in the browser (default) or as the desktop app. Double-click start-beatos.bat
# at the repo root to run this. Idempotent — safe to run every time.
#
# Mirrors scripts/web.sh / web-pro.sh / dev.sh:
#   uv sync -> (Pro engine reinstall if submodule present) -> build SPA -> sidecar
# Browser rebuilds are skipped when the build matches the current git HEAD
# (marker file in out/web); menu option 3 forces a rebuild.

param([switch]$Rebuild)

$ErrorActionPreference = "Stop"
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}

$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $Root

# uv hardlinks packages from its cache by default; when the cache and the venv
# sit on different filesystems the link fails and uv falls back to a partial
# copy that can leave half-written package metadata (a gutted *.dist-info makes
# every later `uv pip install` abort). Force copy mode so installs are complete.
$env:UV_LINK_MODE = "copy"

$Port = 8765
if ($env:BEATOS_HTTP_PORT) { $Port = [int]$env:BEATOS_HTTP_PORT }
$Url = "http://127.0.0.1:$Port/"
$WebDir = Join-Path $Root "apps\desktop\out\web"
$Marker = Join-Path $WebDir ".beatos-build-head"

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Ok($msg)   { Write-Host "    $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "    $msg" -ForegroundColor Yellow }
function Fail($msg) {
  Write-Host "`n[ERROR] $msg" -ForegroundColor Red
  Read-Host "Press Enter to exit"
  exit 1
}

function Test-Port($p) {
  try {
    $c = New-Object Net.Sockets.TcpClient
    $c.Connect("127.0.0.1", $p); $c.Close(); return $true
  } catch { return $false }
}

function Refresh-Path {
  $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
              [Environment]::GetEnvironmentVariable("Path", "User")
}

# Open the SPA as a chromeless app window (Edge/Chrome --app=) so it looks like
# a desktop app; fall back to a normal browser tab when neither is installed.
function Open-AppWindow($url) {
  $candidates = @(
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
  )
  foreach ($exe in $candidates) {
    if ($exe -and (Test-Path $exe)) { Start-Process $exe -ArgumentList "--app=$url"; return }
  }
  Start-Process $url
}

try {

Write-Host ""
Write-Host "  BeatOS Launcher" -ForegroundColor Magenta
Write-Host "  ------------------------------------"

# ---------------------------------------------------------------- 1/5 uv
Step "[1/5] Checking Python environment manager (uv)"
if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
  Warn "uv not found — installing automatically... (first run only, ~1 min)"
  try {
    Invoke-RestMethod https://astral.sh/uv/install.ps1 | Invoke-Expression
  } catch {
    Fail "uv auto-install failed. Check your network and retry, or install manually: https://docs.astral.sh/uv/"
  }
  $env:Path = "$env:USERPROFILE\.local\bin;$env:Path"
  Refresh-Path
  if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    Fail "uv still unavailable after install. Close this window and double-click to start again."
  }
}
Ok "uv ready: $((uv --version) 2>$null)"

# ---------------------------------------------------------------- 2/5 Node
Step "[2/5] Checking Node.js (requires v22 or newer)"
$nodeOk = $false
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCmd) {
  $major = [int]((node --version) -replace "^v", "" -split "\.")[0]
  if ($major -ge 22) { $nodeOk = $true } else { Warn "Current Node.js v$major is too old" }
}
if (-not $nodeOk) {
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    Warn "Installing Node.js LTS automatically... (first run only, ~2 min)"
    winget install --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
    Refresh-Path
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
      Fail "Node.js installed but not active in this window. Close this window and double-click to start again."
    }
  } else {
    Fail "Node.js not found. Download and install the LTS version from https://nodejs.org/ then restart."
  }
}
Ok "Node.js ready: $(node --version)"

# ---------------------------------------------------------------- 3/5 npm install
Step "[3/5] Checking frontend dependencies"
if (-not (Test-Path (Join-Path $Root "apps\desktop\node_modules"))) {
  Warn "First launch: downloading frontend dependencies... (~3-5 min, please wait)"
  Push-Location (Join-Path $Root "apps\desktop")
  npm install
  $code = $LASTEXITCODE
  Pop-Location
  if ($code -ne 0) { Fail "Frontend dependency install failed (npm install). Check your network and retry." }
}
Ok "Frontend dependencies ready"

# ---------------------------------------------------------------- 4/5 uv sync + Pro
Step "[4/5] Syncing Python dependencies"
# A running instance locks venv DLLs (greenlet etc. via the Pro engine), which
# breaks uv sync's prune — if BeatOS is already up, just open the window.
if (Test-Port $Port) {
  Warn "BeatOS is already running — opening the window for you."
  Open-AppWindow $Url
  Start-Sleep 2
  exit 0
}
uv sync
if ($LASTEXITCODE -ne 0) {
  # Most common cause: an orphan sidecar (python -m beatos_http, parent gone)
  # still holds venv DLLs — close it and retry once (same idea as dev:fresh).
  Warn "Sync failed — closing leftover BeatOS background processes and retrying..."
  Get-CimInstance Win32_Process -Filter "Name='python.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match "beatos_http" } |
    ForEach-Object {
      Warn "Closing leftover process pid=$($_.ProcessId)"
      Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
  Start-Sleep 1
  uv sync
  if ($LASTEXITCODE -ne 0) { Fail "Python dependency sync failed (uv sync). Close all BeatOS windows and retry; if it still fails, check your network." }
}
Ok "Python dependencies ready"

# Pro engine: uv sync prunes it every run (not a workspace member) — reinstall
# after sync, exactly like scripts/web-pro.sh. Absent submodule = free build.
$Engine = Join-Path $Root "packages\pro\beatos-publish"
$Pro = Test-Path (Join-Path $Engine "pyproject.toml")
if ($Pro) {
  Warn "Pro module detected — loading the publish engine..."
  uv pip install -e $Engine --no-deps
  if ($LASTEXITCODE -ne 0) { Fail "Pro engine install failed." }
  uv pip install "patchright>=1.40"
  if ($LASTEXITCODE -ne 0) { Fail "patchright install failed." }
  uv run patchright install chromium
  Ok "Pro publish engine ready"
} else {
  Ok "Free edition (no Pro module mounted)"
}

# ---------------------------------------------------------------- 5/5 launch
Step "[5/5] Choose how to start"
Write-Host ""
Write-Host "    [1] Browser app (recommended, default on Enter)"
Write-Host "    [2] Desktop app"
Write-Host "    [3] Browser app — force rebuild (use this if the UI didn't update)"
Write-Host ""
$choice = Read-Host "    Enter a number and press Enter"
if ([string]::IsNullOrWhiteSpace($choice)) { $choice = "1" }

if ($choice -eq "2") {
  # Desktop: electron-vite dev — Electron main owns the sidecar (scripts/dev.sh).
  Step "Starting the desktop app... (window appears shortly; closing this window exits)"
  Set-Location (Join-Path $Root "apps\desktop")
  npm run dev
  exit $LASTEXITCODE
}

$needBuild = $true
$head = (git -C $Root rev-parse HEAD) 2>$null
if (($choice -ne "3") -and (-not $Rebuild) -and (Test-Path (Join-Path $WebDir "index.html"))) {
  if ((Test-Path $Marker) -and $head -and ((Get-Content $Marker -Raw).Trim() -eq $head)) {
    $needBuild = $false
  }
}
if ($needBuild) {
  Step "Building the web UI... (~1 min)"
  Push-Location (Join-Path $Root "apps\desktop")
  npm run build:web
  $code = $LASTEXITCODE
  Pop-Location
  if ($code -ne 0) { Fail "Web build failed (npm run build:web)." }
  if ($head) { Set-Content -Path $Marker -Value $head -Encoding ascii }
} else {
  Ok "Web UI is up to date, skipping build"
}

Step "Starting BeatOS..."
$env:BEATOS_HTTP_PORT = "$Port"
$env:BEATOS_WEB_DIR = $WebDir
$proc = Start-Process -FilePath "uv" -ArgumentList "run", "python", "-m", "beatos_http" `
          -WorkingDirectory $Root -NoNewWindow -PassThru

$up = $false
foreach ($i in 1..60) {
  if ($proc.HasExited) { break }
  if (Test-Port $Port) { $up = $true; break }
  Start-Sleep -Milliseconds 500
}
if (-not $up) { Fail "Service failed to start. Logs: apps\desktop\logs\sidecar.jsonl" }

Open-AppWindow $Url
Write-Host ""
Ok "BeatOS is running: $Url"
Warn "Keep this window open; closing it exits BeatOS."
Wait-Process -Id $proc.Id
exit 0

} catch {
  Write-Host "`n[ERROR] $($_.Exception.Message)" -ForegroundColor Red
  Read-Host "Press Enter to exit"
  exit 1
}
