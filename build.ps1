# Native Windows alternative to build.sh (no Git Bash required).
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Install Node.js 22.13+ first.' }
& node -e 'const [a,b]=process.versions.node.split(".").map(Number);if(a<22||(a===22&&b<13)){console.error("Node.js 22.13+ required");process.exit(1)}'
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
if (($args -contains '--plan') -or ($args -contains '--help') -or ($args -contains '-h')) {
  & node scripts/build.mjs @args
  exit $LASTEXITCODE
}
if (-not (Test-Path 'node_modules/electron-builder') -or -not (Test-Path 'node_modules/electron/package.json')) {
  & npm.cmd ci --include=optional --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
& node scripts/build.mjs @args
exit $LASTEXITCODE
