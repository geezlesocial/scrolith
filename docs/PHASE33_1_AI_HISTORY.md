# Phase 33.1 — Conversation History

## Models

- `AIConversation`  
- `AIConversationMessage`  

## Operations

New chat, rename (title), pin, delete, search, clear all, export JSON.

## Privacy

- Full message body stored **only** when `aiActivityHistoryEnabled` consent is true  
- Otherwise: `contentPreview` + `contentHash`  
- Export includes privacy notice  
- Honors Phase 33.0 consent settings  

## Routes

`GET/POST/PATCH/DELETE /api/ai/assistant/conversations[/:id]`  
`DELETE /api/ai/assistant/conversations` (clear)  
`GET /api/ai/assistant/export`
