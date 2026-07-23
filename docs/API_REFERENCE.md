# Messaging Enhancement API Reference

Base path: `/api/messages`  
Auth: `Authorization` bearer (existing `authMiddleware`)

## Group profile photo

### Update group metadata (includes photo)

```
PATCH /conversations/:id/group
PATCH /groups/:id
```

Body (partial):

```json
{
  "title": "Engineering",
  "description": "…",
  "avatarFileId": "file_…",
  "visibility": "PRIVATE"
}
```

Set `avatarFileId` to `null` or `""` to remove.

**AuthZ:** Owner / Admin (`canEditGroup` / `canEditGroupMeta`).

**Response:** `{ success, data: { id, title, description, avatarFileId, visibility, type } }`

Upload the image first via the existing files API (`FileService.uploadFile`), then pass the returned file id.

---

## Pinned messages

```
GET    /groups/:id/pins
POST   /groups/:id/pins          { "messageId": "…" }
DELETE /groups/:id/pins/:messageId

GET    /conversations/:id/pins
POST   /conversations/:id/pins   { "messageId": "…" }
DELETE /conversations/:id/pins/:messageId
```

**AuthZ:** Member; pin/unpin additionally requires DIRECT participant or group pin policy.

**List response:** `{ success, data: Pin[] }`  
**Mutate response:** `{ success, data: { pins, action } }` where `action` is `created` | `removed` | `noop`.

Realtime: `messages:pin_updated`.

---

## Chat appearance (personal)

```
GET    /conversations/:id/appearance
PUT    /conversations/:id/appearance
DELETE /conversations/:id/appearance
```

**PUT body example:**

```json
{
  "kind": "gradient",
  "color": "#e0e7ff",
  "colorEnd": "#fce7f3",
  "opacity": 1,
  "blurPx": 0
}
```

Photo:

```json
{
  "kind": "photo",
  "fileId": "file_…",
  "imageUrl": "https://…",
  "opacity": 1,
  "blurPx": 12
}
```

**AuthZ:** Active conversation participant only (own row).

Realtime (self): `messages:appearance_updated`.

---

## Errors

| Status | Typical cause |
|--------|----------------|
| 401 | Missing/invalid auth |
| 403 | Not a member / insufficient role |
| 400 | Validation (color, message missing, etc.) |
| 404 | Conversation / message not found |
| 500 | Unexpected server error |

No breaking changes to existing message send/list/read endpoints.
