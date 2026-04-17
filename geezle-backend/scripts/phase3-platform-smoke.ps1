param(
  [string]$BaseUrl = $env:SCROLITH_BASE_URL,
  [string]$AuthToken = $env:SCROLITH_AUTH_TOKEN
)

$ErrorActionPreference = 'Stop'

if (-not $BaseUrl) {
  $BaseUrl = 'http://127.0.0.1:5000'
}

$BaseUrl = $BaseUrl.TrimEnd('/')
$checks = New-Object System.Collections.Generic.List[object]

function Invoke-Phase3Check {
  param(
    [string]$Name,
    [string]$Method = 'GET',
    [string]$Path,
    [hashtable]$Headers = @{},
    [object]$Body = $null,
    [int[]]$AllowedStatus = @(200)
  )

  $uri = "$BaseUrl$Path"
  $started = Get-Date
  try {
    $args = @{
      Method = $Method
      Uri = $uri
      Headers = $Headers
      UseBasicParsing = $true
      TimeoutSec = 60
    }
    if ($null -ne $Body) {
      $args.ContentType = 'application/json'
      $args.Body = ($Body | ConvertTo-Json -Depth 12)
    }
    $response = Invoke-WebRequest @args
    $elapsed = [int]((Get-Date) - $started).TotalMilliseconds
    $ok = $AllowedStatus -contains [int]$response.StatusCode
    $checks.Add([pscustomobject]@{
      name = $Name
      method = $Method
      path = $Path
      status = [int]$response.StatusCode
      ok = $ok
      elapsedMs = $elapsed
      bytes = $response.Content.Length
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
      method = $Method
      path = $Path
      status = $status
      ok = $false
      elapsedMs = [int]((Get-Date) - $started).TotalMilliseconds
      error = $_.Exception.Message
    })
    throw
  }
}

Invoke-Phase3Check -Name 'platform health' -Path '/api/health'

if ($AuthToken) {
  $headers = @{ Authorization = "Bearer $AuthToken" }
  Invoke-Phase3Check -Name 'phase3 briefing' -Path '/api/phase3/briefing' -Headers $headers
  Invoke-Phase3Check -Name 'enterprise workspaces' -Path '/api/phase3/workspaces?limit=6' -Headers $headers
  Invoke-Phase3Check -Name 'creator commerce campaigns' -Path '/api/phase3/creator-commerce/campaigns?limit=6' -Headers $headers
  Invoke-Phase3Check -Name 'payout orchestration' -Path '/api/phase3/payouts/orchestration?limit=6' -Headers $headers
  Invoke-Phase3Check -Name 'global localization' -Path '/api/phase3/localization/global' -Headers $headers
} else {
  $checks.Add([pscustomobject]@{
    name = 'authenticated phase3 checks'
    method = 'AUTH'
    path = 'SCROLITH_AUTH_TOKEN'
    status = 0
    ok = $true
    elapsedMs = 0
    note = 'Skipped Phase 3 authenticated checks because no auth token was provided.'
  })
}

$failed = @($checks | Where-Object { -not $_.ok })
$checks | ConvertTo-Json -Depth 6
if ($failed.Count -gt 0) {
  exit 1
}
