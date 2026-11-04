#!/usr/bin/env bash
# macOS / Git Bash on Windows. All build logic lives in the portable Node driver.
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo 'Film Album build requires Node.js 22.13+ and npm 10+.' >&2
  exit 1
fi
node -e 'const [a,b]=process.versions.node.split(".").map(Number);if(a<22||(a===22&&b<13)){console.error("Node.js 22.13+ required");process.exit(1)}'
case "${1:-all}" in
  -h|--help|help) node scripts/build.mjs --help; exit 0 ;;
esac
for argument in "$@"; do
  if [[ "$argument" == "--plan" ]]; then node scripts/build.mjs "$@"; exit 0; fi
done
if [[ ! -d node_modules/electron-builder || ! -f node_modules/electron/package.json ]]; then
  npm ci --include=optional --no-audit --no-fund
fi
node scripts/build.mjs "$@"
