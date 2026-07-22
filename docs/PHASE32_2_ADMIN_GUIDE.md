# Phase 32.2 — Admin Guide (Notification Defaults)

## Scope

Minimal admin controls only. Full notification operations dashboard is Phase 32.4.

## Endpoints

Base: `/api/admin/notifications`

| Action | Method | Path |
|--------|--------|------|
| Read defaults | GET | `/defaults` |
| Update defaults | PUT | `/defaults` |
| Reset to code defaults | POST | `/defaults/reset` |

Requires admin auth + `journeys.quiet_hours.read` / `journeys.quiet_hours.write`.

## Configurable fields

- Default category preferences (in-app / push / email / deliveryMode / minPriority)  
- Default channel preferences (SMS/Desktop/Webhook forced off)  
- Mandatory security event type list  
- Emergency system event type list  
- Allowed digest modes  
- Max digest retention days  
- Quiet-hours defaults  
- Max focus duration  
- Email digest enable / push digest alert enable  
- Per-category policy locks (e.g. security force immediate)  
- Feature flags: preferencesV2, focusMode, digests, quietHours, eventOverrides  

## Audit

Updates write `NotificationAudit` action `admin_notification_defaults_updated`.

## Notes

- Defaults are process-memory in 32.2 (restart resets unless code defaults used).  
- Durable admin store can be promoted in 32.4 without breaking user tables.  
- Do not enable production feature flags or run digests against production until migration + deploy are approved.  
