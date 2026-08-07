# Open Drizzle Studio against local Postgres.
# Usage: npm run db:studio

$ErrorActionPreference = "Stop"

. "$PSScriptRoot\local-db.ps1"

$appRoot = Split-Path -Parent $PSScriptRoot

Write-Host "Starting local Postgres for studio..."
& "$PSScriptRoot\test-db.ps1" start

if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

$env:DATABASE_URL = $LocalDatabaseUrl
Write-Host "Using local DATABASE_URL for studio"

Push-Location $appRoot
try {
  npx drizzle-kit studio
  exit $LASTEXITCODE
}
finally {
  Pop-Location
}
