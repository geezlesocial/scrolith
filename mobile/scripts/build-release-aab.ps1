# Phase 20.5 — production Android App Bundle builder
# Usage (from C:\Projects\mobile):
#   powershell -ExecutionPolicy Bypass -File scripts\build-release-aab.ps1
$ErrorActionPreference = 'Stop'

$MobileRoot = Split-Path -Parent $PSScriptRoot
$GeezleRoot = Join-Path (Split-Path -Parent $MobileRoot) 'geezle'
$AndroidRoot = Join-Path $MobileRoot 'android'
$OutDir = Join-Path $MobileRoot 'release-artifacts\android-1.1.19'
$VersionCode = 29
$VersionName = '1.1.19'

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

Write-Host "==> Building production web assets"
Push-Location $GeezleRoot
npm run build
if ($LASTEXITCODE -ne 0) { throw "geezle build failed" }
Pop-Location

Write-Host "==> Capacitor sync android"
Push-Location $MobileRoot
npx cap sync android
if ($LASTEXITCODE -ne 0) { throw "cap sync failed" }
Pop-Location

Write-Host "==> Gradle bundleRelease"
$env:JAVA_HOME = if (Test-Path 'C:\Program Files\Microsoft\jdk-21.0.11.10-hotspot') {
  'C:\Program Files\Microsoft\jdk-21.0.11.10-hotspot'
} elseif ($env:JAVA_HOME) {
  $env:JAVA_HOME
} else {
  'C:\Program Files\Android\Android Studio\jbr'
}
$env:Path = "$env:JAVA_HOME\bin;$env:Path"

Push-Location $AndroidRoot
.\gradlew.bat clean bundleRelease --no-daemon
if ($LASTEXITCODE -ne 0) { throw "gradle bundleRelease failed" }
Pop-Location

$AabSrc = Join-Path $AndroidRoot 'app\build\outputs\bundle\release\app-release.aab'
if (-not (Test-Path $AabSrc)) { throw "AAB not found at $AabSrc" }

$AabName = "Scrolith-$VersionName-$VersionCode-release.aab"
$AabDest = Join-Path $OutDir $AabName
Copy-Item -Force $AabSrc $AabDest

$MappingSrc = Join-Path $AndroidRoot 'app\build\outputs\mapping\release\mapping.txt'
if (Test-Path $MappingSrc) {
  Copy-Item -Force $MappingSrc (Join-Path $OutDir 'mapping.txt')
}

$sha256 = (Get-FileHash -Algorithm SHA256 $AabDest).Hash.ToLowerInvariant()
$sha1 = (Get-FileHash -Algorithm SHA1 $AabDest).Hash.ToLowerInvariant()
$md5 = (Get-FileHash -Algorithm MD5 $AabDest).Hash.ToLowerInvariant()
$size = (Get-Item $AabDest).Length

@"
$sha256  $AabName
"@ | Set-Content -Encoding ascii (Join-Path $OutDir 'SHA256SUMS.txt')
@"
$sha1  $AabName
"@ | Set-Content -Encoding ascii (Join-Path $OutDir 'SHA1SUMS.txt')
@"
$md5  $AabName
"@ | Set-Content -Encoding ascii (Join-Path $OutDir 'MD5SUMS.txt')

$meta = @{
  applicationId = 'com.scrolith.scrolith'
  versionCode = $VersionCode
  versionName = $VersionName
  aab = $AabDest
  sizeBytes = $size
  sha256 = $sha256
  sha1 = $sha1
  md5 = $md5
  builtAt = (Get-Date).ToString('o')
  javaHome = $env:JAVA_HOME
} | ConvertTo-Json -Depth 4
Set-Content -Encoding utf8 (Join-Path $OutDir 'artifact-metadata.json') $meta

Write-Host "AAB: $AabDest"
Write-Host "SHA-256: $sha256"
Write-Host "Size: $size"
Write-Host $AabDest | Set-Content (Join-Path $MobileRoot '.latest_aab_path.txt')
