# Phase 21.1.3 — Privacy Validation

## Interest feedback

Payload keys observed in client: `surface` only (plus path id). Auth via session/JWT headers.

**Must not include:** message text, voice audio, transcripts, free-text survey answers, unrelated PII.

## Voice diagnostics

`logVoiceDiagnostic` stages/categories/MIME/browser family only — no audio samples.

## Scrolitha

Signals enter existing preference/intelligence APIs; Scrolitha consumption is **indirect** if present. No claim of direct model training on survey clicks.
