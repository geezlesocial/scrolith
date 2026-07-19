# Phase 20.8 — Deployment Report

## Pre-deploy
| Service | Revision |
|---|---|
| FE | scrolith-frontend-00167-wal (p2080) |
| BE | scrolith-backend-00138-zan (p2079) — unchanged |

## Build
| Image | Status |
|---|---|
| scrolith-frontend:p2081-11acf8be | SUCCESS fcfc8ab4-... |

## Post-deploy traffic
| Service | Revision | Tag | Traffic |
|---|---|---|---|
| Frontend | scrolith-frontend-00169-wob | p2081 | 100% |
| Frontend prior | scrolith-frontend-00167-wal | p2080 | 0% |
| Backend | scrolith-backend-00138-zan | p2079 | 100% (unchanged) |

## PRs
| PR | Merge |
|---|---|
| #105 FE | 11acf8be |
| #106 docs | c7415a96 |

## Smoke
| Check | Result |
|---|---|
| GET scrolith.com | 200 |
| GET /messages | 200 |
