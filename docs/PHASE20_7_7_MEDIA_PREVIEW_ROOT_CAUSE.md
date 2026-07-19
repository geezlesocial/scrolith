# Phase 20.7.7 — Media Preview Root Cause

## Incident

Inbox conversation rows showed **“No messages”** when the latest message was media-only (image/file/etc.), while the open thread rendered the media correctly.

## Production baseline (pre-fix)

| Service | Revision | Tag | Traffic |
|---|---|---|---|
| Backend | scrolith-backend-00132-loh | p2076 | 100% |
| Frontend | scrolith-frontend-00161-bov | p2077 | 100% |

## Trace

1. **Persistence:** Media-only DMs store `text` empty/null and `attachments: [fileId…]`.
2. **On send:** `conversation.lastMessageText` was set to generic `"Sent an attachment"` (improved in this phase to kind labels).
3. **Inbox DTO `buildConversationPayload`:**  
   `last_message = lastVisibleMessage?.text || storedPreview`  
   Empty text is falsy, so stored preview could apply — but:
4. **`mergeConversationPayloads`:**  
   `last_message = lastVisibleMessage?.text || primary?.last_message`  
   Same pattern; did **not** derive preview from attachment MIME/type.
5. **Frontend `normalizeConversation`:**  
   Fallback `messages[last]?.text` only — media-only → `''`.
6. **Frontend merge (`messagingMerge`):** text-only last message.
7. **UI:**  
   - Messages.tsx: `previewText || "No messages"`  
   - MessagingConversationRow: `lastMessage || "No messages yet"`  
   Empty string → incorrect empty label.
8. **Sockets:** `messages:new` payload used `text` only for inbox updates in several handlers → empty preview after receive.

## Root-cause statement

**The inbox preview pipeline treated “no text body” as “no message.”** Latest-message selection included media-only messages, but preview formatters and normalizers only read `message.text`, never attachment kind/MIME. UI then substituted the empty-conversation label.

## Defect locations (pre-fix)

| Layer | Location | Issue |
|---|---|---|
| BE DTO | `buildConversationPayload` | text-only last_message |
| BE merge | `mergeConversationPayloads` | text-only last_message |
| BE delete/edit | `lastMessageText: latest?.text \|\| null` | wiped media previews |
| FE normalize | `messaging.ts` | text-only fallback |
| FE merge | `messagingMerge.ts` | text-only last_message |
| FE inbox | `Messages.tsx` | “No messages” on empty string |
| FE dock | `MessagingConversationRow.tsx` | “No messages yet” on empty string |
| FE socket | Messages/MessageContext handlers | ignored attachments for preview |

Partial attachment awareness existed only in reply snippets and some local helpers (`getMessagePreviewText` / `resolveMessagePreviewText`) and was **not** applied to list normalization consistently.
