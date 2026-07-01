#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

ensure_node_20() {
  if command -v node >/dev/null 2>&1; then
    local major
    major="$(node -p "process.versions.node.split('.')[0]")"
    if [ "$major" -ge 20 ]; then
      return 0
    fi
  fi

  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck disable=SC1090
    . "$NVM_DIR/nvm.sh"
    nvm use 2>/dev/null || nvm use 20
    return 0
  fi

  echo "Erro: Node 20+ é necessário. Instale com: nvm install 20 && nvm use 20" >&2
  exit 1
}

ensure_node_20

echo "Node $(node -v)"
npm install
npm run package

name="$(node -p "require('./package.json').name")"
version="$(node -p "require('./package.json').version")"
vsix="$(pwd)/${name}-${version}.vsix"

echo ""
echo "VSIX pronto: ${vsix}"
echo "No Cursor: Cmd+Shift+P → Extensions: Install from VSIX..."
