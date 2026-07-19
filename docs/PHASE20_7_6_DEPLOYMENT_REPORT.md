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

_Populated after Cloud Build + Cloud Run update._

## Progressive enable order (internal)

1. `SCROLITHA_ROLLOUT_FILE_UNDERSTANDING=true` + `SCROLITHA_FILE_TEXT=true`
2. `SCROLITHA_FILE_PDF=true`
3. `SCROLITHA_FILE_IMAGES=true`
4. `SCROLITHA_FILE_SCANNED_PDF=true` (when OCR path certified)
5. `SCROLITHA_FILE_DOCX=true`
6. `SCROLITHA_FILE_MULTI=true`

Do not enable broad public multi-file until security + grounding gates pass.
