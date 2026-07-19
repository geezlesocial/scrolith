# Phase 20.7.6 — Continuity Audit

**Baseline verified 2026-07-19 (pre-deploy):**

| Service | Revision | Tag | Traffic |
|---|---|---|---|
| Backend | scrolith-backend-00130-joj | p2075 (+ p202-kyc alias) | 100% |
| Frontend | scrolith-frontend-00159-vox | p2076 | 100% |

Reported baseline (scrolith-backend-00128-guz / scrolith-frontend-00157-nij) was **stale**. Phase 20.7.5 is live.

## Continuity matrix

| Component | Action | Notes |
|---|---|---|
| Phase 20.6 upload + ownership | **Reused** | `FileService` / GCS `downloadMediaByProvider` |
| Signed URL / media resolver | **Unchanged** | AI path uses server-side download, not client URLs |
| Message attachments | **Extended** | `attachmentFileIds` passed into Scrolitha turn |
| Scrolitha identity / ensure DM | **Unchanged** | Canonical conversation only |
| `processScrolithaMessagingTurn` | **Extended** | File intelligence + continuity lookback |
| `processScrolithaUnifiedTurn` | **Extended** | Persist `attachments[]`, attachment-only turns |
| Orchestrator / Ollama provider | **Unchanged** | No second AI stack |
| SupportWidget | **Extended** | Secure upload + `attachmentFileIds` |
| Messages composer | **Reused** | Existing Phase 20.6 attach path |
| Messaging Dock | **Unchanged** | Still excluded on `/messages` |
| Write / financial tools | **Unchanged** | Still disabled |
| Rollout flags | **Extended** | Sub-flags `SCROLITHA_FILE_*` progressive |

## Phase 20.7.5 status

**Merged and deployed.** Search route + Scrolitha DM dedupe live on p2075 BE / p2076 FE.
