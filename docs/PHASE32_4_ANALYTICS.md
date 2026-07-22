# Phase 32.4 — Delivery Analytics

## Sources

| Source | Metrics |
|--------|---------|
| `Notification` | emitted, read rate, categories, event types, live feed |
| `NotificationDelivery` | delivered/failed/pending/suppressed by channel, latency samples |
| `NotificationDigest` | digest deliveries |
| `NotificationAnalyticsCounter` | Phase 32.0 bump metrics |
| `DeviceToken` | device / platform / app version health |
| `NotificationRetryJob` | backlog, dead-letter approx |
| Lifecycle receipts (32.3) | open/display when present |

## Overview metrics

- Notifications emitted / delivered / failed / deferred / suppressed  
- Digest / push / email / in-app deliveries  
- Delivery latency (avg ms over sample)  
- Queue depth, retry backlog  
- Failure rate, read rate  
- Top categories & event types  

## Ranges

`today` · `7d` · `30d` · custom `from`/`to` query params

## Endpoints

- `GET /api/admin/notifications/ops/overview`  
- `GET /api/admin/notifications/ops/delivery`  
- `GET /api/admin/notifications/ops/live`  
- `GET /api/admin/notifications/ops/devices`  
- `GET /api/admin/notifications/ops/queue`  

## Performance

- Bounded samples (live 100, latency 500, category scan 2000)  
- Soft-fail counts when tables missing  
- No N+1 user joins on overview  
