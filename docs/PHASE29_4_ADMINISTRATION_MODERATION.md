# Phase 29.4 — Enterprise Messaging Groups Administration & Moderation

| Field | Value |
|-------|--------|
| **Phase** | 29.4 |
| **Status** | Implementation complete (**not deployed**) |
| **Date** | 2026-07-21 |
| **Deploy** | **Forbidden** |
| **DB** | No production migration apply; uses Phase 29.1 tables when present |

---

## Navigation

**Admin → Messages → Messaging Groups** (`messaging-groups` tab)

Also listed under Security & Moderation as **Messaging Groups Admin**.

This is **not** Community Groups (`groups` tab remains separate).

---

## Backend APIs (`/api/admin/messaging-groups`)

| Method | Path | Permission |
|--------|------|------------|
| GET | `/overview` | messaging.groups.read \| chat.read_any |
| GET | `/` | list + filters |
| GET | `/:id` | group inspector |
| POST | `/:id/actions` | moderate |
| GET | `/audit` | audit trail |
| GET | `/join-requests` | pending joins |
| GET | `/templates` | policy templates |
| GET/PUT | `/settings` | global defaults (admin) |
| GET | `/export` | export groups/audit |
| GET | `/metrics` | admin + realtime counters |

### Actions supported

`lock`, `force_lock`, `emergency_lockdown`, `unlock`, `archive`, `disable`, `freeze`, `unarchive`, `set_mode`, `set_visibility`, `transfer_ownership`, `kick`, `ban`, `set_role`, `revoke_invite`, `apply_template`, `delete_message`

Every privileged action writes **GroupModerationAction** audit + optional realtime fan-out.

---

## RBAC

Seeds:

- `messaging.groups.read`
- `messaging.groups.moderate`
- `messaging.groups.admin`
- `messaging.groups.export`

Platform `isAdmin` bypass remains. Moderator role includes read + moderate.

---

## Frontend

`MessagingGroupsAdmin.tsx` sections:

Overview · Groups directory · Detail inspector · Join requests · Audit · Policies/templates · Analytics · System settings · Danger zone

---

## Observability

`groupAdminMetrics`: views, actions, restrictions, lockdowns, invites revoked, promotions, bans, reports processed.

---

## Rollback

Revert BE/FE commits. No required migration. Unused routes are inert.
