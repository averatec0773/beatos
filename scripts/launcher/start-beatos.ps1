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

$Port = 8765
if ($env:BEATOS_HTTP_PORT) { $Port = [int]$env:BEATOS_HTTP_PORT }
$Url = "http://127.0.0.1:$Port/"
$WebDir = Join-Path $Root "apps\desktop\out\web"
$Marker = Join-Path $WebDir ".beatos-build-head"

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Ok($msg)   { Write-Host "    $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "    $msg" -ForegroundColor Yellow }
function Fail($msg) {
  Write-Host "`n[错误] $msg" -ForegroundColor Red
  Read-Host "按回车键退出"
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
Write-Host "  BeatOS 启动器" -ForegroundColor Magenta
Write-Host "  ------------------------------------"

# ---------------------------------------------------------------- 1/5 uv
Step "[1/5] 检查 Python 环境管理器 (uv)"
if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
  Warn "未找到 uv，正在自动安装…（仅首次需要，约 1 分钟）"
  try {
    Invoke-RestMethod https://astral.sh/uv/install.ps1 | Invoke-Expression
  } catch {
    Fail "uv 自动安装失败。请检查网络后重试，或手动安装：https://docs.astral.sh/uv/"
  }
  $env:Path = "$env:USERPROFILE\.local\bin;$env:Path"
  Refresh-Path
  if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    Fail "uv 安装后仍不可用。请关闭本窗口后重新双击启动一次。"
  }
}
Ok "uv 就绪：$((uv --version) 2>$null)"

# ---------------------------------------------------------------- 2/5 Node
Step "[2/5] 检查 Node.js (需要 22 或更高版本)"
$nodeOk = $false
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCmd) {
  $major = [int]((node --version) -replace "^v", "" -split "\.")[0]
  if ($major -ge 22) { $nodeOk = $true } else { Warn "当前 Node.js v$major 版本过低" }
}
if (-not $nodeOk) {
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    Warn "正在自动安装 Node.js LTS…（仅首次需要，约 2 分钟）"
    winget install --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
    Refresh-Path
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
      Fail "Node.js 安装完成但本窗口未生效。请关闭本窗口后重新双击启动一次。"
    }
  } else {
    Fail "未找到 Node.js。请到 https://nodejs.org/ 下载安装 LTS 版本后重新启动。"
  }
}
Ok "Node.js 就绪：$(node --version)"

# ---------------------------------------------------------------- 3/5 npm install
Step "[3/5] 检查前端依赖"
if (-not (Test-Path (Join-Path $Root "apps\desktop\node_modules"))) {
  Warn "首次启动：正在下载前端依赖…（约 3-5 分钟，请耐心等待）"
  Push-Location (Join-Path $Root "apps\desktop")
  npm install
  $code = $LASTEXITCODE
  Pop-Location
  if ($code -ne 0) { Fail "前端依赖安装失败（npm install）。请检查网络后重试。" }
}
Ok "前端依赖就绪"

# ---------------------------------------------------------------- 4/5 uv sync + Pro
Step "[4/5] 同步 Python 依赖"
# A running instance locks venv DLLs (greenlet etc. via the Pro engine), which
# breaks uv sync's prune — if BeatOS is already up, just open the window.
if (Test-Port $Port) {
  Warn "BeatOS 已经在运行了 — 直接为你打开窗口。"
  Open-AppWindow $Url
  Start-Sleep 2
  exit 0
}
uv sync
if ($LASTEXITCODE -ne 0) {
  # Most common cause: an orphan sidecar (python -m beatos_http, parent gone)
  # still holds venv DLLs — close it and retry once (same idea as dev:fresh).
  Warn "同步失败 — 正在关闭残留的 BeatOS 后台进程后重试…"
  Get-CimInstance Win32_Process -Filter "Name='python.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match "beatos_http" } |
    ForEach-Object {
      Warn "关闭残留进程 pid=$($_.ProcessId)"
      Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
  Start-Sleep 1
  uv sync
  if ($LASTEXITCODE -ne 0) { Fail "Python 依赖同步失败（uv sync）。请关闭所有 BeatOS 窗口后重试；若仍失败请检查网络。" }
}
Ok "Python 依赖就绪"

# Pro engine: uv sync prunes it every run (not a workspace member) — reinstall
# after sync, exactly like scripts/web-pro.sh. Absent submodule = free build.
$Engine = Join-Path $Root "packages\pro\beatos-publish"
$Pro = Test-Path (Join-Path $Engine "pyproject.toml")
if ($Pro) {
  Warn "检测到 Pro 模块，正在装载发布引擎…"
  uv pip install -e $Engine --no-deps
  if ($LASTEXITCODE -ne 0) { Fail "Pro 引擎安装失败。" }
  uv pip install "patchright>=1.40"
  if ($LASTEXITCODE -ne 0) { Fail "patchright 安装失败。" }
  uv run patchright install chromium
  Ok "Pro 发布引擎就绪"
} else {
  Ok "免费版（未挂载 Pro 模块）"
}

# ---------------------------------------------------------------- 5/5 launch
Step "[5/5] 选择启动方式"
Write-Host ""
Write-Host "    [1] 浏览器版（推荐，回车默认）"
Write-Host "    [2] 桌面应用版"
Write-Host "    [3] 浏览器版 — 强制重新构建（界面没更新时选这个）"
Write-Host ""
$choice = Read-Host "    请输入数字后回车"
if ([string]::IsNullOrWhiteSpace($choice)) { $choice = "1" }

if ($choice -eq "2") {
  # Desktop: electron-vite dev — Electron main owns the sidecar (scripts/dev.sh).
  Step "正在启动桌面应用…（窗口稍后弹出，关闭本窗口即退出）"
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
  Step "正在构建网页界面…（约 1 分钟）"
  Push-Location (Join-Path $Root "apps\desktop")
  npm run build:web
  $code = $LASTEXITCODE
  Pop-Location
  if ($code -ne 0) { Fail "网页构建失败（npm run build:web）。" }
  if ($head) { Set-Content -Path $Marker -Value $head -Encoding ascii }
} else {
  Ok "网页界面已是最新，跳过构建"
}

Step "正在启动 BeatOS…"
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
if (-not $up) { Fail "服务启动失败。日志：apps\desktop\logs\sidecar.jsonl" }

Open-AppWindow $Url
Write-Host ""
Ok "BeatOS 正在运行：$Url"
Warn "保持本窗口开着；关闭本窗口即退出 BeatOS。"
Wait-Process -Id $proc.Id
exit 0

} catch {
  Write-Host "`n[错误] $($_.Exception.Message)" -ForegroundColor Red
  Read-Host "按回车键退出"
  exit 1
}
