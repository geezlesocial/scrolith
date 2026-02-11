# Scrolitha Tool Registry Map

Each tool executes via server-side whitelist only. No free-form API execution is allowed.

## User Scope Tools

| Tool Key | Internal Endpoint | Method | Role Scope | Confirmation | Notes |
|---|---|---|---|---|---|
| `GET_ME_PROFILE` | `/api/profile/me` | GET | freelancer, client, employer, admin | no | Read profile context |
| `GET_UPLOADED_FILES` | `/api/files` | GET | freelancer, client, employer, admin | no | SSOT file browsing |
| `UPLOAD_FILE_TO_LIBRARY` | `/api/files/upload` | POST | freelancer, client, employer, admin | yes | Requires existing `fileId` from Uploaded Files flow |
| `CREATE_GIG` | `/api/gigs` | POST | freelancer, admin | yes | Creates draft gig and records file usage |
| `SUBMIT_GIG_FOR_REVIEW` | `/api/gigs/:id/submit` | POST | freelancer, admin | yes | Submits own gig unless admin |
| `CREATE_JOB` | `/api/jobs` | POST | client, employer, admin | yes | Creates draft job and records file usage |
| `CREATE_TICKET` | `/api/support/tickets/auth` | POST | freelancer, client, employer, admin | yes | Creates support ticket |
| `BLOCK_USER` | `/api/community/blocks` | POST | freelancer, client, employer, admin | yes | Destructive social action |
| `FOLLOW_USER` | `/api/community/follow` | POST | freelancer, client, employer, admin | no | Social follow action |
| `FETCH_NOTIFICATIONS` | `/api/notifications` | GET | freelancer, client, employer, admin | no | Read notifications |
| `MARK_NOTIFICATION_READ` | `/api/notifications/mark-read` | POST | freelancer, client, employer, admin | no | Marks owned notifications only |
| `GET_MY_ORDERS` | `/api/orders` | GET | freelancer, client, employer, admin | no | Role-aware order lookup |
| `GENERATE_PROJECT_BRIEF` | `/api/scrolitha/brief` | POST | freelancer, client, employer, admin | no | Generates brief template |

## Admin Scope Tools

| Tool Key | Internal Endpoint | Method | Role Scope | Confirmation | Notes |
|---|---|---|---|---|---|
| `SEARCH_USERS` | `/api/admin/users` | GET | admin | no | Admin user lookup |
| `UPDATE_USER_STATUS` | `/api/admin/users/:id/status` | POST | admin | yes | Destructive account state update |
| `REVIEW_MONETIZATION_APPLICATION` | `/api/admin/monetization/applications/:id/review` | POST | admin | yes | Approve/reject/suspend applications |
| `CREATE_ROLE` | `/api/admin/rbac/roles` | POST | admin | yes | Staff role creation |
| `UPDATE_ROLE_PERMISSIONS` | `/api/admin/rbac/roles/:id` | PUT | admin | yes | Replaces role permissions |
| `MODERATE_POST` | `/api/admin/community/moderation/post` | POST | admin | yes | Post moderation + audit |
| `REVIEW_ADS` | `/api/admin/community/ads/review` | POST | admin | yes | Ad status review |
| `UPDATE_SCROLITHA_POLICIES` | `/api/admin/scrolitha/config` | PUT | admin | yes | Policy update |
| `VIEW_SCROLITHA_AUDIT_LOGS` | `/api/admin/scrolitha/audit` | GET | admin | no | Read Scrolitha audit stream |

## Policy Enforcement

- Tool execution is denied when any of the following applies:
  - scope mismatch (`user` vs `admin`)
  - role not in `roleScope`
  - tool appears in `denyListedTools`
  - global/module disabled
  - safe mode blocks non-read tools
- Sensitive/destructive actions require explicit confirmation.
- Every execution is audit-logged with redacted payload support.
