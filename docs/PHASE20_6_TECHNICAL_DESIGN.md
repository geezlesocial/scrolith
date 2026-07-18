# Phase 20.6 — Technical Design

## Goals

1. Restore automatic inline image previews in full-page messaging and dock.  
2. Keep video on-demand load, audio auto-preload policy, document cards.  
3. Preserve download when preview fails.  
4. Avoid identity thrash / request storms / object URL leaks.  
5. Additive backend attachment fields; no destructive migration.

## Architecture

```
Message API attachment
  → normalizeMessageAttachment (legacy fields)
  → getMessageAttachmentIdentityKey (stable)
  → MessageAttachmentRenderer
       → viewport gate
       → fetchAuthenticatedMediaObjectUrl (/files/content/:id + bearer)
       → blob: object URL (refcounted cache)
       → <img> / <video> / <audio> / document card
```

## Canonical attachment view model (normalized)

Existing `NormalizedMessageAttachment` retained (+ identity helper):

| Field | Source |
|---|---|
| id / fileId | file id |
| url | content path preferred |
| mimeType / type | MIME-first classification |
| size / durationMs | metadata |
| requiresAuthFetch | true when content id present |
| canPreview / canStream | category flags |

Backend payload (additive):

- `fileId`, `contentUrl`, `url` (= content path), `storageUrl`, `thumbnailUrl`, `width`, `height`, `duration`

## Security

- No permanent public private-bucket URLs.  
- Content served through existing authorized file endpoint.  
- Do not log signed URL secrets.  
- Conversation membership already enforced by messages + files access.

## Performance

- Identity-stable effects prevent abort/refetch storms.  
- Viewport + lazy image loading retained.  
- Video remains explicit “Load video”.  
- Auth blob cache + disk cache retained.

## Out of scope

- Adaptive bitrate  
- Full media viewer redesign (repair path only)  
- Destructive DB migration  
- Unrelated dashboard work  
