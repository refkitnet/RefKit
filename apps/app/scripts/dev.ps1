# Start Next.js dev with local Postgres (default for fast local development).
# Optional Windows helper. The public npm dev command starts Next.js directly.

param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$NextArgs
)

$ErrorActionPreference = "Stop"

. "$PSScriptRoot\local-db.ps1"

$appRoot = Split-Path -Parent $PSScriptRoot

Write-Host "Starting local Postgres for dev..."
& "$PSScriptRoot\test-db.ps1" start

if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

$env:DATABASE_URL = $LocalDatabaseUrl
Write-Host "Using local DATABASE_URL for dev"

$env:APP_URL = "http://localhost:3000"
Write-Host "Using local APP_URL for dev"

Push-Location $appRoot
try {
  if ($NextArgs.Length -gt 0) {
    & npx next dev @NextArgs
  }
  else {
    & npx next dev
  }

  exit $LASTEXITCODE
}
finally {
  Pop-Location
}
