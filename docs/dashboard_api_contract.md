# Scrolith Dashboards — API Contract

This document defines API endpoints, request/response payloads, auth requirements and error formats for the Freelancer and Employer dashboards. All responses MUST follow the global response standard:

Success:
{
  "success": true,
  "data": <payload>,
  "message": "optional"
}

Error:
{
  "success": false,
  "error": "Human readable message",
  "code": "OPTIONAL_ERROR_CODE"
}

All endpoints require `Authorization: Bearer <token>` unless noted.

---

## Authentication / Common
(No auth endpoints here — use existing auth system.)

## Freelancer Overview
GET /api/freelancer/overview
Auth: Bearer
Query: none
Response data example:
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

Errors: 401 unauthorized, 500 server error

---

## Uploaded Files (global SSOT)
GET /api/files
Auth: Bearer
Query params: page, perPage, type, search, usedOnly (optional)
Response data example (list):
[
  {
    "id": "file_123",
    "url": "https://.../file_123.jpg",
    "name": "logo.png",
    "type": "image/png",
    "size": 18392,
    "uploadedAt": "2026-01-17T10:00:00Z",
    "uploadedBy": "user_45",
    "usedIn": [
      {"type":"gig","id":"gig_1","label":"Logo Design Gig"}
    ]
  }
]

POST /api/files
Auth: Bearer
Content-Type: multipart/form-data
Body: file multipart field `file`, optional `name`, `tags`
Response: created file resource same schema as above

DELETE /api/files/:id
Auth: Bearer
Permissions: Owner or admin
Response: success true

Notes:
- All uploads must write to this endpoint. UI flows must open FilePicker that calls this API to upload/select.
- Attach `ownerId` server-side from token to ensure ownership.

---

## Gigs (Freelancer)
GET /api/gigs?ownerId=me&role=freelancer&status=&page=&perPage=
Response: list of gigs with fields: id, title, slug, description, price, currency, status, views, clicks, conversions, categories[], media: [fileId]

POST /api/gigs
Auth: Bearer
Body:
{
  "title": "...",
  "description":"...",
  "price": 50.0,
  "currency":"USD",
  "categories": ["cat_id"],
  "media": ["file_123"],
  "deliverables": [...] 
}
Response: created gig

PUT /api/gigs/:id
Auth: Bearer
Body: partial gig update
Permissions: owner only

DELETE /api/gigs/:id
Auth: Bearer
Permissions: owner only

POST /api/gigs/:id/submit
Auth: Bearer
Purpose: submit for review
Response: updated status

POST /api/gigs/:id/pause
POST /api/gigs/:id/activate

GET /api/categories/gigs
Auth: Bearer
Read-only categories supplied by admin

---

## Orders
GET /api/orders?role=freelancer&status=&page=&perPage=
Response: list of orders with minimal metadata (id, status, buyerId, freelancerId, total, currency, createdAt)

GET /api/orders/:id
Response includes timeline, milestones, files (file ids), messages thread id

POST /api/orders/:id/deliver
Auth: Bearer
Body: { "files": ["file_1"], "note":"..." }
Response: updated order state (delivered)

POST /api/orders/:id/request-info
Body: { "message":"..." }

POST /api/orders/:id/propose-revision
Body: { "message":"..." }

---

## Wallet & Withdrawals
GET /api/wallet/me
Response: { available: 210.0, pending: 50.0, escrow: 100.0 }
GET /api/wallet/me/transactions?page=&perPage=

POST /api/withdrawal/request
Body: { methodId: "bank_1", amount: 100.00 }
Response: created withdrawal record

GET /api/withdrawal/me
Response: list of withdrawals with status

---

## KYC
GET /api/kyc
Response: { status: "not_submitted|pending|approved|rejected", data: { fullName, address, mobile, dob, nationality, idFileId } }

POST /api/kyc
Body: { fullName, address, mobile, dob, nationality, idFileId }
Response: updated/created record

---

## Hourly Contracts / ATM Tracker
GET /api/hourly/contracts
Response: list of hourly contracts the freelancer is part of

POST /api/contracts/:id/tracking/start
Body: { sessionMetadata?: {} }
Response: { trackingId, startedAt }

POST /api/contracts/:id/tracking/stop
Body: { trackingId, summary?: "" }
Response: persisted time entry

GET /api/contracts/:id/time-entries
Response: list of time entries

POST /api/contracts/time-entries/:id/submit
(Optional) submit for review

---

## Employer: Overview & Jobs
GET /api/employer/overview
Response: { activeContracts, openJobs, proposalsReceived, escrowBalance, spendThisMonth }

Jobs endpoints:
GET /api/jobs?ownerId=me
POST /api/jobs
PUT /api/jobs/:id
DELETE /api/jobs/:id
POST /api/jobs/:id/submit
POST /api/jobs/:id/pause
POST /api/jobs/:id/activate
POST /api/jobs/:id/close
GET /api/categories/jobs

Jobs must use `media` file IDs from Uploaded Files.

---

## Proposals & Offers
GET /api/proposals?jobId=...
POST /api/proposals/:id/accept
POST /api/proposals/:id/reject
POST /api/proposals/invite { freelancerId, jobId, message }

Accepting a proposal creates a contract/order and returns the new contract id.

---

## Contracts
GET /api/contracts?role=...&page=&perPage=
GET /api/contracts/:id
POST /api/contracts/:id/approve-deliverable
POST /api/contracts/:id/request-changes
POST /api/contracts/:id/pause
POST /api/contracts/:id/terminate
POST /api/contracts/time-entries/:id/approve

---

## Payments & Escrow
GET /api/escrow?ownerId=me
POST /api/escrow/:contractId/fund
Body: { amount, paymentMethodId }
POST /api/escrow/:contractId/release
POST /api/escrow/:contractId/dispute
GET /api/invoices?ownerId=me

---

## Favorites
GET /api/favorites?ownerId=me
POST /api/favorites
Body: { type: 'gig'|'job', targetId }
DELETE /api/favorites/:id

---

## Briefs (AI)
GET /api/briefs?ownerId=me
POST /api/briefs/generate
Body: { prompt, requirements }
POST /api/briefs
POST /api/briefs/:id/use-to-create-job

---

## Notifications & Messages
GET /api/notifications?page=&perPage=&unreadOnly=
POST /api/notifications/mark-read { ids: [] }

Messages: keep existing `messages` endpoints. Ensure these exist:
GET /api/messages/conversations?userId=me
GET /api/messages/conversations/:id/messages?page=&perPage=
POST /api/messages/conversations/:id/send { text, files: [fileId] }

---

## Categories (Read-only)
GET /api/categories/gigs
GET /api/categories/jobs

---

## Standard Errors & Codes
- 400 Bad Request — malformed input
- 401 Unauthorized — invalid/missing token
- 403 Forbidden — role/ownership violation
- 404 Not Found — resource missing
- 409 Conflict — business constraint (e.g., gig already submitted)
- 429 Rate Limit
- 500 Server Error

Each error response must include `success: false` and `error` message. Optionally include `code`.

---

## Notes on Permissions
- Server MUST enforce owner scoping: `ownerId` inferred from token.
- Admin-only operations restricted to admin API or admin dashboard.
- All endpoints that mutate data must validate role and ownership explicitly and return 403 on violation.

---

## Versioning and Stability
- Prefix API v1: optionally support /api/v1/ for breaking changes in future.
- Add `X-Request-Id` header to responses to aid debugging.

End of contract.

