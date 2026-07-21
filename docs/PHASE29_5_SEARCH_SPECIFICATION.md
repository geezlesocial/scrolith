# Phase 29.5 — Search Specification

## Categories

`all` | `messages` | `members` | `groups` | `pins` | `files` | `invites`* | `join_requests`* | `audit`*

\*Admin only for cross-tenant visibility.

## Query params

| Param | Description |
|-------|-------------|
| q | Full text / prefix / fuzzy score |
| category | See above |
| conversationId | Scope to one group (membership required) |
| visibility | Filter groups |
| senderId | Message filter |
| dateFrom / dateTo | ISO range |
| cursor | Base64url `{createdAt,id}` for messages |
| limit | 1–50 |

## Highlighting

Matching query wrapped with `«…»` in `highlight` field.

## Saved / recent

Process-local maps per user (Redis-ready later). Not durable across instances until upgraded.

## Ordering

Hits sorted by score desc. Message pagination uses createdAt/id cursor.
