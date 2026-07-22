# Phase 32.4 — Admin Guide

## Access

1. Sign in as admin/staff with **Journeys** permissions (`journeys.read` minimum; manage templates/runs for writes).  
2. Open **Admin Dashboard → Notification Ops**.  

## Daily ops checklist

1. **Overview** — check failure rate and retry backlog.  
2. **Failures** — inspect error codes/messages.  
3. **Retry Queue** — Enqueue from failures → Retry or Cancel.  
4. **Device Health** — watch invalid tokens / platform mix.  
5. **Queue Health** — digest cron status and depth.  

## Sending a platform announcement

1. Campaigns → fill name, title, body.  
2. Type: Platform announcement (or Feature release / Maintenance).  
3. Create & send (bounded batch).  
4. Verify Live Activity / Overview counters.  

## Emergency broadcast

1. Type: **Emergency**.  
2. Provide a clear **reason**.  
3. Confirm & send — audited.  
4. Emergency bypasses optional preference suppression via delivery policy.  

## Templates

1. Create with key, channel, title/body (`{{name}}` variables).  
2. Publish.  
3. Preview with sample variables.  
4. Use version/rollback for changes.  

## Feature flags

Toggle without deploy: Notification Center, Digests, Focus Mode, Quiet Hours, Rich Actions, Delivery Receipts, Campaigns, etc. Changes are audited.

## Retention

Settings → Retention: configure days for events, delivery logs, audit, analytics, digests, lifecycle. Values clamped 7–3650 days. **Actual purge jobs** should be scheduled operationally after migration approval.

## Security notes

- Never expose full push tokens in UI.  
- Emergency requires reason + confirmation.  
- All admin mutations write `NotificationAudit`.  
