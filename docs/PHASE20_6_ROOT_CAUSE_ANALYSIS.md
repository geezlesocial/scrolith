# Phase 20.6 — Root Cause Analysis

**Severity:** P1 production regression  
**Surface:** `/messages`, messaging dock, shared web shell (Android/desktop)  
**Symptom:** Attachment card shows filename/size/download, but inline image preview shows **“Image preview unavailable”**

## Reproduction context

- Metadata path works (name, size, download control present).
- Preview path fails or never settles on a media `src`.
- Shared renderer: `geezle/src/components/messaging/MessageAttachmentRenderer.tsx`
- Shared normalization/fetch: `geezle/src/services/messagingMedia.ts`
- Backend attachment mapping: `geezle-backend/src/controllers/messages.controller.ts` → `mapAttachments`

## Primary root cause (confirmed in code)

### A. Attachment identity thrash resets preview state permanently

`MessageAttachmentRenderer` reset effect previously depended on the full `normalized` object reference:

```ts
}, [cacheKey, normalized, oversizedPrivate, ...]);
```

Message lists and socket/polling updates commonly recreate attachment objects with **identical content** but **new references**. Each re-render:

1. Abort in-flight authenticated media fetch  
2. Clear `objectUrl` / `directStreamUrl`  
3. Set `inViewport = false`  
4. Bump load generation (discard late successful responses)

The IntersectionObserver effect only re-ran on `cacheKey` and **disconnected after first intersect**. After a thrash reset:

- `inViewport` stays `false` forever  
- Auto-preload never runs again  
- UI settles on **“Image preview unavailable”** with no retry success path unless the user could find Retry (when error was set) — empty-src path often had **no actionable recovery**

This matches production: metadata card remains, automatic inline preview fails after thread activity.

### B. Image decode errors treated as success

```ts
onError={() => setImageReady(true)}
```

Decode/network failures on `<img>` marked the image “ready”, hiding skeleton without recovery. Fixed to clear src and surface retry.

### C. Contributing backend URL shape (secondary)

`mapAttachments` returned `url: file.url` (storage locator). Private messenger objects are not browser-loadable without the authorized content endpoint. Frontend already preferred `id` → `/files/content/:id` when `requiresAuthFetch` is true, but storage URLs encouraged incorrect direct-load attempts in edge cases.

**Fix (additive):** map attachments to `/api/files/content/:id` as `url`/`contentUrl`, preserve `storageUrl` for ops, include `fileId` + thumbnail/dimension metadata.

## Exact failing request path

| Step | Behavior |
|---|---|
| Messages API | Returns attachment `{ id, url: storageUrl?, name, mimeType, size }` |
| `normalizeMessageAttachment` | Sets `fileId` from id, `requiresAuthFetch: true` |
| Renderer | Should `GET /api/files/content/:id` as blob with Authorization |
| Regression | Load aborted/reset by identity thrash before blob → object URL applied |
| UI | `resolvedSrc` empty → **Image preview unavailable** |

When thrash is fixed, the authorized content request is the correct path (bearer, CORS credentials via axios API client).

## Not root causes (ruled out or secondary)

| Candidate | Finding |
|---|---|
| Missing attachment metadata | Present (filename/size) |
| Dock vs full-page different renderer | Same `MessageAttachmentsList` |
| CSP blocking blob: | Blob object URLs are same-origin; not primary |
| Play/desktop native media | WebView uses same SPA renderer |
| Backend only | Secondary URL shape; primary defect is FE lifecycle |

## Fix summary

1. Stabilize attachment identity (`getMessageAttachmentIdentityKey`)  
2. Reset / viewport / preload only on content identity change  
3. Immediate visibility check after remount  
4. Actionable refresh preview UI  
5. Correct image `onError` recovery  
6. Backend contentUrl mapping for attachment payloads  

## Status

| Gate | Result |
|---|---|
| ROOT CAUSE IDENTIFIED | **YES** |
| EXACT FAILING REQUEST IDENTIFIED | **YES** (authorized `/api/files/content/:id` aborted/reset before success) |
