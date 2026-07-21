# Phase 21.1 — production Android App Bundle builder
# Usage (from C:\Projects\mobile):
#   powershell -ExecutionPolicy Bypass -File scripts\build-release-aab.ps1
$ErrorActionPreference = 'Stop'

$MobileRoot = Split-Path -Parent $PSScriptRoot
$GeezleRoot = Join-Path (Split-Path -Parent $MobileRoot) 'geezle'
$AndroidRoot = Join-Path $MobileRoot 'android'
$OutDir = Join-Path $MobileRoot 'release-artifacts\android-1.1.32'
$VersionCode = 42
$VersionName = '1.1.32'
$WebCommit = (git -C $GeezleRoot rev-parse --short HEAD 2>$null)
if (-not $WebCommit) { $WebCommit = 'unknown' }

# Production-only: never allow cleartext / CAP_SERVER_URL in release packaging
Remove-Item Env:CAP_SERVER_URL -ErrorAction SilentlyContinue
Remove-Item Env:CAP_ALLOW_CLEARTEXT -ErrorAction SilentlyContinue

# Force production Vite client flags (process.env wins over .env files)
$env:NODE_ENV = 'production'
$env:VITE_DEBUG = 'false'
$env:VITE_APP_ENV = 'production'
$env:VITE_APP_NAME = 'Scrolith'
$env:VITE_APP_URL = 'https://scrolith.com'
$env:VITE_PUBLIC_APP_URL = 'https://scrolith.com'
$env:VITE_PUBLIC_APP_DOMAIN = 'scrolith.com'
$env:VITE_APP_DOMAIN = 'scrolith.com'
$env:VITE_LOG_LEVEL = 'error'
$env:VITE_SOCKET_TRACE = 'false'
$env:VITE_MESSAGES_TRACE_DEBUG = 'false'
$env:VITE_ALLOW_LOCAL_API_IN_PROD = 'false'
# Match production web / Cloud Run FE (Phase 29.7)
$env:VITE_API_URL = 'https://api.scrolith.com/api'
$env:VITE_API_BASE_URL = 'https://api.scrolith.com/api'
$env:VITE_BACKEND_URL = 'https://api.scrolith.com'

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$LogDir = Join-Path $OutDir 'logs'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

# npm/vite write warnings to stderr; do not treat native stderr as terminating errors.
$prevEap = $ErrorActionPreference
$ErrorActionPreference = 'Continue'

Write-Host "==> Building production web assets (geezle @ $WebCommit)"
Push-Location $GeezleRoot
cmd /c "npm run build > `"$LogDir\frontend-build.log`" 2>&1"
$feCode = $LASTEXITCODE
Pop-Location
if ($feCode -ne 0) {
  Get-Content (Join-Path $LogDir 'frontend-build.log') -Tail 40
  throw "geezle build failed (exit $feCode)"
}

Write-Host "==> Capacitor sync android"
Push-Location $MobileRoot
cmd /c "npx cap sync android > `"$LogDir\cap-sync.log`" 2>&1"
$capCode = $LASTEXITCODE
Pop-Location
if ($capCode -ne 0) {
  Get-Content (Join-Path $LogDir 'cap-sync.log') -Tail 40
  throw "cap sync failed (exit $capCode)"
}

Write-Host "==> Gradle clean bundleRelease"
$env:JAVA_HOME = if (Test-Path 'C:\Program Files\Microsoft\jdk-21.0.11.10-hotspot') {
  'C:\Program Files\Microsoft\jdk-21.0.11.10-hotspot'
} elseif ($env:JAVA_HOME) {
  $env:JAVA_HOME
} else {
  'C:\Program Files\Android\Android Studio\jbr'
}
$env:Path = "$env:JAVA_HOME\bin;$env:Path"

Push-Location $AndroidRoot
cmd /c "gradlew.bat clean bundleRelease --no-daemon > `"$LogDir\gradle-bundle-release.log`" 2>&1"
$gradleCode = $LASTEXITCODE
Pop-Location
$ErrorActionPreference = $prevEap
if ($gradleCode -ne 0) {
  Get-Content (Join-Path $LogDir 'gradle-bundle-release.log') -Tail 80
  throw "gradle bundleRelease failed (exit $gradleCode)"
}

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
  webCommit = $WebCommit
  minifyEnabled = $true
  shrinkResources = $true
  phase = '29.7'
  targetSdk = 36
  compileSdk = 36
  minSdk = 24
} | ConvertTo-Json -Depth 4
Set-Content -Encoding utf8 (Join-Path $OutDir 'artifact-metadata.json') $meta

Write-Host "AAB: $AabDest"
Write-Host "SHA-256: $sha256"
Write-Host "Size: $size"
Set-Content -Encoding ascii (Join-Path $MobileRoot '.latest_aab_path.txt') $AabDest
