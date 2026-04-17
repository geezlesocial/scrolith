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

function Invoke-Phase2Check {
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
      TimeoutSec = 45
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

Invoke-Phase2Check -Name 'platform health' -Path '/api/health'
Invoke-Phase2Check -Name 'discovery v2 feed' -Path '/api/discovery/v2/feed?mode=for_you&limit=6'
Invoke-Phase2Check -Name 'discovery v2 search' -Path '/api/discovery/v2/search?q=scrolith&limit=6'
Invoke-Phase2Check -Name 'discovery v2 briefing' -Path '/api/discovery/v2/briefing'

if ($AuthToken) {
  $headers = @{ Authorization = "Bearer $AuthToken" }
  Invoke-Phase2Check -Name 'trust graph me' -Path '/api/trust/graph/me' -Headers $headers
  Invoke-Phase2Check -Name 'collaboration rooms' -Path '/api/collaboration/rooms' -Headers $headers
  Invoke-Phase2Check `
    -Name 'scrolitha work os plan' `
    -Method 'POST' `
    -Path '/api/scrolitha/work-os/plan' `
    -Headers $headers `
    -Body @{ goal = 'Launch a trusted Scrolith collaboration workflow'; context = @{ smoke = $true } }
} else {
  $checks.Add([pscustomobject]@{
    name = 'authenticated phase2 checks'
    method = 'AUTH'
    path = 'SCROLITH_AUTH_TOKEN'
    status = 0
    ok = $true
    elapsedMs = 0
    note = 'Skipped trust graph, collaboration, and Work OS checks because no auth token was provided.'
  })
}

$failed = @($checks | Where-Object { -not $_.ok })
$checks | ConvertTo-Json -Depth 6
if ($failed.Count -gt 0) {
  exit 1
}
