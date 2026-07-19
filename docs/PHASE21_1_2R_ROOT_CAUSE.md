# Phase 21.1.2R — Root Cause

## Avatar

EnterpriseAvatar showed initials underlay permanently when:
- a single image URL failed (no multi-candidate walk);
- invalid src values short-circuited resolution;
- loaded photo opacity transition left confusion with initials text still visible (aria-hidden only).

**Fix:** ordered candidates, next-candidate on error, hide initials when photo decoded.

## False permission blocked

Production nginx:

`
Permissions-Policy: ... microphone=()
`

This Feature Policy denies the permission for the document origin. Browser may still show site permission as allowed while getUserMedia fails with NotAllowedError-like behavior.

Secondary: `mapMicrophoneError` matched loose `message.includes('permission')`.

## Mobile recording

Constraint-heavy getUserMedia failed on some devices; no single cleanup+retry; empty blob threshold too aggressive.

## Playback

VoiceNotePlayer failed without MediaError classification or authenticated URL refresh path.

## Android

Bridge granted all resources without strict origin validation; selective audio grant hardened in 1.1.23.
