param(
  [string]$Bucket = "downloads.scrolith.com",
  [string]$ChannelPath = "desktop/win"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$packageJsonPath = Join-Path $repoRoot "package.json"
$distDir = Join-Path $repoRoot "desktop-dist"

if (-not (Test-Path -LiteralPath $packageJsonPath)) {
  throw "package.json not found at $packageJsonPath"
}

if (-not (Test-Path -LiteralPath $distDir)) {
  throw "desktop-dist not found at $distDir. Run npm run desktop:dist first."
}

$packageJson = Get-Content -LiteralPath $packageJsonPath -Raw | ConvertFrom-Json
$version = [string]$packageJson.version
if ([string]::IsNullOrWhiteSpace($version)) {
  throw "Could not resolve package version from package.json"
}

$nsisName = "Scrolith-Desktop-Setup-$version-x64.exe"
$portableName = "Scrolith-Desktop-Portable-$version-x64.exe"
$blockmapName = "$nsisName.blockmap"
$latestYmlName = "latest.yml"

$requiredFiles = @(
  (Join-Path $distDir $nsisName),
  (Join-Path $distDir $portableName),
  (Join-Path $distDir $blockmapName),
  (Join-Path $distDir $latestYmlName)
)

foreach ($file in $requiredFiles) {
  if (-not (Test-Path -LiteralPath $file)) {
    throw "Required desktop artifact missing: $file"
  }
}

$baseUri = "gs://$Bucket/$ChannelPath"

Write-Host "Publishing Scrolith desktop release $version to $baseUri"

gcloud storage cp (Join-Path $distDir $nsisName) "$baseUri/$nsisName"
gcloud storage cp (Join-Path $distDir $blockmapName) "$baseUri/$blockmapName"
gcloud storage cp (Join-Path $distDir $portableName) "$baseUri/$portableName"
gcloud storage cp (Join-Path $distDir $latestYmlName) "$baseUri/latest.yml"
gcloud storage cp (Join-Path $distDir $nsisName) "$baseUri/Scrolith-Desktop-Setup-latest-x64.exe"
gcloud storage cp (Join-Path $distDir $portableName) "$baseUri/Scrolith-Desktop-Portable-latest-x64.exe"

gcloud storage objects update "$baseUri/latest.yml" --cache-control="no-cache, max-age=0, must-revalidate"
gcloud storage objects update "$baseUri/Scrolith-Desktop-Setup-latest-x64.exe" --cache-control="public, max-age=300"
gcloud storage objects update "$baseUri/Scrolith-Desktop-Portable-latest-x64.exe" --cache-control="public, max-age=300"
gcloud storage objects update "$baseUri/$nsisName" --cache-control="public, max-age=31536000, immutable"
gcloud storage objects update "$baseUri/$blockmapName" --cache-control="public, max-age=31536000, immutable"
gcloud storage objects update "$baseUri/$portableName" --cache-control="public, max-age=31536000, immutable"

Write-Host ""
Write-Host "Desktop release published:"
Write-Host "  Installer: https://storage.googleapis.com/$Bucket/$ChannelPath/Scrolith-Desktop-Setup-latest-x64.exe"
Write-Host "  Portable:  https://storage.googleapis.com/$Bucket/$ChannelPath/Scrolith-Desktop-Portable-latest-x64.exe"
Write-Host "  Feed:      https://storage.googleapis.com/$Bucket/$ChannelPath/latest.yml"
