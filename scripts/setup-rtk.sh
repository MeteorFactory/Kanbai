#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
VENDOR_DIR="$PROJECT_ROOT/vendor/rtk"

echo "==> Setting up RTK..."

# Clone if not already present
if [ ! -d "$VENDOR_DIR" ]; then
  echo "    Cloning RTK repository..."
  mkdir -p "$PROJECT_ROOT/vendor"
  git clone https://github.com/rtk-ai/rtk.git "$VENDOR_DIR"
else
  echo "    RTK already cloned, pulling latest..."
  cd "$VENDOR_DIR" && git pull && cd "$PROJECT_ROOT"
fi

echo "==> RTK setup complete!"
