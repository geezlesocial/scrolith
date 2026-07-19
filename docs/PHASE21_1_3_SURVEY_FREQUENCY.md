# Phase 21.1.3 — Survey Frequency

## Active caps (code inspection of deployed lineage)

| Surface | Limit argument | Notes |
|---------|----------------|-------|
| Member Home | 4 | Aligned in 21.1.2S |
| Community | 5 | Unchanged |
| MobileFeed | 5 | Unchanged |
| Scroll | 4 | Unchanged |

## Fatigue controls already present

- Requires authenticated viewer.
- Excludes author = viewer.
- Excludes items with existing `interestSignal` / feedback signal.
- Stable hash ranking (not random thrash).
- Max clamped 1–12 in picker.
- Prompt only when `enabled` and not submitted.

## Tuning decision

**No limit changes in 21.1.3.** No production fatigue defect was measured. Changing caps without evidence would violate the phase policy.
