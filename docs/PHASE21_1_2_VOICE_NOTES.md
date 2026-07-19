# Phase 21.1.2 — Voice Notes

## Pipeline

```
UI VoiceRecorder
  → getUserMedia (audio constraints)
  → MediaRecorder (MIME pick + 250ms timeslice)
  → Blob chunks → preview ObjectURL
  → File (createVoiceFile)
  → FileService.uploadFile(…, 'document', private)
  → MessagingService.sendVoiceNote(conversationId, { fileId, durationMs })
  → POST /messages/conversations/:id/voice-notes
  → Message attachment normalize → VoiceNotePlayer playback
```

## Frontend modules

| Module | Role |
|--------|------|
| `utils/voiceRecording.ts` | MIME, errors, blob checks, duration format, File factory |
| `messages/VoiceRecorder.tsx` | Full recorder UI + lifecycle |
| `components/messaging/VoiceNotePlayer.tsx` | Playback UX |
| `MessageAttachmentRenderer.tsx` | Uses VoiceNotePlayer for audio / voice_note |
| `MessageContext.sendInlineVoiceNote` | Empty blob + fileId guards |
| `Messages.handleVoiceRecorded` | Same guards for full page composer |

## Recorder features

- Start / pause / resume / stop / cancel
- Preview play before send
- Duration timer + max duration auto-stop (default 180s, runtime configurable)
- High-contrast blue→indigo mic button (no white invisible control)
- Recording pulse + red timer
- Upload “Sending…” state
- Permission banner + Retry microphone
- Permissions API `change` listener clears denial hint when granted

## MIME strategy

Preferred order: webm/opus → webm → mp4 → ogg → aac → mpeg. Extension derived for upload filename.

## Backend

Unchanged. Existing voice-note controller and file usage types remain authoritative.

## Browser matrix

| Environment | Expectation |
|-------------|-------------|
| Desktop Chrome / Edge | Full support |
| Firefox | Full support (MIME may vary) |
| Safari | Where MediaRecorder audio supported; else clear unsupported message |
| Android Chrome | Timeslice + preview path |
| Android WebView / Capacitor | Same; permission UX depends on WebView settings |
| PWA | HTTPS required for mic |

## Playback

- Pseudo-waveform + seek range
- 1x / 1.5x / 2x speed
- Play/pause, duration labels
- Download via existing messaging media downloader
- Retry on decode/play failure
