# Phase 20.5 — Performance Report

| Area | Notes |
|---|---|
| AAB size | ~12.2 MB (web assets + native shell) |
| Desktop Setup | ~105 MB (Electron) |
| Desktop Portable | ~90 MB |
| Web build | Vite production ~39s typical |
| Gradle bundle | ~3–4 minutes clean |
| Capture quality | O(1) size heuristics — negligible CPU |

No regression expected to web performance; AAB embeds the same production JS chunks as Cloud Run FE.
