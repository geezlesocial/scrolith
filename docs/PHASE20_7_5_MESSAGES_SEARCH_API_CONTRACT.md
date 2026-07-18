# Phase 20.7.5 — Messages Search API Contract

```
GET /api/messages/search?q=<term>&limit=<1-50>&scope=user|admin
```

Auth: required.

| Param | Rules |
|---|---|
| q | 2–80 chars, trimmed |
| limit | 1–50 default 20 |
| scope=admin | admin only |

## Results

Returns `{ results: MessageSearchResult[], nextCursor, hasMore }`.

Match types:

- `user` / `username` — participant name or username  
- `message` — text match inside **user’s** conversations only  
- Scrolitha via username / label / “ai” / “scrolitha” query tokens  

Visibility: only conversations where the caller is a non-deleted participant.
