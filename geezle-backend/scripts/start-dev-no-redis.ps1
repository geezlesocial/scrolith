param(
  [string]$Port = '5000'
)

Write-Host "Starting dev server with GCOIN_TEST_WINDOWS only..."
$env:GCOIN_TEST_WINDOWS = '1'
$env:PORT = $Port

Set-Location -LiteralPath (Resolve-Path "$PSScriptRoot\..")
Write-Host "Project root: $(Get-Location)"

npm run dev
