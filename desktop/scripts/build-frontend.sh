#!/bin/sh
set -eu

desktop_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
repo_dir=$(CDPATH= cd -- "$desktop_dir/.." && pwd)
export VITE_API_BASE_URL="http://127.0.0.1:3000"
bun run --cwd "$desktop_dir/ui" build
