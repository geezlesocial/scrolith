# Phase 20.7.7 — Attachment Preview Formatter

## Modules

| Runtime | Path |
|---|---|
| Backend | `geezle-backend/src/services/messaging/lastMessagePreview.ts` |
| Frontend | `geezle/src/services/conversationPreview.ts` |

## API

```ts
formatConversationPreview({ message, currentUserId, fallbackPreview, maxLen })
// → { text, kind, icon, isOwnMessage, isDeleted, attachmentCount, isEmpty }

getConversationPreviewText(conversation, { currentUserId })
getMessagePreviewText(message, { currentUserId, fallbackPreview })
```

## Labels (neutral, product-consistent)

| Kind | Label |
|---|---|
| image | Image |
| video | Video |
| audio | Audio |
| voice | Voice message |
| pdf | PDF document |
| document | Document |
| file | File |
| multi same type | N images / N videos / N files |
| mixed | Attachments |
| deleted | This message was deleted |
| empty | No messages |

## Consumers

- Messages inbox row  
- Messaging Dock row (`MessagingConversationRow`)  
- Conversation normalize + merge  
- Socket inbox updates  
- Search conversation payloads (via BE DTO)
