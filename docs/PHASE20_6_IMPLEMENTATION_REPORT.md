# Phase 20.6 — Implementation Report

## Frontend (main / PR #79)

| File | Change |
|---|---|
| `src/components/messaging/MessageAttachmentRenderer.tsx` | Identity-stable reset/viewport/preload; image error recovery; refresh preview CTA |
| `src/services/messagingMedia.ts` | `getMessageAttachmentIdentityKey` |
| `tests/unit/messagingMedia.test.ts` | Identity thrash regression test |

**Commit:** `1052aa91`  
**Merge:** `ad067370` (PR #79)

## Backend (release/backend-production / PR #80)

| File | Change |
|---|---|
| `geezle-backend/src/controllers/messages.controller.ts` | `mapAttachments` → contentUrl as url, storageUrl preserved, fileId + metadata |

**Commit:** `705a8a2d`  
**Merge:** `1de56ec7` (PR #80)

## Tests

- `node --import tsx --test tests/unit/messagingMedia.test.ts` → **20 pass**
- `npm run build` (geezle) → **pass**

## Images (immutable tags)

| Service | Tag |
|---|---|
| Frontend | `scrolith-frontend:p206-ad067370` |
| Backend | `scrolith-backend:p206-1de56ec7` |
