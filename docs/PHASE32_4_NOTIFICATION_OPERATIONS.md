# Phase 32.4 — Enterprise Notification Operations

## Status

**Implemented (code only).**  
`deploymentPerformed: false` · `migrationApplied: false`

## Purpose

Complete the Notification Center initiative with admin operational tooling: monitoring, analytics, retries, templates, campaigns, emergency broadcasts, feature flags, retention, and audit — without changing user-facing inbox, preferences, digests, Android, or FCM.

## Architecture

```
Admin Dashboard (Notification Ops tab)
  → /api/admin/notifications/ops/*
      → opsOverview (aggregates Notification, Delivery, Digest, DeviceToken, Retry)
      → opsRetry (NotificationRetryJob + re-push)
      → opsTemplate (NotificationOpsTemplate versioned)
      → opsCampaign (NotificationCampaign + emit via NotificationService)
      → opsConfig (feature flags, retention, settings)
  → NotificationAudit + analytics counters
```

## Admin UI

**Admin → Notification Ops** (`notification-ops` tab)

Sections: Overview · Live Activity · Delivery · Campaigns · Templates · Retry Queue · Failures · Queue Health · Device Health · Analytics · Feature Flags · Audit Logs · Settings

## Migration

`20260722180000_phase324_notification_operations` — additive only, **not applied to production**.

Tables: `NotificationOpsTemplate`, `NotificationCampaign`, `NotificationCampaignDelivery`, `NotificationRetryJob`, `NotificationOpsConfig`.

## Preserved

- Phases 32.0–32.3 user APIs and mobile behavior  
- Journey Center templates/flows (separate product surface)  
- FCM / Android channels / digests / focus / quiet hours  

## Deferred / limits

- Campaign audience is **bounded batch** (default 100) for safe ops; full fan-out scaling is infrastructure work  
- Click-through rate requires richer lifecycle adoption (returns null when unavailable)  
- Phase 33 AI prioritization not started  

## Safety

No production deploy, migration apply, or production feature-flag enablement in this phase.
