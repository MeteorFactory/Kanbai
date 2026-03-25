#!/usr/bin/env bash
set -euo pipefail

echo "==> Setting up RTK (Rust Token Killer)..."

# Step 1: Install RTK binary
if command -v rtk >/dev/null 2>&1; then
  echo "    RTK already installed: $(which rtk)"
  rtk --version 2>/dev/null || true
else
  echo "    Installing RTK..."

  if command -v brew >/dev/null 2>&1; then
    echo "    Using Homebrew..."
    brew install rtk
  else
    echo "    Using quick install script (curl)..."
    curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh

    # Ensure ~/.local/bin is in PATH for the rest of this script
    export PATH="$HOME/.local/bin:$PATH"
  fi

  # Verify installation
  if ! command -v rtk >/dev/null 2>&1; then
    echo "    [ERROR] RTK installation failed — binary not found in PATH."
    echo "    If installed via curl, add ~/.local/bin to your PATH:"
    echo '      echo '\''export PATH="$HOME/.local/bin:$PATH"'\'' >> ~/.zshrc'
    exit 1
  fi
fi

# Step 2: Verify it is the correct RTK (Token Killer, not Type Kit)
echo ""
echo "    Checking rtk version..."
rtk --version 2>/dev/null || true

if rtk gain >/dev/null 2>&1; then
  echo "    rtk gain: OK (correct RTK — Token Killer)"
else
  echo ""
  echo "    [WARNING] 'rtk gain' failed. You may have the wrong rtk (Rust Type Kit)."
  echo "    Uninstall with: cargo uninstall rtk"
  echo "    Then rerun this script."
  exit 1
fi

echo ""
echo "==> RTK setup complete!"
echo "    Binary: $(which rtk)"
echo "    Version: $(rtk --version 2>/dev/null || echo 'unknown')"
