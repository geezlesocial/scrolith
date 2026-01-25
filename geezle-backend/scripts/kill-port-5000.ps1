$port = 5000
$conns = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
if ($conns) {
  $pids = $conns | Select-Object -ExpandProperty OwningProcess -Unique
  Write-Host "Found PIDs: $($pids -join ',')"
  foreach ($pid in $pids) {
    try {
      Stop-Process -Id $pid -Force -ErrorAction Stop
      Write-Host "Killed PID $pid"
    } catch {
      Write-Host ('Failed to kill ' + $pid + ': ' + $_)
    }
  }
} else {
  Write-Host "No process listening on port $port"
}
