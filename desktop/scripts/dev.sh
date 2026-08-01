#!/bin/sh
set -eu

backend_pid=""
desktop_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
repo_dir=$(CDPATH= cd -- "$desktop_dir/.." && pwd)
cleanup() {
  if [ -n "$backend_pid" ]; then
    kill "$backend_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

bun run --cwd "$repo_dir/backend/bun" start &
backend_pid=$!
bun run --cwd "$desktop_dir/ui" dev --host 127.0.0.1
