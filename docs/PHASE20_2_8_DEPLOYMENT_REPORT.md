# Phase 20.2.8 — Deployment Report

**Date:** 2026-07-18  
**Region:** `asia-southeast1`  
**Project:** `scrolith-500821`

## Artifacts

| Component | Image tag | Build ID | Git SHA |
|---|---|---|---|
| Frontend | `scrolith-frontend:p2028-1196349b` | `802af318-8f7f-44c0-b253-63cebc6460f2` | `1196349b` |
| Backend | `scrolith-backend:p2028-343f5c21` | `7f6836dd-4509-45ea-8ee1-1c0b9702a63c` | `343f5c21` |

## Revisions

| Service | Previous 100% | New 100% | Tag |
|---|---|---|---|
| `scrolith-frontend` | `scrolith-frontend-00134-bof` (p2027c) | **`scrolith-frontend-00136-dit`** | `p2028` |
| `scrolith-backend` | `scrolith-backend-00110-sal` (p2027c) | **`scrolith-backend-00112-qar`** | `p2028` |

## Deploy sequence

1. Cloud Build FE + BE images (SUCCESS)
2. Deploy BE tagged candidate `--no-traffic` → `00112-qar`
3. Candidate smoke: `/api/health` 200, `/api/readyz` 200, `x-request-id` present
4. Deploy FE tagged candidate `--no-traffic` → `00136-dit`
5. Candidate smoke: homepage 200 + security headers
6. Promote BE → 100%
7. Promote FE → 100%
8. Production smoke (post warm-up)

## Pull requests

| PR | Base | Result |
|---|---|---|
| [#73](https://github.com/geezlesocial/scrolith/pull/73) FE certification polish | `main` | **MERGED** `1196349b` |
| [#72](https://github.com/geezlesocial/scrolith/pull/72) BE report ack + cert hardening | `release/backend-production` | **MERGED** `343f5c21` |

## Migrations

None. No Prisma schema changes in this phase.

## Rollback verified

| Path | Result |
|---|---|
| Previous FE tag `p2027c` reachable | YES (HTTP 200) |
| Previous BE tag `p2027c` health | YES (HTTP 200, status OK) |
| Traffic switch commands documented | YES |

## Notes

- Brief post-promote BE cold-start window showed `/api/health` DEGRADED + `/api/readyz` 503 — **expected** readiness behavior while Prisma connected; stabilized to READY within ~1 minute.
- Tag `p202-kyc` on backend also points at the latest revision; historical tags retained for rollback URLs.
