# Phase 20.8.1 — Certification

## Decision

**COMPLETE — DEPLOYED, LIMITED VALIDATION**

Rationale: Code merged, immutable image built, 100% FE traffic on p2082 revision, unit tests green, HTTP smoke green. Physical Android device and Android wrapper authenticated E2E remain operator-pending — therefore not full “MOBILE PRODUCTION CERTIFIED” or “ANDROID CANARY CERTIFIED” without device sign-off.

## Gates

| Gate | Result |
|---|---|
| Root cause documented | PASS |
| Mobile input dominant | PASS (code + unit) |
| Mic/Send contextual toggle | PASS |
| Plus bottom sheet (Files/Media/Camera) | PASS (code + unit options) |
| Suggest not permanent primary on mobile | PASS |
| Short mobile placeholders | PASS |
| Scrolitha collapse while typing/keyboard | PASS (code) |
| Gender removed from mobile header | PASS (code) |
| Desktop multi-control preserved | PASS (branching) |
| Unit tests | PASS 6/6 |
| Cloud Build | PASS |
| FE traffic 100% p2082 | PASS |
| Backend unchanged | PASS |
| Real device E2E | PENDING operator |
| Android wrapper E2E | PENDING operator |

## Production coordinates

| Item | Value |
|---|---|
| FE revision | `scrolith-frontend-00171-yis` |
| FE tag | `p2082` |
| FE image | `scrolith-frontend:p2082-mobile` |
| FE commit | `bbc73f71` |
| BE revision | `scrolith-backend-00138-zan` |
| BE tag | `p2079` |
| Rollback FE | `scrolith-frontend-00169-wob` (p2081) |
