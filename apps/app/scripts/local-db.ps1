# Shared local Postgres settings for dev, tests, migrations, and seeds.

$LocalDbPort = 54329
$LocalDbName = "refkit_test"
$LocalDbUser = "postgres"
$LocalDatabaseUrl = "postgresql://${LocalDbUser}@127.0.0.1:${LocalDbPort}/${LocalDbName}"

function Test-IsLocalDatabaseUrl {
  param([string]$Url)

  if (-not $Url) {
    return $false
  }

  return $Url -match "127\.0\.0\.1:54329|localhost:54329"
}
