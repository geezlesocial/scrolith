# Phase 21.1.2S — Executive Summary

**Status:** Voice stabilization implemented · Survey audit complete · FE deploy pending  
**Date:** 2026-07-19  
**Prior:** Phase 21.1.2R live (Permissions-Policy + mic recovery)

## Objectives

1. Eliminate sent voice-note card shaking / layout jank during playback.
2. Confirm and harden the existing post-interest survey on Member Home, /community, and /scroll.

## Voice root cause (confirmed)

Primary jank sources in `VoiceNotePlayer`:

1. **Every `timeupdate` called React `setState`** for `currentMs` → full player re-render ~4–15×/s.
2. **Waveform bars rebuilt every render** with heights depending on `durationMs` (metadata load changed all bar heights).
3. **Conditional error row** inserted/removed layout height.
4. **Parent `onRequestRefreshSrc` identity** in `useEffect` deps could remount the `Audio` element when parents re-rendered.

## Voice fixes

- Deterministic cached waveform (`voiceWaveform.ts`) by attachment id
- Progress via CSS `transform: scaleX` + DOM label updates (no React progress state)
- `requestAnimationFrame` only while playing; throttled ~8/s
- Fixed min-height / reserved error slot / fixed speed button width / tabular-nums
- `contain: layout paint`; refresh callback via ref
- `React.memo` retained

## Interest survey

| Surface | Status |
|---------|--------|
| Member Home | **Active** — `PostEngagementBar` + `ContentInterestSurvey`; now up to 4 candidates |
| /community | **Active** — same via CommunityHome |
| /scroll | **Active** — route `/scroll` → `ScrollFeed` + `ScrollCard` |
| Mixed non-post cards | Correctly **absent** (jobs/gigs/ads) |

Feedback: `POST /posts/:id/interested|not-interested` and Scroll equivalents; surface tags `post_interest_survey` / `scroll_interest_survey`. Complements passive signals; no new ranking engine.

## Status labels

| Gate | Status |
|------|--------|
| Voice root cause confirmed | Yes |
| Voice stabilization implemented | Yes |
| Automated voice tests complete | Yes |
| Android Chrome validation | Operator residual |
| Android wrapper validation | Operator residual (SPA loads live FE) |
| Survey source audit complete | Yes |
| Member Home survey confirmed | Yes (code + wiring) |
| Community survey confirmed | Yes |
| Scroll survey confirmed | Yes |
| Feedback submission confirmed | Code path verified; auth E2E residual |
| Frontend deployed | Pending this rollout |
| Production certified | Conditional after smoke |
