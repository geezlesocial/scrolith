# Phase 21.1.3 — Voice E2E

## Automated / production infrastructure

| Check | Result |
|-------|--------|
| Permissions-Policy microphone=(self) | **PASS** (live scrolith.com) |
| VoiceNotePlayer data-phase 21.1.2S in source | **PASS** |
| Deterministic waveform cache | **PASS** (unit) |
| Progress without React timeupdate setState | **PASS** (code audit) |
| Authenticated DM record/play on device | **Residual** |

## Script (operator)

1. Login → Messages → open DM.
2. Mic allow → record 2–5s → pause/resume if offered → stop → preview → send.
3. Play / pause / seek / 1×→1.5×→2× → scroll list → leave/reopen → replay.
4. Fail criteria: shake, height jump, waveform rebuild, permission false-block, playback fail after retry.

## Multiple players

Code path: one Audio element per `VoiceNotePlayer` instance; waveform seeded by `attachmentId`. Device residual: ensure only intended audio plays when switching.
