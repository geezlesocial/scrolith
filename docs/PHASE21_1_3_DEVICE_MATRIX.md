# Phase 21.1.3 — Device Matrix

## Environments

| Environment | Capability in this session | Result |
|-------------|----------------------------|--------|
| Production Cloud Run (p2112s) | Live traffic + headers | **PASS** — 00129-vkb @ 100% |
| Desktop HTTP smoke | curl routes / headers | **PASS** — `/` `/community` `/scroll` `/messages` → 200 |
| Automated unit tests | Node | **PASS** 40/40 |
| Android Chrome physical | Mic + playback video | **Not available** — residual |
| Scrolith Android wrapper | WebView + RECORD_AUDIO | **Not available** — residual |
| Low/mid-range Android lab | — | **Not available** — residual |
| Authenticated production account | Survey + DM | **Not available** — residual |

## Operator checklist (required to clear residuals)

1. Device OS/browser versions + account id (non-secret).
2. Record 2–5s voice → preview → send → play/seek/speed/scroll.
3. Member Home + Community + Scroll: Interested + Not interested once each.
4. Capture short screen video + Network tab for interest API 2xx.

## Template log

| Field | Example |
|-------|---------|
| OS | Android 14 |
| Browser | Chrome 126 |
| Device class | Mid-range |
| Network | Wi-Fi |
| Account | tester+phase2113@… |
| Revision | scrolith-frontend-00129-vkb |
| Voice E2E | PASS / FAIL |
| Survey E2E | PASS / FAIL |
