# Phase 20.7.6 — Deployment Report

## Pre-deploy baseline (verified)

| Service | Revision | Tag | Traffic |
|---|---|---|---|
| Backend | scrolith-backend-00130-joj | p2075 | 100% |
| Frontend | scrolith-frontend-00159-vox | p2076 | 100% |

## Flags on deploy

All file intelligence capabilities **disabled**:

- `SCROLITHA_ROLLOUT_FILE_UNDERSTANDING` unset/false
- `SCROLITHA_FILE_TEXT/PDF/IMAGES/DOCX/MULTI/SCANNED_PDF` default false

## Builds / revisions

| Image | Build | Status |
|---|---|---|
| scrolith-backend:p2076-e346b4a9 | Cloud Build SUCCESS | SUCCESS |
| scrolith-frontend:p2077-e9078581 | e9f59edc-095d-449f-8f9f-b83043828974 | SUCCESS |

| Service | Revision | Tag | Traffic |
|---|---|---|---|
| Backend | scrolith-backend-00132-loh | p2076 | 100% |
| Backend prior | scrolith-backend-00130-joj | p2075 | 0% |
| Frontend | scrolith-frontend-00161-bov | p2077 | 100% |
| Frontend prior | scrolith-frontend-00159-vox | p2076 | 0% |

## Post-deploy smoke

| Check | Result |
|---|---|
| `GET /api/health` | 200 |
| `GET https://scrolith.com/` | 200 |
| `GET /api/messages/search?q=test` unauth | 401 (route present) |
| `SCROLITHA_ROLLOUT_FILE_UNDERSTANDING` | unset (OFF) |
| Messaging assistant | remains true |

## Progressive enable order (internal)

1. `SCROLITHA_ROLLOUT_FILE_UNDERSTANDING=true` + `SCROLITHA_FILE_TEXT=true`
2. `SCROLITHA_FILE_PDF=true`
3. `SCROLITHA_FILE_IMAGES=true`
4. `SCROLITHA_FILE_SCANNED_PDF=true` (when OCR path certified)
5. `SCROLITHA_FILE_DOCX=true`
6. `SCROLITHA_FILE_MULTI=true`

Do not enable broad public multi-file until security + grounding gates pass.
