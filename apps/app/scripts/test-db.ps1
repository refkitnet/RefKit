# Local throwaway Postgres cluster for fast tests.
# Usage: .\scripts\test-db.ps1 start | stop | status | reset

param(
  [Parameter(Position = 0)]
  [ValidateSet("start", "stop", "status", "reset")]
  [string]$Action = "start"
)

$ErrorActionPreference = "Stop"

. "$PSScriptRoot\local-db.ps1"

$pgBin = "C:\Program Files\PostgreSQL\17\bin"
$appRoot = Split-Path -Parent $PSScriptRoot
$dataDir = Join-Path $appRoot ".pgtest"
$logFile = Join-Path $appRoot ".pgtest.log"
$port = $LocalDbPort
$dbName = $LocalDbName
$dbUser = $LocalDbUser

# Native postgres tools spawn child processes that inherit stdout, which
# makes plain PowerShell pipelines hang; Start-Process avoids that.
function Invoke-PgTool {
  param([string]$Exe, [string[]]$Arguments)

  $proc = Start-Process -FilePath (Join-Path $pgBin $Exe) -ArgumentList $Arguments -NoNewWindow -Wait -PassThru
  return $proc.ExitCode
}

function Test-Running {
  return (Invoke-PgTool "pg_ctl.exe" @("status", "-D", "`"$dataDir`"")) -eq 0
}

function Start-Cluster {
  if (-not (Test-Path (Join-Path $dataDir "PG_VERSION"))) {
    Write-Host "Initializing test cluster at $dataDir"
    $code = Invoke-PgTool "initdb.exe" @("-D", "`"$dataDir`"", "-U", $dbUser, "-A", "trust", "-E", "UTF8", "--no-locale")

    if ($code -ne 0) {
      throw "initdb failed with exit code $code"
    }
  }

  if (Test-Running) {
    Write-Host "Test cluster already running on port $port"
  }
  else {
    # Durability off: this cluster holds disposable test data only.
    $serverOpts = "-p $port -c listen_addresses=127.0.0.1 -c fsync=off -c synchronous_commit=off -c full_page_writes=off -c autovacuum=off"
    $code = Invoke-PgTool "pg_ctl.exe" @("start", "-D", "`"$dataDir`"", "-o", "`"$serverOpts`"", "-l", "`"$logFile`"", "-w")

    if ($code -ne 0) {
      throw "pg_ctl start failed with exit code $code (see $logFile)"
    }

    Write-Host "Test cluster started on port $port"
  }

  $exists = & "$pgBin\psql.exe" -h 127.0.0.1 -p $port -U $dbUser -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$dbName'"

  if ("$exists".Trim() -ne "1") {
    $code = Invoke-PgTool "createdb.exe" @("-h", "127.0.0.1", "-p", $port, "-U", $dbUser, $dbName)

    if ($code -ne 0) {
      throw "createdb failed with exit code $code"
    }

    Write-Host "Created database $dbName"
  }

  Write-Host "Applying migrations"
  Push-Location $appRoot
  try {
    $env:DATABASE_URL = $LocalDatabaseUrl
    npx drizzle-kit migrate

    if ($LASTEXITCODE -ne 0) {
      throw "drizzle-kit migrate failed with exit code $LASTEXITCODE"
    }
  }
  finally {
    Remove-Item Env:\DATABASE_URL -ErrorAction SilentlyContinue
    Pop-Location
  }

  Write-Host "Ready. DATABASE_URL=$LocalDatabaseUrl"
}

function Stop-Cluster {
  if (Test-Running) {
    Invoke-PgTool "pg_ctl.exe" @("stop", "-D", "`"$dataDir`"", "-m", "fast", "-w") | Out-Null
    Write-Host "Test cluster stopped"
  }
  else {
    Write-Host "Test cluster is not running"
  }
}

switch ($Action) {
  "start" { Start-Cluster }
  "stop" { Stop-Cluster }
  "status" {
    if (Test-Running) {
      Write-Host "Running on port $port"
    }
    else {
      Write-Host "Not running"
    }
  }
  "reset" {
    Stop-Cluster
    if (Test-Path $dataDir) {
      Remove-Item -Recurse -Force $dataDir
      Write-Host "Removed $dataDir"
    }
    Start-Cluster
  }
}
