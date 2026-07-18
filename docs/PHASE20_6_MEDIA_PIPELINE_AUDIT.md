# Phase 20.6 — Media Pipeline Audit

## Path audited

```
messages.controller mapAttachments
  → client normalizeMessageAttachment
  → MessageAttachmentRenderer
  → fetchAuthenticatedMediaObjectUrl
  → GET /api/files/content/:id (Authorization)
  → blob object URL
  → <img>/<video>/<audio>
```

## Findings

| Area | Finding | Action |
|---|---|---|
| Field names | id, url, mimeType, size present | Normalize + contentUrl |
| Relative vs absolute | Storage URLs mixed | Prefer `/api/files/content/:id` |
| Private objects | Not browser-direct | Auth blob path required |
| Signed URL expiry | Storage URLs may expire | Avoid as img src |
| CORS | API files content returns ACAO credentials | Use axios API client |
| CSP (API error body) | Strict img-src on error JSON | Not SPA CSP |
| Renderer thrash | Identity reset stuck inViewport | **Fixed** |
| Decode error | onError marked ready | **Fixed** |
| Dock vs full page | Shared MessageAttachmentsList | Unified |
| Blob revoke | Refcounted cache | Unchanged |
| Lazy load | IntersectionObserver + margin | Improved immediate visibility |

## Historical attachments

Still work via file id + content endpoint after FE fix even if storage URL format is legacy.
