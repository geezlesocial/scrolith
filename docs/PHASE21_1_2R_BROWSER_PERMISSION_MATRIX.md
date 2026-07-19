# Phase 21.1.2R — Browser Permission Matrix

| Signal | Role |
|--------|------|
| Permissions-Policy header | Must allow `microphone=(self)` |
| Permissions API | Supporting only; incomplete on WebView |
| getUserMedia (user gesture) | Authoritative |
| NotAllowedError | permission_denied |
| NotFoundError | no_microphone |
| NotReadableError | microphone_busy |
| OverconstrainedError | overconstrained → retry plain audio |
| AbortError | dismissed |
| SecurityError | insecure_context |
