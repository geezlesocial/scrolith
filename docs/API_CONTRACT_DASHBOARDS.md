# Geezle Dashboards — API Contract (Dashboard Scope)

Notes
- All endpoints return JSON using the standard envelope:
  - Success: { "success": true, "data": <payload>, "message": "optional" }
  - Error:   { "success": false, "error": "Human readable message", "code": "OPTIONAL_CODE" }
- All `GET/POST/PUT/DELETE` endpoints require `Authorization: Bearer <token>` (unless marked public).
- Role enforcement: server validates `role` from token; admin-only endpoints under `/api/admin/*`.
- All `userId`/`ownerId` references in query must be `me` or server will validate ownership.

---

## 1. Freelancer (Seller) APIs

### 1.1 GET /api/freelancer/overview
- Auth: required (freelancer)
- Query: none
- Response.data (example):
```
{
  "activeOrders": 3,
  "revisionOrders": 1,
  "earningsThisMonth": 450.5,
  "walletBalance": 210.0,
  "gigViews": 1230,
  "gigClicks": 210,
  "rating": 4.8,
  "reviews": 52,
  "unreadMessages": 2,
  "unreadNotifications": 5
}
```

### 1.2 Gigs
- GET /api/gigs?ownerId=me&role=freelancer&status=&page=&limit=
  - returns list of gigs owned by user (paged)
- GET /api/gigs/:id
- POST /api/gigs
  - Body: { title, description, price, deliveryTime, revisions, categoryId, images: [fileId], packages: [...] }
- PUT /api/gigs/:id
- DELETE /api/gigs/:id
- POST /api/gigs/:id/submit
  - Body: { notes?: string }
- POST /api/gigs/:id/pause
- POST /api/gigs/:id/activate

Response shape (list item):
```
{
  "id":"gig_1",
  "title":"Logo Design",
  "status":"DRAFT|SUBMITTED|UNDER_REVIEW|APPROVED|ACTIVE|REJECTED|PAUSED|ARCHIVED",
  "price": 50.0,
  "views": 123,
  "clicks": 12,
  "media": [{"id":"file_1","url":"...","type":"image/png"}]
}
```

### 1.3 Orders (Freelancer)
- GET /api/orders?role=freelancer&status=&page=&limit=
- GET /api/orders/:id
- POST /api/orders/:id/deliver
  - Body: { files: [fileId], note }
- POST /api/orders/:id/request-info
  - Body: { message }
- POST /api/orders/:id/propose-revision
  - Body: { message }

Order payload (partial):
```
{
  "id":"ord_1",
  "gigId":"gig_1",
  "clientId":"user_1",
  "freelancerId":"me",
  "amount": 120.0,
  "status":"DELIVERED|IN_PROGRESS|COMPLETED|REVISION_REQUESTED|CANCELLED",
  "timeline": [{"event":"created","at":"..."}],
  "files": [{"id":"file_1","url":"..."}]
}
```

### 1.4 Wallet & Withdrawals
- GET /api/wallet/me -> returns balances
- GET /api/wallet/me/transactions?page=&limit=&type=&status=
- POST /api/withdrawal/request
  - Body: { amount, method: 'bank'|'paypal'|'stripe', details: {...} }
- GET /api/withdrawal/me

Wallet response:
```
{
  "balances": { "available": 200.0, "pendingClearance": 50.0, "escrowHeld": 30.0, "total": 280.0 },
  "transactions": [ ... ]
}
```

### 1.5 KYC
- GET /api/kyc -> returns current KYC status
- POST /api/kyc -> submit/update KYC
  - Body: { fullName, dob, country, documents: [fileId], address }
- Response.status: not_submitted | pending | approved | rejected (with message)

### 1.6 Hourly Work / ATM Tracker
- GET /api/hourly/contracts
- POST /api/contracts/:id/tracking/start
  - Body: { sessionMeta?: {...} }
- POST /api/contracts/:id/tracking/stop
  - Body: { durationSeconds?: number }
- GET /api/contracts/:id/time-entries
- POST /api/contracts/time-entries/:id/submit

Time entry example:
```
{ "id": "te_1", "contractId": "c_1", "seconds": 3600, "userId": "me", "status": "PENDING" }
```

