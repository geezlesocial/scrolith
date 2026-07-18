# Phase 20.5 — Security Report

| Control | Result |
|---|---|
| Release signing via key.properties | Used (secrets not printed) |
| Cleartext disabled in release | YES |
| network_security_config base cleartext false | YES |
| WebView debugging disabled when not debuggable | YES |
| FileProvider not exported | YES |
| Deep links autoVerify hosts scrolith.com | YES |
| Keystore / passwords not committed in docs | YES |
| google-services.json present for FCM | YES (pre-existing) |
| minifyEnabled | false (no R8 mapping required this release) |

## Residual

Upload key self-signed is expected for Play App Signing. Do not ship keystore outside secure ops.
