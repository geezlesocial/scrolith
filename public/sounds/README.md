# Scrolith Call audio assets

| File | Role |
|------|------|
| `you-have-call-in-scrolith-ringtone.mp3` | Primary Scrolith incoming ringtone for voice, video, and conference calls |
| `scrolith-call.wav` | Official **Scrolith Call** incoming ringtone (looped) |
| `scrolith-ringback.wav` | Outgoing ringback while waiting for answer (looped) |

## Formats

Phase 1 ships **MP3 + WAV** for:

- Instant decode / low startup delay
- Gapless looping with short edge fades
- Broad browser + Capacitor WebView support

OGG packaging can be added later with the same basenames if CDN/tooling prefers it; the player selects the first available source.

## Branding

Do not replace with OS default phone tones. Keep the ascending digital motif so users associate the sound with Scrolith (similar to Teams / Slack / WhatsApp brand recognition).