### 1.7 Uploaded Files (shared)
- GET /api/files?owner=me&type=&q=&page=&limit=
- POST /api/files (multipart) -> uploads to global Uploaded Files
- DELETE /api/files/:id
- GET /api/files/:id -> returns file metadata including usedIn array

File metadata example is in section 8.

### 1.8 Messages & Notifications (shared)
- GET /api/messages/conversations?userId=me&page=&limit=
- GET /api/messages/conversations/:id/messages?page=&limit=
- POST /api/messages/conversations/:id/messages
  - Body: { text, attachments: [fileId] }
- GET /api/notifications?unreadOnly=true&page=&limit=
- POST /api/notifications/mark-read { ids: [] }

Messages: server answers with conversation objects and counts for `unread`.

---

## 2. Employer (Buyer) APIs

### 2.1 GET /api/employer/overview
- Auth: required (employer)
- Response.data example:
```
{
  "activeContracts": 2,
  "openJobs": 3,
  "proposalsReceived": 5,
  "escrowBalance": 120.0,
  "spendThisMonth": 450.0,
  "unreadMessages": 1,
  "unreadNotifications": 4
}
```

### 2.2 Jobs
- GET /api/jobs?ownerId=me&status=&page=&limit=
- GET /api/jobs/:id
- POST /api/jobs
- PUT /api/jobs/:id
- DELETE /api/jobs/:id
- POST /api/jobs/:id/submit
- POST /api/jobs/:id/pause
- POST /api/jobs/:id/activate
- POST /api/jobs/:id/close

Job payloads mirror Gig payloads; media referenced by `fileId`.

### 2.3 Proposals & Offers
- GET /api/proposals?jobId=&page=&limit=
- POST /api/proposals/:id/accept -> creates contract/order
- POST /api/proposals/:id/reject
- POST /api/proposals/invite { freelancerId, jobId, message }

### 2.4 Contracts & Escrow
- GET /api/contracts?role=employer&page=&limit=
- GET /api/contracts/:id
- POST /api/contracts/:id/approve-deliverable { deliverableId }
- POST /api/contracts/:id/request-changes { message }
- POST /api/contracts/:id/pause
- POST /api/contracts/:id/terminate
- POST /api/contracts/time-entries/:id/approve

- GET /api/escrow
- POST /api/escrow/:contractId/fund { amount }
- POST /api/escrow/:contractId/release
- POST /api/escrow/:contractId/dispute

---

## 3. Shared / Admin (dashboard-scoped)

### 3.1 Admin Analytics (admin-only)
- GET /api/admin/analytics/activity?range=7 -> arrays of { date, messages, newUsers, orders }
- GET /api/admin/analytics/revenue-breakdown?range=30 -> [{name, value}]
- GET /api/admin/platform/settings

### 3.2 Wallet / Admin actions
- GET /api/admin/wallets
- POST /api/wallet/:userId/freeze (admin)
- POST /api/wallet/:userId/unfreeze (admin)
- POST /api/transactions/:id/reverse (admin)

---

## 4. Realtime & Polling endpoints (for fallback)
- Polling endpoints used when sockets disconnected (30–60s):
  - GET /api/notifications?unreadOnly=true
  - GET /api/messages/conversations?userId=me
  - GET /api/orders?role=...&status=...
  - GET /api/contracts?role=...&status=...
  - GET /api/wallet/me

---

## 5. Implementation guidance
- Services under `src/services/*` should wrap these endpoints, return typed payloads, and only use `api.ts` instance.
- All mutating endpoints must return the updated resource if possible.
- Use 200 for success, 4xx for client errors, 5xx server errors. Include `code` for programmatic checks (e.g., `INSUFFICIENT_FUNDS`).

---

Appendix: Uploaded file metadata (example)
```
{
  "id":"file_123",
  "url":"https://cdn.example/.../file_123.png",
  "name":"logo.png",
  "type":"image/png",
  "size":18392,
  "uploadedAt":"2026-01-17T10:00:00Z",
  "uploadedBy":"user_1",
  "usedIn":[ {"type":"gig","id":"gig_1","label":"Logo Design Gig"} ]
}
```
