#!/usr/bin/env bash
# Run the whole Suro/Lavna stack for local development with one command:
#
#   ./run.sh                 # API on :8000, storefront on :5173
#   API_PORT=8001 WEB_PORT=5174 ./run.sh
#
# First run installs dependencies. Every run applies database migrations, then
# starts FastAPI (auto-reload) and Vite (which proxies /api to FastAPI, so the
# session cookies work same-origin). Ctrl+C stops both.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
API_PORT="${API_PORT:-8000}"
WEB_PORT="${WEB_PORT:-5173}"

say() { printf '\033[1;34m▸ %s\033[0m\n' "$*"; }
die() { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

[ "$API_PORT" != "$WEB_PORT" ] || die "API_PORT and WEB_PORT must differ."

port_busy() { lsof -iTCP:"$1" -sTCP:LISTEN -n -P >/dev/null 2>&1; }
for port in "$API_PORT" "$WEB_PORT"; do
  if port_busy "$port"; then
    die "Port $port is already in use (PID $(lsof -tiTCP:"$port" -sTCP:LISTEN | head -1)). Stop it, or pick another: API_PORT=8001 WEB_PORT=5174 ./run.sh"
  fi
done

# --- dependencies (first run only) -------------------------------------------
cd "$ROOT/backend"
if [ ! -x .venv/bin/uvicorn ]; then
  say "Creating Python virtualenv and installing backend dependencies…"
  python3 -m venv .venv
  .venv/bin/pip install -q -r requirements-dev.txt
fi
if [ ! -d "$ROOT/frontend/node_modules" ]; then
  say "Installing frontend dependencies…"
  (cd "$ROOT/frontend" && npm install --silent)
fi

# --- database ------------------------------------------------------------------
if command -v pg_isready >/dev/null 2>&1 && ! pg_isready -q; then
  die "PostgreSQL is not running. Start it first (e.g. 'brew services start postgresql@14')."
fi
say "Applying database migrations…"
.venv/bin/alembic upgrade head >/dev/null

# --- run both, stop both -------------------------------------------------------
# On exit or Ctrl+C stop only what this script started (children first), never the
# caller's process group: `kill 0` would also kill an IDE or script that ran us.
kill_tree() {
  local child
  for child in $(pgrep -P "$1" 2>/dev/null); do kill_tree "$child"; done
  kill "$1" 2>/dev/null || true
}
cleanup() {
  trap - INT TERM EXIT
  echo; say "Stopping…"
  for pid in ${API_PID:-} ${WEB_PID:-}; do kill_tree "$pid"; done
  wait 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 130' INT TERM

(cd "$ROOT/backend" && exec .venv/bin/uvicorn app.main:app --reload --host 127.0.0.1 --port "$API_PORT" 2>&1 \
  | sed -l 's/^/[api] /') &
API_PID=$!

(cd "$ROOT/frontend" && VITE_API_PROXY="http://127.0.0.1:$API_PORT" exec npx vite --port "$WEB_PORT" --strictPort 2>&1 \
  | sed -l 's/^/[web] /') &
WEB_PID=$!

say "Storefront: http://localhost:$WEB_PORT    API docs: http://localhost:$API_PORT/docs    (Ctrl+C to stop)"

# If either server dies, stop the other too (bash 3.2 on macOS has no `wait -n`).
while kill -0 "$API_PID" 2>/dev/null && kill -0 "$WEB_PID" 2>/dev/null; do
  sleep 1
done
die "A server exited — see the log above."
