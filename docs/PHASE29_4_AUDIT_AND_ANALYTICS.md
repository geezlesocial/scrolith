# Phase 29.4 — Audit & Analytics

## Audit

Source table: `GroupModerationAction` (Phase 29.1)

Admin list: `GET /api/admin/messaging-groups/audit`

Export: `GET /api/admin/messaging-groups/export?type=audit`

Events include: group lock/unlock/archive, role changes, kick/ban, invite revoke, template apply, moderator delete_message, plus user-side 29.1/29.2 audits.

**Never includes message body text.**

## Analytics

Overview aggregates:

- Group counts by visibility
- Messages today (GROUP conversations only)
- Pending join requests / active invites
- Locked / announcement group counts
- 7-day message activity series
- Largest groups by memberCount
- Realtime metrics snapshot (Phase 29.2)
- Admin metrics snapshot

## Metrics keys

- group_admin_views_total
- group_admin_actions_total
- group_restrictions_total
- group_lockdowns_total
- group_invites_revoked_total
- group_member_promotions_total
- group_member_bans_total
- group_reports_processed_total
