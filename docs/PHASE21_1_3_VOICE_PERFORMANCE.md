# Phase 21.1.3 — Voice Performance

## Design acceptance (code-level)

| Metric | Expected | Evidence |
|--------|----------|----------|
| Waveform generation | Once per attachment seed | `getDeterministicWaveform` cache unit test |
| Progress updates | DOM/CSS only; ~8/s rAF while playing | VoiceNotePlayer paintProgress |
| Full conversation re-render per tick | Must not | No parent setState from player timeupdate |
| Layout shift from progress | Negligible / zero outer size change | Fixed min-height, transform fill |
| rAF after pause/unmount | Stopped | stopRaf on pause/end/unmount |

## Not claimed

- 60 FPS without capture.
- Device CPU/memory without lab tools.

## Residual measurement (operator)

Use React Profiler + Performance panel while playing a voice note; confirm VoiceNotePlayer re-renders only on play/pause/error/speed, not every progress tick.
