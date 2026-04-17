param(
  [string]$BaseUrl = $env:SCROLITH_BASE_URL,
  [string]$AdminToken = $env:SCROLITH_ADMIN_TOKEN
)

$ErrorActionPreference = 'Stop'

if (-not $BaseUrl) {
  $BaseUrl = 'http://127.0.0.1:5000'
}

$BaseUrl = $BaseUrl.TrimEnd('/')
$checks = New-Object System.Collections.Generic.List[object]

function Invoke-FoundationCheck {
  param(
    [string]$Name,
    [string]$Path,
    [hashtable]$Headers = @{},
    [int[]]$AllowedStatus = @(200)
  )

  $uri = "$BaseUrl$Path"
  $started = Get-Date
  try {
    $response = Invoke-WebRequest -Uri $uri -Headers $Headers -UseBasicParsing -TimeoutSec 30
    $elapsed = [int]((Get-Date) - $started).TotalMilliseconds
    $ok = $AllowedStatus -contains [int]$response.StatusCode
    $checks.Add([pscustomobject]@{
      name = $Name
      path = $Path
      status = [int]$response.StatusCode
      ok = $ok
      elapsedMs = $elapsed
    })
    if (-not $ok) {
      throw "$Name returned HTTP $($response.StatusCode)"
    }
  } catch {
    $status = 0
    if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
      $status = [int]$_.Exception.Response.StatusCode
    }
    $checks.Add([pscustomobject]@{
      name = $Name
      path = $Path
      status = $status
      ok = $false
      elapsedMs = [int]((Get-Date) - $started).TotalMilliseconds
      error = $_.Exception.Message
    })
    throw
  }
}

Invoke-FoundationCheck -Name 'platform health' -Path '/api/health'
Invoke-FoundationCheck -Name 'search health' -Path '/api/search/health'
Invoke-FoundationCheck -Name 'search suggestions' -Path '/api/search/suggestions?q=scrolith&limit=5'
Invoke-FoundationCheck -Name 'unified search' -Path '/api/search/unified?q=scrolith&limit=10&perType=3'
Invoke-FoundationCheck -Name 'search recommendations' -Path '/api/search/recommendations'

if ($AdminToken) {
  $adminHeaders = @{ Authorization = "Bearer $AdminToken" }
  Invoke-FoundationCheck -Name 'admin realtime summary' -Path '/api/admin/realtime/summary' -Headers $adminHeaders
  Invoke-FoundationCheck -Name 'admin config rollback snapshots' -Path '/api/admin/config/snapshots' -Headers $adminHeaders -AllowedStatus @(200, 404)
  Invoke-FoundationCheck -Name 'admin system backup catalog' -Path '/api/admin/system-backups/catalog' -Headers $adminHeaders -AllowedStatus @(200, 404)
} else {
  $checks.Add([pscustomobject]@{
    name = 'admin gated checks'
    path = 'SCROLITH_ADMIN_TOKEN'
    status = 0
    ok = $true
    elapsedMs = 0
    note = 'Skipped because no admin token was provided.'
  })
}

$failed = @($checks | Where-Object { -not $_.ok })
$checks | ConvertTo-Json -Depth 5

if ($failed.Count -gt 0) {
  exit 1
}
