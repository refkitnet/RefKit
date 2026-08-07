# Seed fixture data into the local disposable Postgres database.
# Usage: npm run db:seed
#        npm run db:seed -- --reset

param(
  [switch]$Reset,
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$SeedArgs
)

$ErrorActionPreference = "Stop"

. "$PSScriptRoot\local-db.ps1"

$appRoot = Split-Path -Parent $PSScriptRoot

$resolvedSeedArgs = @()
if ($Reset) {
  $resolvedSeedArgs += "--reset"
}
if ($SeedArgs) {
  $resolvedSeedArgs += $SeedArgs
}

Write-Host "Starting local Postgres for seed..."
& "$PSScriptRoot\test-db.ps1" start

if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

$env:DATABASE_URL = $LocalDatabaseUrl
Write-Host "Using local DATABASE_URL for seed"

Push-Location $appRoot
try {
  Write-Host "Running migrations..."
  npm run db:migrate

  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
}
finally {
  Pop-Location
}

Push-Location $appRoot
try {
  if ($resolvedSeedArgs.Length -gt 0) {
    node scripts/db-seed.mjs @resolvedSeedArgs
  }
  else {
    node scripts/db-seed.mjs
  }

  exit $LASTEXITCODE
}
finally {
  Pop-Location
}
