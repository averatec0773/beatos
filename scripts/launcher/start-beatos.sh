#!/usr/bin/env bash
# scripts/launcher/start-beatos.sh — BeatOS one-click launcher (macOS / Linux).
# For non-technical users: checks/installs dependencies, then starts BeatOS
# in the browser (default) or as the desktop app. Double-click
# start-beatos.command at the repo root to run this. Idempotent.
#
# Mirrors scripts/web.sh / web-pro.sh / dev.sh:
#   uv sync -> (Pro engine reinstall if submodule present) -> build SPA -> sidecar
# Browser rebuilds are skipped when the build matches the current git HEAD
# (marker file in out/web); menu option 3 forces a rebuild.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

PORT="${BEATOS_HTTP_PORT:-8765}"
URL="http://127.0.0.1:${PORT}/"
WEB_DIR="$ROOT/apps/desktop/out/web"
MARKER="$WEB_DIR/.beatos-build-head"

step() { printf '\n\033[36m==> %s\033[0m\n' "$1"; }
ok()   { printf '\033[32m    %s\033[0m\n' "$1"; }
warn() { printf '\033[33m    %s\033[0m\n' "$1"; }
fail() { printf '\n\033[31m[错误] %s\033[0m\n' "$1"; read -r -p "按回车键退出 " _; exit 1; }

port_busy() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null && { exec 3>&-; return 0; } || return 1; }

open_url() {
  if command -v open >/dev/null 2>&1; then open "$1"
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$1"
  fi
}

# Open the SPA as a chromeless app window (Chrome/Edge --app=) so it looks like
# a desktop app; fall back to a normal browser tab when neither is installed.
open_app_window() {
  if command -v open >/dev/null 2>&1; then
    open -na "Google Chrome" --args --app="$1" 2>/dev/null && return
    open -na "Microsoft Edge" --args --app="$1" 2>/dev/null && return
  fi
  open_url "$1"
}

echo ""
printf '\033[35m  BeatOS 启动器\033[0m\n'
echo "  ------------------------------------"

# ---------------------------------------------------------------- 1/5 uv
step "[1/5] 检查 Python 环境管理器 (uv)"
export PATH="$HOME/.local/bin:$PATH"
if ! command -v uv >/dev/null 2>&1; then
  warn "未找到 uv，正在自动安装…（仅首次需要，约 1 分钟）"
  curl -LsSf https://astral.sh/uv/install.sh | sh \
    || fail "uv 自动安装失败。请检查网络后重试，或手动安装：https://docs.astral.sh/uv/"
  command -v uv >/dev/null 2>&1 || fail "uv 安装后仍不可用。请关闭本窗口后重新双击启动一次。"
fi
ok "uv 就绪：$(uv --version)"

# ---------------------------------------------------------------- 2/5 Node
step "[2/5] 检查 Node.js (需要 22 或更高版本)"
node_ok=false
if command -v node >/dev/null 2>&1; then
  major="$(node --version | sed 's/^v//' | cut -d. -f1)"
  if [ "$major" -ge 22 ]; then node_ok=true; else warn "当前 Node.js v$major 版本过低"; fi
fi
if [ "$node_ok" != true ]; then
  if command -v brew >/dev/null 2>&1; then
    warn "正在通过 Homebrew 安装 Node.js…（仅首次需要，约 2 分钟）"
    brew install node || fail "Node.js 安装失败。"
  else
    fail "未找到 Node.js。请到 https://nodejs.org/ 下载安装 LTS 版本后重新启动。"
  fi
fi
ok "Node.js 就绪：$(node --version)"

# ---------------------------------------------------------------- 3/5 npm install
step "[3/5] 检查前端依赖"
if [ ! -d "$ROOT/apps/desktop/node_modules" ]; then
  warn "首次启动：正在下载前端依赖…（约 3-5 分钟，请耐心等待）"
  ( cd "$ROOT/apps/desktop" && npm install ) || fail "前端依赖安装失败（npm install）。请检查网络后重试。"
fi
ok "前端依赖就绪"

# ---------------------------------------------------------------- 4/5 uv sync + Pro
step "[4/5] 同步 Python 依赖"
# A running instance holds the venv (Pro engine imports) and can break uv
# sync's prune — if BeatOS is already up, just open the window.
if port_busy "$PORT"; then
  warn "BeatOS 已经在运行了 — 直接为你打开窗口。"
  open_app_window "$URL"
  sleep 2
  exit 0
fi
if ! uv sync; then
  # Most common cause: an orphan sidecar (python -m beatos_http, parent gone)
  # still holds the venv — close it and retry once (same idea as dev:fresh).
  warn "同步失败 — 正在关闭残留的 BeatOS 后台进程后重试…"
  pkill -f "python -m beatos_http" 2>/dev/null || true
  sleep 1
  uv sync || fail "Python 依赖同步失败（uv sync）。请关闭所有 BeatOS 窗口后重试；若仍失败请检查网络。"
fi
ok "Python 依赖就绪"

# Pro engine: uv sync prunes it every run (not a workspace member) — reinstall
# after sync, exactly like scripts/web-pro.sh. Absent submodule = free build.
ENGINE="$ROOT/packages/pro/beatos-publish"
if [ -f "$ENGINE/pyproject.toml" ]; then
  warn "检测到 Pro 模块，正在装载发布引擎…"
  uv pip install -e "$ENGINE" --no-deps || fail "Pro 引擎安装失败。"
  uv pip install "patchright>=1.40" || fail "patchright 安装失败。"
  uv run patchright install chromium
  ok "Pro 发布引擎就绪"
else
  ok "免费版（未挂载 Pro 模块）"
fi

# ---------------------------------------------------------------- 5/5 launch
step "[5/5] 选择启动方式"
echo ""
echo "    [1] 浏览器版（推荐，回车默认）"
echo "    [2] 桌面应用版"
echo "    [3] 浏览器版 — 强制重新构建（界面没更新时选这个）"
echo ""
read -r -p "    请输入数字后回车 " choice
choice="${choice:-1}"

if [ "$choice" = "2" ]; then
  # Desktop: electron-vite dev — Electron main owns the sidecar (scripts/dev.sh).
  step "正在启动桌面应用…（窗口稍后弹出，关闭本窗口即退出）"
  cd "$ROOT/apps/desktop"
  exec npm run dev
fi

need_build=true
head="$(git -C "$ROOT" rev-parse HEAD 2>/dev/null || true)"
if [ "$choice" != "3" ] && [ -f "$WEB_DIR/index.html" ] && [ -f "$MARKER" ] && [ -n "$head" ] \
   && [ "$(cat "$MARKER")" = "$head" ]; then
  need_build=false
fi
if [ "$need_build" = true ]; then
  step "正在构建网页界面…（约 1 分钟）"
  ( cd "$ROOT/apps/desktop" && npm run build:web ) || fail "网页构建失败（npm run build:web）。"
  [ -n "$head" ] && printf '%s\n' "$head" > "$MARKER"
else
  ok "网页界面已是最新，跳过构建"
fi

step "正在启动 BeatOS…"
(
  for _ in $(seq 1 60); do
    sleep 0.5
    if port_busy "$PORT"; then open_app_window "$URL"; exit 0; fi
  done
) &

echo ""
ok "BeatOS 即将运行于：$URL"
warn "保持本窗口开着；关闭本窗口（或按 Ctrl-C）即退出 BeatOS。"
exec env BEATOS_HTTP_PORT="$PORT" BEATOS_WEB_DIR="$WEB_DIR" uv run python -m beatos_http
