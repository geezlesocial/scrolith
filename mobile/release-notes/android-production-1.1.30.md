# Scrolith Android 1.1.30 (40) — Production publication notes

**versionName:** 1.1.30 · **versionCode:** 40 · **applicationId:** `com.scrolith.scrolith`  
**AAB:** `mobile/release-artifacts/android-1.1.30/Scrolith-1.1.30-40-release.aab`  
**Phase:** 29.7 production (Enterprise Messaging Groups + Message Privacy mobile fix)

## Play Store “What’s new” (en-US)

```
Scrolith 1.1.30
• Enterprise Messaging Groups: create public, private & secret groups
• Group invites, join requests, roles, pins, slow mode & lockdown
• Messaging Privacy works again on phones: online, last seen, read receipts, typing
• Open Privacy from Messages (shield) or the conversation menu
• Group discovery, search & admin tools for organizations
• Push routing, reconnect & notification sound reliability
```

## Highlights

| Area | What shipped |
|------|----------------|
| **Enterprise groups** | Multi-member messaging groups (not Community Clubs): PUBLIC / PRIVATE / SECRET, invites, join policies, roles, pins, modes |
| **Message Privacy** | Fixed mobile WebView stacking so privacy settings open above the chat; inbox shield entry |
| **Realtime** | Catch-up, multi-typer, authorized group rooms on existing `/community` socket |
| **Admin** | Messaging Groups administration, audit, export (web admin; app consumes same APIs) |
| **Production hosts** | Bundled web assets target `https://api.scrolith.com` / `scrolith.com` |
| **Prior baseline** | Stories manage, avatars, message email throttle, multi-currency, push v2 channels |

## Version identity

| Field | Value |
|-------|--------|
| applicationId | `com.scrolith.scrolith` |
| versionName | `1.1.30` |
| versionCode | `40` |
| minSdk | 24 |
| targetSdk | 36 |
| compileSdk | 36 |
| signing | Play upload keystore (`android/key.properties`) |
| minify / shrink | enabled |

## Backend / web alignment

| Component | Production |
|-----------|------------|
| Frontend Cloud Run | `scrolith-frontend-00267-qob` (p297) |
| Backend Cloud Run | `scrolith-backend-00199-hef` (p297) |
| API | `https://api.scrolith.com` |
| Migrations | Phase 29.1 + 29.5 applied |

## Upload instructions

1. Open Google Play Console → Scrolith → Production (or staged track).
2. Create release → upload `Scrolith-1.1.30-40-release.aab`.
3. Paste en-US “What’s new” from above (≤500 chars recommended).
4. Attach `mapping.txt` from the artifact folder if Play requests deobfuscation.
5. Review → rollout (recommend staged % if desired).

Manual Google Play upload only — not auto-deployed from CI.
