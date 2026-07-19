# Phase 21.1.2S — Voice Stability Root Cause

## Confirmed causes

1. **React state thrash from `timeupdate`** — `setCurrentMs` every audio event re-rendered the player and all 24 waveform spans.
2. **Non-stable waveform** — `Array.from` + `Math.sin(... durationMs ...)` recalculated heights when duration resolved (visible “shake”).
3. **Layout insertion** — error/retry block changed card height.
4. **Effect remount risk** — `onRequestRefreshSrc` in dependency array of the Audio lifecycle effect.

## Non-causes (ruled out)

- Server MIME / Permissions-Policy (fixed in 21.1.2R)
- Conversation virtualizer measuring every tick (progress no longer changes outer size)
- Waveform using Math.random (was deterministic sin, but duration-coupled)

## Fix strategy

Move progress paint off React state; lock waveform geometry; reserve error height; stabilize Audio lifecycle deps.
