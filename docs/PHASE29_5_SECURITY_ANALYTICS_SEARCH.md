# Phase 29.5 — Security, Analytics, Search & Enterprise Intelligence

| Field | Value |
|-------|--------|
| **Phase** | 29.5 |
| **Status** | Implementation complete (**not deployed**) |
| **Date** | 2026-07-21 |
| **Deploy** | **Forbidden** |
| **Production migrations** | **Not applied** |

---

## Summary

Enterprise search, public discovery, analytics/health scores, abuse heuristics, security helpers, admin search UI, and **additive index migration** (not applied). Builds on 29.1–29.4 without replacing existing `/messages/search` or platform analytics.

---

## User APIs

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/messages/groups/search` | Permission-aware enterprise search |
| POST | `/api/messages/groups/search/saved` | Saved searches (memory) |
| GET | `/api/messages/groups/discover` | PUBLIC groups only |
| GET | `/api/messages/groups/:id/health` | Member/admin health score |

## Admin APIs

| Method | Path |
|--------|------|
| GET | `/api/admin/messaging-groups/search` |
| GET | `/api/admin/messaging-groups/analytics?days=` |
| GET | `/api/admin/messaging-groups/:id/health` |

---

## SECRET isolation

- Discovery: **PUBLIC only**
- Member search: only groups user belongs to
- Non-member access to private/secret metadata → empty/403, no leak

---

## Abuse protection

`groupAbuseProtection.service.ts` — flood, mass mentions, typing spam, invite abuse, attachment bursts.  
Send path may return `abuseSignals` recommendations; **no automatic punishments** unless env `MSG_GROUP_ABUSE_AUTO_RESTRICT=1` (still only suggested flag).

---

## Migration

`20260721160000_phase295_messaging_groups_search_indexes` — **new additive indexes only**. Does not modify 29.1 migration. **Not applied in this phase.**

---

## FE

- `MessagingService.searchMessagingGroups` / `discover` / `health`
- Admin Messaging Groups → **Search** tab + analytics sample health
