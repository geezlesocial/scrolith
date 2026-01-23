# Realtime Event Map (Dashboards)

This file documents server <-> client Socket.IO event names, payloads, and rooms specifically for dashboard functionality.

## Auth and join
Client -> Server: `auth:join`
- Payload: { "userId": "user_123", "role": "freelancer" }
- Server action: validate token; if valid, join rooms `user:{userId}`, `role:{role}`
- Server -> Client: `auth:joined` { userId, serverTime }

## Events (server -> client)
- `messages:new`
  Payload: { conversationId, message: { id, senderId, text, files: [fileIds], createdAt }, unreadCount }

- `notifications:new`
  Payload: { id, type, title, body, data: {...}, createdAt }

- `orders:updated`
  Payload: { orderId, status, changedBy, summary, updatedAt }

- `contracts:updated`
  Payload: { contractId, status, summary, updatedAt }

- `wallet:updated`
  Payload: { userId, balance: { available, pending, escrow }, change: { amount, reason } }

- `gigs:status_updated`
  Payload: { gigId, ownerId, oldStatus, newStatus, reason?, updatedAt }

- `jobs:status_updated`
  Payload: { jobId, ownerId, oldStatus, newStatus, updatedAt }

- `proposals:new`
  Payload: { proposalId, jobId, freelancerId, summary }

- `kyc:updated`
  Payload: { userId, status, instructions? }

- `escrow:updated`
  Payload: { contractId, status, balance, updatedAt }

- `realtime:ping`
  Payload: { ts }

## Client -> Server (examples)
- `client:message:read` { conversationId, messageIds }
- `client:typing` { conversationId, isTyping }

## Rooms and targeting
- Private room per user: `user:{userId}`
- Role rooms: `role:freelancer`, `role:employer`
- Resource-specific (optional): `contract:{contractId}`, `gig:{gigId}`

## Fallback polling endpoints & config
Start polling when socket disconnected.
Interval: 30s recommended (up to 60s permitted).
Endpoints to poll:
- GET /api/notifications?unreadOnly=true
- GET /api/messages/conversations?userId=me
- GET /api/orders?role={role}&status=active
- GET /api/contracts?role={role}&status=active
- GET /api/wallet/me

Stop polling on reconnect.

## Implementation notes
- Emit `auth:join` after successful login or token refresh.
- RealtimeProvider should update React Query caches for lists/messages/wallet.
- All server-side events must validate recipients—no client-driven subscriptions without server authorization.

End of realtime map.
