# Phase 20.7.7 — Last Message Contract

## Conversation DTO (additive)

| Field | Type | Notes |
|---|---|---|
| `last_message` / `lastMessage` | string | Human preview; never blank when a visible message exists |
| `last_message_at` / `lastMessageAt` | ISO string | Activity time |
| `last_message_preview_kind` / `lastMessagePreviewKind` | string | `image` \| `video` \| `audio` \| `voice` \| `pdf` \| `document` \| `file` \| `attachments` \| `text` \| `deleted` \| `empty` \| … |
| `last_message_attachment_count` / `lastMessageAttachmentCount` | number | Count used for pluralization |

## Message summary (logical)

```json
{
  "messageId": "…",
  "conversationId": "…",
  "senderId": "…",
  "text": null,
  "messageType": "image",
  "attachments": [{ "id": "…", "mimeType": "image/png", "fileName": "a.png", "kind": "image" }],
  "isDeleted": false,
  "createdAt": "…"
}
```

## Precedence

1. Deleted → deleted label  
2. Non-empty trimmed text (caption) → text  
3. Processing / failed upload metadata → status label  
4. Attachments → kind label  
5. Stored `lastMessageText` fallback  
6. Truly no visible message → empty (client shows “No messages”)

## Privacy

No signed URLs, bucket keys, or storage paths in preview fields.
