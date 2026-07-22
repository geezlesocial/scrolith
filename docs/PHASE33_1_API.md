# Phase 33.1 — API

All routes: authenticated. Mounted under `/api/ai`.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/assistant/status` | Surfaces + consent snapshot |
| POST | `/assistant/chat` | Assistant chat |
| POST | `/assistant/rewrite` | Rewrite modes |
| POST | `/assistant/composer` | Composer assist |
| POST | `/assistant/translate` | Translation |
| POST | `/assistant/draft` | Draft by kind |
| POST | `/assistant/search-suggest` | Search query suggestions |
| POST | `/assistant/notifications` | Notification assist (Phase 32 hooks) |
| GET/POST | `/assistant/conversations` | List / create |
| GET/PATCH/DELETE | `/assistant/conversations/:id` | Session mgmt |
| DELETE | `/assistant/conversations` | Clear all |
| GET | `/assistant/export` | Export history |
| GET | `/assistant/prompts` | Prompt library |
| POST | `/assistant/prompts/:id/use` | Run template |
| POST | `/assistant/feedback` | 👍 / 👎 |

Phase 33.0 routes preserved (`/status`, `/preferences`, `/summarize`, …).
