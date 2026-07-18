# Phase 20.7.5 — Messages Search Root Cause

## Symptom

Messages search field → **“API route not found”**.

## Exact failing request

```
GET /api/messages/search?q=<term>&limit=30
```

Frontend: `MessagingService.searchConversations` → `api.get('/messages/search', …)`.

## Root cause

Controller `searchMessages` **existed** in `messages.controller.ts` but was **never registered** in `messages.routes.ts`.

Result: Express (or global not-found handler) returned 404 with body/message “API route not found”, which the FE displayed raw.

## Secondary issues fixed

- Message-text search was unscoped (would leak cross-conversation if route were live).  
- FE now maps 404 to a friendly recoverable error string.
