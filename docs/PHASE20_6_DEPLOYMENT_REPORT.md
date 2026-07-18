# Phase 20.6 — Deployment Report

## Images (immutable)

| Service | Image tag | Build ID |
|---|---|---|
| Frontend | `scrolith-frontend:p206-ad067370` | `f0f36e3c-3277-4f6c-befb-12d512e406c9` |
| Backend | `scrolith-backend:p206-1de56ec7` | `026b1a85-3158-4949-bcba-ebb1b29c1f04` |

## Revisions

| Service | Revision | Traffic | Tag |
|---|---|---|---|
| Frontend | **`scrolith-frontend-00145-dez`** | **100%** | `p206` |
| Frontend prior | `scrolith-frontend-00143-leb` | 0% | `p2041` (rollback) |
| Frontend p203 | `scrolith-frontend-00138-ruh` | 0% | `p203` (reachable) |
| Frontend broken p204 | `scrolith-frontend-00140-zaq` | **0%** | `p204` |
| Backend | **`scrolith-backend-00116-qoc`** | **100%** | `p206` (+ historical `p202-kyc` label on same rev) |
| Backend prior | `scrolith-backend-00114-bay` | 0% | `p203` (rollback) |

## Git / PRs

| Item | Value |
|---|---|
| FE PR | https://github.com/geezlesocial/scrolith/pull/79 **MERGED** `ad067370` |
| BE PR | https://github.com/geezlesocial/scrolith/pull/80 **MERGED** `1de56ec7` |
| FE commit | `1052aa91` |
| BE commit | `705a8a2d` |

## Production asset verification

| Check | Result |
|---|---|
| https://scrolith.com/ HTTP 200 | **YES** |
| https://scrolith.com/messages HTTP 200 | **YES** |
| Index chunk | `/assets/index-B1QbozD5.js` |
| MessageAttachmentRenderer chunk | `MessageAttachmentRenderer-B4zgcnBb.js` contains identity + “Preview temporarily unavailable” + “Refresh preview” |
| Prior p2041 image not reused | **YES** — new `p206-ad067370` |

## Rollback

See `PHASE20_6_ROLLBACK_REPORT.md`.
