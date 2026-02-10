#!/usr/bin/env pwsh
Write-Host "Starting Postgres via docker-compose..."
docker-compose up -d db

Write-Host "Waiting for Postgres to initialize inside the container (pg_isready)..."
$max = 60
$wait = 0
while ($wait -lt $max) {
  docker-compose exec -T db pg_isready -U user -d scrolith_test > $null 2>&1
  if ($LASTEXITCODE -eq 0) { break }
  Start-Sleep -Seconds 1
  $wait++
}
if ($wait -ge $max) {
  Write-Error "Postgres did not become ready in time."
  docker-compose down -v
  exit 1
}

Write-Host "Setting DATABASE_URL for this session..."
$env:DATABASE_URL = "postgresql://user:pass@localhost:5432/scrolith_test"

Write-Host "Running migrations and generating Prisma client (with retries)..."
$maxAttempts = 30
$attempt = 0
$migrated = $false
while ($attempt -lt $maxAttempts) {
  Write-Host "Migration attempt: $($attempt + 1)/$maxAttempts"
  & .\node_modules\.bin\prisma migrate deploy
  if ($LASTEXITCODE -ne 0) { Start-Sleep -Seconds 1; $attempt++; continue }
  & .\node_modules\.bin\prisma generate
  if ($LASTEXITCODE -eq 0) { $migrated = $true; break }
  Start-Sleep -Seconds 2
  $attempt++
}
if (-not $migrated) {
  Write-Error "Migrations failed after $maxAttempts attempts."
  docker-compose down -v
  exit 1
}

Write-Host "Running seed (if available)..."
& npm run seed
if ($LASTEXITCODE -ne 0) { Write-Host "seed script failed or not present; continuing" }

Write-Host "Running tests..."
npm test
$testExit = $LASTEXITCODE

Write-Host "Tearing down docker-compose..."
docker-compose down -v

exit $testExit
