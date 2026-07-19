# Phase 21.1.2R — Executive Summary

**Status:** Code complete · Automated tests complete · Frontend deploy in progress  
**Date:** 2026-07-19

## Critical root causes

1. **Permissions-Policy blocked microphone** in production nginx: `microphone=()` denied getUserMedia even when OS/browser permission was granted.
2. **Over-broad error mapping** treated many failures as permanent permission denial.
3. **Avatar initials** could dominate when photo candidates were incomplete or first URL failed permanently.
4. **Android WebView** needed origin-scoped grants of only `RESOURCE_AUDIO_CAPTURE` after runtime RECORD_AUDIO.

## Fixes

- nginx: `microphone=(self), camera=(self)`
- `resolveProfilePhotoCandidates` + EnterpriseAvatar multi-candidate + hide initials after load
- Precise `classifyMicrophoneError` + user-gesture `acquireMicrophoneStream` with cleanup retry
- VoiceRecorder state machine + compact mobile banner
- VoiceNotePlayer media-error capture + refresh/retry
- MainActivity origin validation + selective resource grant
- Android version **1.1.23 (33)**

## Status labels

| Gate | Status |
|------|--------|
| Code complete | Yes |
| Automated tests complete | Yes (19/19) |
| Frontend build | Yes |
| Browser validation complete | Operator residual after FE deploy |
| Android WebView validation complete | Code ready; install residual |
| Frontend deployed | See deployment doc |
| Android build produced | versionCode 33 ready for AAB |
| Android installed and tested | Operator residual |
| Production certified | Pending device mic smoke after FE deploy |

## Rollback

FE: `scrolith-frontend-00127-p5c` / prior `00179-zav` (p2111). No DB changes.
