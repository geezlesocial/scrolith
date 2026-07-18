# Phase 20.2.8 — Validation Report

**Date:** 2026-07-18  

## Unit / build

| Check | Result |
|---|---|
| FE a11y + cert polish unit tests (15) | PASS |
| BE certification unit tests (4) | PASS |
| FE production Vite build | PASS |
| BE production TypeScript build | PASS |

## Accessibility

| Check | Result | Evidence |
|---|---|---|
| Skip link + main landmark | PASS | App shell + prior gap tests |
| Route announcer | PASS | `RouteAnnouncer` |
| Keyboard shortcuts help | PASS | `?` help panel |
| Reduced motion policy | PASS | `index.css` |
| Global error recovery focusable CTAs | PASS | ErrorBoundary Retry/Go home |
| Dashboard EmptyState status live region | PASS | `role="status"` |
| Search error alert + retry | PASS | `role="alert"` + Retry |
| Offline banner live region | PASS | Prior gap work |

## Security

| Check | Result | Evidence |
|---|---|---|
| FE `X-Content-Type-Options: nosniff` | PASS | Production homepage headers |
| FE `X-Frame-Options: SAMEORIGIN` | PASS | Production homepage headers |
| FE `Referrer-Policy` | PASS | Production homepage headers |
| FE `Permissions-Policy` | PASS | Production homepage headers |
| BE posts.options 500 detail sanitization | PASS | Unit contract |
| No new secrets / IAM / DNS changes | PASS | Scope limited |

## Performance

| Check | Result |
|---|---|
| No new heavy client dependencies | PASS |
| Lazy route code-splitting preserved | PASS (build chunk map) |
| Search loading skeleton vs full-page spinner only | PASS (improved) |
| Correlation IDs negligible overhead | PASS |

## Production smoke (post promote)

| Check | Result |
|---|---|
| `GET https://api.scrolith.com/api/health` | PASS (OK after warm-up) |
| `GET https://api.scrolith.com/api/readyz` | PASS (READY after warm-up) |
| `x-request-id` response header | PASS |
| `GET https://api.scrolith.com/api/search/health` | PASS |
| `GET https://scrolith.com/` + security headers | PASS |
| `GET https://scrolith.com/search?q=engineer` | PASS |
| `GET https://scrolith.com/auth/login` | PASS |
| FE traffic 100% → `00136-dit` | PASS |
| BE traffic 100% → `00112-qar` | PASS |
| Rollback previous tags reachable | PASS |

## Authenticated UX (manual residual)

Full authenticated flows (login → report post → PYMK follow → creator analytics) require a live user session and were not automated in this phase. Contracts and UI paths are unit-locked; recommend product smoke with a staff account.

## Residual risks reassessment

| Risk | Severity | Status |
|---|---|---|
| Keyboard chord surprises | Low | Mitigated (disabled in fields) |
| PYMK quality data-dependent | Low–Med | Retry UX added |
| Creator analytics empty insights | Low | Retry UX added |
| Readyz 503 during cold start | Low (ops) | **By design** — do not use as liveness if you need always-200 |
| Gap strategic product deferrals | N/A | Documented, intentional |
| Android device lab / Play upload | Med (store) | Still deferred by constraint |
| Dual EmptyState components | Low | Partial a11y parity only |
| Widespread controller error.message leaks | Med | Scoped fix for posts.options; staged cleanup deferred |

## Regression assessment

No intentional behavior removals. Additive headers/endpoints/UI only. Prior 20.2.x surfaces unchanged in contract.
