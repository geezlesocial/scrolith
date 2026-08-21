# Scrolith Android 1.1.79

- Updated the Android production bundle to version 1.1.79 (versionCode 89).
- Preserved the hardened Android cold-start incoming voice and video call notification path, including high-priority FCM data delivery, deduplicated ringtone notifications, and native full-screen/deep-link handoff.
- Preserved realtime messaging, WebSocket reconnect, voice and video calls, Redis-backed signaling, authentication, and responsive messaging across the inbox, header messaging surface, and floating chat widget.
- Validated compatibility with the production backend Prisma hardening release, including CommunityClub field mapping, idempotent Gcoin and recommendation feedback handling, and structured duplicate protection.
- Preserved media delivery compatibility with Azure Blob Range requests, HTTP 206 responses, video seeking, image delivery, PDF delivery, and attachment loading.
- General performance, stability, security, and compatibility improvements.

## Release metadata

- Application ID: `com.scrolith.scrolith`
- Version name: `1.1.79`
- Version code: `89`
- Production API: `https://api.scrolith.com`
- Production backend: `ca-scrolith-backend--prisma-hardening-8278aca3`
- Production frontend: `ca-scrolith-frontend--messaging-call-183ea55a`
- Google Play upload: Not performed by this build.
