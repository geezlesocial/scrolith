# Phase 21.1.2 — Messaging Audit (Voice + Avatars)

## Scope

End-to-end audit of messaging surfaces related to voice notes and conversation avatars. No redesign of messaging transport, sockets, or conversation model.

## Voice path validation

| Stage | Status | Notes |
|-------|--------|-------|
| UI entry (SmartComposer / InlineMessageComposer) | OK | VoiceRecorder slot; white className override removed prior |
| MediaRecorder support | OK | Feature detect + user-facing fallback |
| Microphone permission | OK | Mapped errors + retry + permission change recovery |
| MIME selection | OK | `pickSupportedAudioMimeType` |
| Chunk collection | OK | `ondataavailable` + timeslice 250ms |
| Empty blob | OK | `isUsableVoiceBlob` min 256 bytes |
| Upload | OK | FileService private document upload |
| API | OK | `POST /messages/conversations/:id/voice-notes` |
| Message list preview | OK | lastMessagePreview already treats voice_note |
| Playback | Improved | VoiceNotePlayer replaces bare `<audio controls>` |
| Download | OK | downloadMessageAttachment |
| Runtime flags | Unchanged | `enabledVoiceNotes`, `blockedForCurrentUser`, max duration |

## Avatar path (messaging)

| Surface | Status |
|---------|--------|
| Conversation list rows | EnterpriseAvatar |
| Chat window header / minimized | EnterpriseAvatar |
| Desktop dock | EnterpriseAvatar (or message icon if no user avatar) |
| Full Messages inbox + header | EnterpriseAvatar |
| Mobile messages sheet | EnterpriseAvatar |

## Regression boundaries

- Text/image/file attachments unchanged
- Scrolitha conversation menus unchanged
- Voice *calls* (WebRTC) separate from voice *notes* — not modified beyond shared UI adjacency
- Feed architecture untouched

## Residual risks

- Some Android WebViews require explicit WebChromeClient permission bridge (Capacitor usually handles)
- Safari audio container differences may force m4a/mp4 mime path
- Authenticated E2E mic capture not automated in CI (operator device lab)
