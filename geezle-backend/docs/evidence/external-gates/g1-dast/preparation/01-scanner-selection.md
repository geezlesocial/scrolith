# G1 scanner selection — preparation only

**Status: PREPARATION ONLY — DOES NOT AUTHORIZE DAST.** No ZAP binary/container was executed and no Scrolith endpoint was contacted.

## Selected artifact

| Field | Recorded value |
|---|---|
| Family / core | OWASP ZAP stable / 2.17.0 (versioned-tag identity; see limitation) |
| Registry reference | `ghcr.io/zaproxy/zaproxy:stable` |
| Immutable OCI index digest | `sha256:781a2bdaea47324e7bab583e2263f21d257b0aee61ed51521a5be45f5f5081ef` |
| Linux amd64 child manifest | `sha256:71db37cd5b75663b35758d10aaec05bf6fbac23f5020e3046c70e628a5f84efa` |
| Linux arm64 child manifest | `sha256:05cbf4cab5d2fdaef55b0cd0b586f22d0ce4f75e0995f3cea2db23afbbdfd2f8` |
| Metadata observation time | `2026-10-01T16:03:21Z` (read-only GHCR OCI metadata recheck) |
| Identity basis | GHCR `stable` and `2.17.0` returned the same OCI index digest at that observation. |

The metadata establishes that stable and the official versioned tag shared an immutable artifact at the recorded time, and the OCI index lists both child manifests shown above. It does **not** establish the executable's self-reported version: Docker/Podman/Skopeo/Oras were unavailable, and `zap.sh -version` was not run. **Scanner execution status remains OPEN — NO-GO.** Before any authorization, an offline operator must verify the pinned image reports core 2.17.0, select the actual runtime architecture and corresponding child digest, and freeze the exact add-on inventory. If self-report or digest identity cannot be verified, scanner status remains **OPEN — NO-GO**. The index digest alone is not sufficient to establish which platform image will execute. Do not use a mutable tag alone, `latest`, weekly/nightly images, or update add-ons during an authorized run.

## Reproduction of the metadata lookup (not a Scrolith request)

The read-only PowerShell/.NET command used (with the anonymous token kept only in process memory and never printed) was:

```powershell
Add-Type -AssemblyName System.Net.Http
$tokenResponse = Invoke-RestMethod -Uri 'https://ghcr.io/token?scope=repository:zaproxy/zaproxy:pull'
$client = [System.Net.Http.HttpClient]::new()
$client.DefaultRequestHeaders.Authorization = [System.Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer', [string]$tokenResponse.token)
[void]$client.DefaultRequestHeaders.Accept.ParseAdd('application/vnd.oci.image.index.v1+json')
foreach ($tag in @('stable', '2.17.0')) {
  $response = $client.GetAsync("https://ghcr.io/v2/zaproxy/zaproxy/manifests/$tag").GetAwaiter().GetResult()
  $manifest = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult() | ConvertFrom-Json
  [pscustomobject]@{ tag=$tag; status=[int]$response.StatusCode; digest=($response.Headers.GetValues('Docker-Content-Digest') -join ''); mediaType=$manifest.mediaType }
}
$client.Dispose()
Remove-Variable tokenResponse -ErrorAction SilentlyContinue
```

The stable index was then parsed for `linux/amd64` and `linux/arm64` descriptors. Only status, tag, digest, media type, and platform descriptors were recorded; the temporary registry token was neither saved nor printed. The metadata request was to GHCR only, not a Scrolith service.

Official references: [ZAP Docker guide](https://www.zaproxy.org/docs/docker/about/), [ZAP 2.17.0 release](https://github.com/zaproxy/zaproxy-website/blob/main/site/content/blog/2025-12-15-zap-2-17-0/index.md), and [upstream release metadata](https://github.com/zaproxy/zap-admin/blob/master/ZapVersions-dev.xml).

The Docker guide notes that `stable` is rebuilt on a release/monthly cadence and add-ons/base layers can change independently. Pin the recorded digest and separately freeze/report add-ons; this preparation does not approve scanner execution.
