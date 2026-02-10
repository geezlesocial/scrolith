# e2e_upload_test.ps1 - logs in, uploads tmp file, lists files
try {
  $loginBody = @{ email = 'admin@local.test'; password = 'adminpass' } | ConvertTo-Json
  $resp = Invoke-RestMethod -Uri 'http://localhost:5000/api/auth/login' -Method POST -ContentType 'application/json' -Body $loginBody -ErrorAction Stop
  if (-not $resp.token) { Write-Error 'Login failed: no token'; exit 2 }
  $token = $resp.token
  Write-Output "TOKEN:$token"
  Set-Content -Path .\token.txt -Value $token -Force
  Set-Content -Path .\tmp_upload.txt -Value 'e2e upload test' -Force
  Write-Output 'Uploading tmp_upload.txt...'
  $uploadRaw = curl.exe -s -X POST -H "Authorization: Bearer $token" -F "file=@tmp_upload.txt" http://localhost:5000/api/files/upload
  Write-Output "UPLOAD_RESPONSE: $uploadRaw"
  try { $upload = $uploadRaw | ConvertFrom-Json } catch { $upload = $null }
  if (-not $upload -or -not $upload.success) { Write-Error 'Upload failed'; Remove-Item -Path .\tmp_upload.txt -Force -ErrorAction SilentlyContinue; Remove-Item -Path .\token.txt -Force -ErrorAction SilentlyContinue; exit 2 }
  Write-Output "Upload succeeded: $($upload.data.id)"

  Write-Output '--- LIST ---'
  $listRaw = curl.exe -s -H "Authorization: Bearer $token" http://localhost:5000/api/files
  Write-Output "LIST_RESPONSE: $listRaw"
  try { $list = $listRaw | ConvertFrom-Json } catch { $list = $null }

  # Cleanup local artifacts
  Remove-Item -Path .\tmp_upload.txt -Force -ErrorAction SilentlyContinue
  Remove-Item -Path .\token.txt -Force -ErrorAction SilentlyContinue
  Write-Output 'Local temp files removed.'
} catch {
  Write-Error "Script error: $_"
  exit 1
}
