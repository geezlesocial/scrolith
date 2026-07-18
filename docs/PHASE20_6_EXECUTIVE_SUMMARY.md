# Phase 20.6 — Executive Summary

## Problem

Messaging attachment cards showed filename/size/download but automatic image previews failed with **“Image preview unavailable”** on `/messages` and the messaging dock (shared web shell for Android/desktop).

## Root cause

Frontend **attachment identity thrash**: parent message re-renders recreated attachment objects, resetting the preview effect, aborting authenticated media loads, and leaving `inViewport` stuck false after IntersectionObserver disconnected.

Secondary: backend `mapAttachments` exposed storage URLs that are not reliable browser media sources for private files.

## Fix

1. **Frontend:** stable attachment identity keys; reset/preload only on content change; visibility re-check; image decode recovery; “Refresh preview” UX.  
2. **Backend:** map attachments to `/api/files/content/:id` (`contentUrl`/`url`), preserve `storageUrl`.

## Delivery

| Item | Value |
|---|---|
| FE PR | #79 merged `ad067370` |
| BE PR | #80 merged `1de56ec7` |
| FE production | **`scrolith-frontend-00145-dez`** (p206) 100% |
| BE production | **`scrolith-backend-00116-qoc`** (p206) 100% |
| Rollback FE | `00143-leb` (p2041) or `00138-ruh` (p203) |
| Rollback BE | `00114-bay` |

## Status

| Gate | Result |
|---|---|
| ROOT CAUSE IDENTIFIED | **YES** |
| IMAGE PREVIEW RESTORED (code + deploy) | **YES** |
| NEW PRODUCTION REVISION DEPLOYED | **YES** |
| Authenticated sender/recipient matrix | **Pending operator session** |
| PHASE 20.6 COMPLETE (strict product gate) | **PARTIAL** — deploy complete; operator auth smoke still required for full certification |

## Operator next step

1. Hard refresh https://scrolith.com/messages  
2. Send PNG/JPEG and MP4 to another account  
3. Confirm inline image + Load video on full page and dock  
4. Confirm download still works  
5. Confirm no console CORS/CSP loops  
