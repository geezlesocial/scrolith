# Phase 33.0 — API

## User (`/api/ai/*`, auth required)

| Method | Path | Notes |
|--------|------|-------|
| GET | `/status` | Platform + capability flags + disclosure |
| GET | `/preferences` | Consent |
| PATCH | `/preferences` | Update consent |
| POST | `/preferences/reset` | Defaults |
| GET | `/usage` | Quotas + recent |
| GET | `/history` | If history consent |
| DELETE | `/history` | Delete user AI history |
| POST | `/summarize` | TEXT_SUMMARIZATION |
| POST | `/rewrite` | TEXT_REWRITING |

Legacy routes (`/answer`, `/guide`, `/scrolitha-*`, etc.) preserved.

## Admin (`/api/admin/ai/*`, admin + RBAC)

| Method | Path |
|--------|------|
| GET | `/overview` |
| GET/PUT | `/providers`, `/providers/:provider` |
| POST | `/providers/:provider/test` |
| GET/PUT | `/models`, `/models/:modelId` |
| GET/POST/PUT | `/prompts`, `/prompts/:promptId` |
| POST | `/prompts/:promptId/publish` \| `/rollback` |
| GET | `/usage`, `/health`, `/audit` |
| GET/PUT | `/feature-flags`, `/feature-flags/:flag` |

High-risk flag changes require header `X-Confirm-AI-Risk: CONFIRM`.
