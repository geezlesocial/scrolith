# Scrolith Dashboards — Realtime Event Map (Socket.IO)

Connection & Rooms
-- Client connects to the server via Socket.IO using the proxied endpoint (`/socket.io`) or an explicit backend URL set in `VITE_BACKEND_URL` (e.g., `https://api.example.com/socket.io`). Use the proxy in development to keep same-origin connections and avoid CORS.
- On connect client emits: `auth:join` with payload `{ userId, role }`.
- Server places socket into rooms:
  - `user:{userId}` — per-user room
  - `role:{role}` — role broadcast room (ADMIN, FREELANCER, EMPLOYER)
  - optional resource rooms: `order:{orderId}`, `contract:{contractId}`, `gig:{gigId}` when user views resource (join on demand)

Naming convention
- Server emits events namespaced by domain: `messages:new`, `notifications:new`, `orders:updated`, `contracts:updated`, `wallet:updated`, `gigs:status_updated`, `jobs:status_updated`.
- Client emits intent events: `client:typing`, `client:read:notifications`, `client:ack:order_update` (limited; server persists authoritative state).

Primary server -> client events
- `messages:new`
  - Rooms: `user:{userId}`, `conversation:{conversationId}`
  - Payload: `{ conversationId, message: { id, senderId, text, attachments: [fileId], createdAt } }`

- `notifications:new`
  - Rooms: `user:{userId}`
  - Payload: `{ id, type: 'KYC'|'ORDER'|'WALLET'|'SYSTEM'|'MESSAGE', title, body, link?:string, createdAt }`

- `orders:updated`
  - Rooms: `user:{userId}` (both client & freelancer), `order:{orderId}`
  - Payload: `{ orderId, status, updatedBy, changes?: {...}, timestamp }`

- `contracts:updated`
  - Rooms: `user:{userId}`, `contract:{contractId}`
  - Payload: `{ contractId, event: 'DELIVERABLE_SUBMITTED'|'HOURS_SUBMITTED'|'APPROVED'|'PAUSED'|'TERMINATED', data }`

- `wallet:updated`
  - Rooms: `user:{userId}`
  - Payload: `{ userId, balances: { available, pendingClearance, escrowHeld, total }, change?: { amount, reason }, timestamp }`

- `gigs:status_updated` and `jobs:status_updated`
  - Rooms: `user:{ownerId}`, `gig:{gigId}` or `job:{jobId}`
  - Payload: `{ id, previousStatus, newStatus, adminNote?: string, timestamp }`

Client -> server minimal events (use sparingly)
- `auth:join` — `{ userId, role }` (on connect)
- `client:markNotificationsRead` — `{ ids: [notificationId...] }` -> server marks read, emits `notifications:updated` or `notifications:new` with counts
- `client:message:typing` — `{ conversationId, isTyping }` (ephemeral)

Realtime safety & fallback rules
- Socket is the primary source for event delivery.
- On `disconnect`, client starts polling fallback endpoints every 30–60s:
  - `/api/notifications?unreadOnly=true`
  - `/api/messages/conversations?userId=me`
  - `/api/orders?role=...&status=...`
  - `/api/contracts?role=...&status=...`
  - `/api/wallet/me`
- Stop polling immediately when `connect` or `reconnect` occurs.
- When reconnecting, client requests a short-delta sync endpoint if available (e.g., `/api/sync/changes?since=<ts>`) — optional enhancement.

Idempotency & ordering
- Events include `timestamp` and optional `seq` ID to allow clients to ignore duplicates and apply idempotently.
- For highly-sensitive updates (wallet/escrow), UI should re-fetch the authoritative resource after receiving event before trusting totals for decisions.

Security
- Validate room joins server-side: e.g., only allow `user:{id}` join when token id === id or when user has admin privileges.
- Rate-limit client emits (typing, read) to avoid spam.

Tracking & analytics
- All emitted server events write a lightweight audit record for observability (eventType, userId, payloadSummary, timestamp).

Example flow: deliverable approved
1. Freelancer submits deliverable -> POST /api/contracts/:id/deliverable
2. Server persists submission and emits `contracts:updated` to `contract:{id}` and `user:{employerId}`
3. Employer UI shows toast and updates contract view via socket; if socket offline, polling will fetch contract changes within 30–60s.

