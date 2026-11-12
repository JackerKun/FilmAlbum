#!/usr/bin/env bash
set -euo pipefail

cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo '启动 Film Album 需要 Node.js 22.13+ 和 npm。' >&2
  exit 1
fi

if ! node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 22 || (major === 22 && minor >= 13) ? 0 : 1)'; then
  echo '请将 Node.js 升级到 22.13 或更高版本。' >&2
  exit 1
fi

if ! npm ls --depth=0 --include=dev --silent >/dev/null 2>&1; then
  npm ci --include=dev --include=optional --no-audit --no-fund
fi

if [[ "$(uname -s)" == Darwin && -z "${ELECTRON_OVERRIDE_DIST_PATH:-}" ]]; then
  # Resolve Electron first so its runtime is installed even on the first launch.
  node -e 'require("electron")'
  electron_executable="$(node -p 'require("electron")')"
  electron_plist="$(dirname -- "$electron_executable")/../Info.plist"
  plutil -replace CFBundleName -string 'Film Album' "$electron_plist"
  plutil -replace CFBundleDisplayName -string 'Film Album' "$electron_plist"
fi

exec npm run desktop -- "$@"
