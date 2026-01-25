param(
  [string]$Port = '5000'
)

Write-Host "Starting dev server with REDIS_URL and GCOIN_TEST_WINDOWS..."
$env:REDIS_URL = 'redis://127.0.0.1:6379'
$env:GCOIN_TEST_WINDOWS = '1'
$env:PORT = $Port

# Move to project root (scripts folder is under project root)
Set-Location -LiteralPath (Resolve-Path "$PSScriptRoot\..")

Write-Host "Project root: $(Get-Location)"

npm run dev
