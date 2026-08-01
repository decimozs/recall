#!/bin/sh
set -eu

desktop_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
repo_dir=$(CDPATH= cd -- "$desktop_dir/.." && pwd)
target=$(rustc -vV | awk '/^host:/{print $2}')
bin_dir="$desktop_dir/src-tauri/binaries"
mkdir -p "$bin_dir"

bun build "$repo_dir/backend-bun/src/server.ts" --compile --outfile "$bin_dir/recall-backend-$target"
cargo build --manifest-path "$repo_dir/backend-native/Cargo.toml" --release
cp "$repo_dir/backend-native/target/release/recall-native-db" "$bin_dir/recall-native-db-$target"
chmod +x "$bin_dir/recall-backend-$target" "$bin_dir/recall-native-db-$target"

echo "Built Recall sidecars for $target"
