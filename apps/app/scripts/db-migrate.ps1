# Run Drizzle migrations against local Postgres.
# Usage: npm run db:migrate

$ErrorActionPreference = "Stop"

. "$PSScriptRoot\local-db.ps1"

$appRoot = Split-Path -Parent $PSScriptRoot

Write-Host "Starting local Postgres for migrate..."
& "$PSScriptRoot\test-db.ps1" start

if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

$env:DATABASE_URL = $LocalDatabaseUrl
Write-Host "Using local DATABASE_URL for migrate"

Push-Location $appRoot
try {
  npx drizzle-kit migrate
  exit $LASTEXITCODE
}
finally {
  Pop-Location
}
