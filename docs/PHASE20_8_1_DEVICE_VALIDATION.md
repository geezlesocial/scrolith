# Phase 20.8.1 — Device Validation

## Automated / remote evidence

| Check | Result |
|---|---|
| Unit mobile policy tests | 6/6 PASS |
| Cloud Build p2082-mobile | SUCCESS |
| Tagged revision HTTP | 200 `/`, 200 `/messages` |
| Production traffic 100% | `scrolith-frontend-00171-yis` |
| Desktop URL smoke | 200 scrolith.com/messages |

## Device matrix

| Device / surface | Status | Notes |
|---|---|---|
| Desktop browser (Chrome) | SMOKE PASS | SPA shell 200; layout branch desktop |
| Narrow viewport code path | CODE + UNIT PASS | `isMobileViewport` &lt; 768 |
| Android Chrome (physical) | OPERATOR PENDING | Keyboard + composer width |
| Android WebView wrapper | OPERATOR PENDING | Capacitor shell |
| iOS Safari | NOT IN SCOPE this P1 | Residual risk |

## Visual evidence

Pre-fix: operator screenshots of narrow input / wrapped placeholder (incident input).  
Post-fix: deploy revision live; operator should capture:

1. Idle mobile composer: `+ | Message… | mic`
2. Draft: `+ | text | send`
3. Plus sheet: Files / Media / Camera
4. Scrolitha chips collapsed while typing
5. Header without gender badge
6. Keyboard open: history usable, composer above keyboard
