# Phase 21.1.2 — Microphone Permission Handling

## Goals

- Never fail silently
- Explain why the mic is needed
- Offer immediate retry
- Recover when the user grants permission after denial

## Mapping (`mapMicrophoneError`)

| Browser error | User message theme |
|---------------|--------------------|
| NotAllowedError / PermissionDenied | Enable mic in browser/device settings |
| NotFoundError | No microphone found |
| NotReadableError | Mic busy / in use |
| OverconstrainedError | Device cannot meet constraints |
| SecurityError | HTTPS / secure context required |
| MediaRecorder missing | Browser unsupported |
| getUserMedia missing | Device unsupported |

## UX in VoiceRecorder

1. On failure → amber status panel with plain-language text
2. **Retry microphone** button while idle
3. `navigator.permissions.query({ name: 'microphone' })` when available:
   - Listen for `change`
   - Clear denial hint when state becomes `granted`
4. User can tap mic again immediately after granting permission

## Android / WebView notes

- Permissions API may be incomplete; retry path remains primary
- Capacitor WebView should surface system permission dialogs for `getUserMedia`
- PWA: ensure service worker does not block secure media capture

## Operator checklist

1. Deny mic → confirm message + retry appear
2. Allow in site settings → retry succeeds without full page reload
3. Record → preview → send → playback
