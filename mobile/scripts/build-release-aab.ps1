# Production Android App Bundle builder
# Usage (from C:\Projects\mobile):
#   powershell -ExecutionPolicy Bypass -File scripts\build-release-aab.ps1
$ErrorActionPreference = 'Stop'

$MobileRoot = Split-Path -Parent $PSScriptRoot
$DefaultGeezleRoot = Join-Path (Split-Path -Parent $MobileRoot) 'geezle'
$GeezleRoot = if ($env:SCROLITH_RELEASE_GEEZLE_ROOT) {
  (Resolve-Path -LiteralPath $env:SCROLITH_RELEASE_GEEZLE_ROOT).Path
} else {
  $DefaultGeezleRoot
}
$AndroidRoot = Join-Path $MobileRoot 'android'
$OutDir = Join-Path $MobileRoot 'release-artifacts\android-1.1.98'
$VersionCode = 108
$VersionName = '1.1.98'
$WebCommit = (git -C $GeezleRoot rev-parse HEAD 2>$null)
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
$env:VITE_FORCE_MOBILE_API_OVERRIDE = 'false'
$env:VITE_MOBILE_API_URL = 'https://api.scrolith.com/api'
$env:VITE_MOBILE_API_BASE_URL = 'https://api.scrolith.com/api'
$env:VITE_SCROLITH_MOBILE_APP = 'true'
# Match production web / Cloud Run FE (Phase 29.7)
$env:VITE_API_URL = 'https://api.scrolith.com/api'
$env:VITE_API_BASE_URL = 'https://api.scrolith.com/api'
$env:VITE_BACKEND_URL = 'https://api.scrolith.com'
# Phase 1 Instant Graph is compiled into the candidate binary but remains
# remotely gated by SCROLITH_INSTANT_GRAPH_ENABLED and rollout percent on Azure.
$env:VITE_INSTANT_GRAPH_ENABLED = 'true'
$env:VITE_NATIVE_PROD_API_URL = 'https://api.scrolith.com/api'

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$LogDir = Join-Path $OutDir 'logs'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$ReleaseWebDir = Join-Path $OutDir 'web-dist'
$RelativeReleaseWebDir = 'release-artifacts/android-1.1.98/web-dist'
$env:SCROLITH_CAPACITOR_WEB_DIR = $RelativeReleaseWebDir

# npm/vite write warnings to stderr; do not treat native stderr as terminating errors.
$prevEap = $ErrorActionPreference
$ErrorActionPreference = 'Continue'

Write-Host "==> Building production web assets (geezle @ $WebCommit)"
$GeezleEnvLocal = Join-Path $GeezleRoot '.env.local'
$GeezleEnvLocalDisabled = Join-Path $GeezleRoot ".env.local.release-disabled.$PID"
if (Test-Path -LiteralPath $GeezleEnvLocal) {
  Move-Item -LiteralPath $GeezleEnvLocal -Destination $GeezleEnvLocalDisabled
}
Push-Location $GeezleRoot
try {
  cmd /c "npm run build > `"$LogDir\frontend-build.log`" 2>&1"
  $feCode = $LASTEXITCODE
} finally {
  Pop-Location
  if (Test-Path -LiteralPath $GeezleEnvLocalDisabled) {
    Move-Item -LiteralPath $GeezleEnvLocalDisabled -Destination $GeezleEnvLocal
  }
}
if ($feCode -ne 0) {
  Get-Content (Join-Path $LogDir 'frontend-build.log') -Tail 40
  throw "geezle build failed (exit $feCode)"
}

$GeezleDist = Join-Path $GeezleRoot 'dist'
if (-not (Test-Path -LiteralPath $GeezleDist)) {
  throw "geezle dist missing after production build: $GeezleDist"
}
if (Test-Path -LiteralPath $ReleaseWebDir) {
  $resolvedReleaseWebDir = (Resolve-Path -LiteralPath $ReleaseWebDir).Path
  $resolvedOutDir = (Resolve-Path -LiteralPath $OutDir).Path
  if (-not $resolvedReleaseWebDir.StartsWith($resolvedOutDir, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to clear web assets outside release output: $resolvedReleaseWebDir"
  }
  Remove-Item -LiteralPath $ReleaseWebDir -Recurse -Force
}
Copy-Item -LiteralPath $GeezleDist -Destination $ReleaseWebDir -Recurse -Force

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
  phase = 'native-shell-phase2-bridge-and-navigation-pilot-1.1.98'
  targetSdk = 36
  compileSdk = 36
  minSdk = 24
  productionBackendRevision = 'ca-scrolith-backend--public-hiring-fix-475c3b603'
  productionFrontendRevision = 'ca-scrolith-frontend--public-hiring-fix-abcbc1c0'
  productionApi = 'https://api.scrolith.com'
  productionAppUrl = 'https://scrolith.com'
  googlePlayUploadPerformed = $false
} | ConvertTo-Json -Depth 4
Set-Content -Encoding utf8 (Join-Path $OutDir 'artifact-metadata.json') $meta

# Post-build validation: require production API and reject candidate Cloud Run tags.
# Note: bundled host-detection helpers may mention localhost/10.0.2.2 as deny-list
# strings; that is intentional safety code, not a production API target.
$indexJs = Get-ChildItem -Path (Join-Path $GeezleRoot 'dist\assets') -Filter 'index-*.js' -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $indexJs) { throw 'dist/assets/index-*.js missing after production build' }
$js = Get-Content -Raw -LiteralPath $indexJs.FullName
if ($js -notmatch 'https://api\.scrolith\.com') {
  throw "Production API host https://api.scrolith.com not found in $($indexJs.Name)"
}
if ($js -notmatch 'https://scrolith\.com') {
  throw "Production app URL https://scrolith.com not found in $($indexJs.Name)"
}
if ($js -match 'msg-enh-|---scrolith-backend-|---scrolith-frontend-|scrolith-frontend-\d|a\.run\.app/api') {
  throw "Forbidden candidate/run.app API endpoint marker found in $($indexJs.Name)"
}
if ($js -match 'VITE_ALLOW_LOCAL_API_IN_PROD["'']?\s*:\s*["'']?true') {
  throw 'VITE_ALLOW_LOCAL_API_IN_PROD must not be true in production bundle'
}
Write-Host "==> Production endpoint validation PASS ($($indexJs.Name))"

Write-Host "AAB: $AabDest"
Write-Host "SHA-256: $sha256"
Write-Host "Size: $size"
Set-Content -Encoding ascii (Join-Path $MobileRoot '.latest_aab_path.txt') $AabDest
