# Phase 32.4 — Admin Notification Ops API

Base: `/api/admin/notifications`  
Auth: admin middleware + RBAC (`journeys.read` / `journeys.templates.manage` / `journeys.runs.manage`)

## Overview & health

| Method | Path |
|--------|------|
| GET | `/ops/overview?range=today\|7d\|30d` |
| GET | `/ops/delivery` |
| GET | `/ops/live` |
| GET | `/ops/audit` |
| GET | `/ops/devices` |
| GET | `/ops/queue` |

## Retries

| Method | Path |
|--------|------|
| GET | `/ops/retries` |
| POST | `/ops/retries/enqueue` |
| POST | `/ops/retries/batch` |
| POST | `/ops/retries/:id/retry` |
| POST | `/ops/retries/:id/cancel` |
| GET | `/ops/failures` |

## Templates

| Method | Path |
|--------|------|
| GET | `/ops/templates` |
| POST | `/ops/templates` |
| PATCH | `/ops/templates/:id` |
| POST | `/ops/templates/:id/publish` |
| POST | `/ops/templates/:id/rollback` |
| POST | `/ops/templates/:id/preview` |
| GET | `/ops/templates/history/:key` |

## Campaigns

| Method | Path |
|--------|------|
| GET | `/ops/campaigns` |
| POST | `/ops/campaigns` |
| PATCH | `/ops/campaigns/:id` |
| POST | `/ops/campaigns/:id/confirm` |
| POST | `/ops/campaigns/:id/send` |
| POST | `/ops/campaigns/:id/cancel` |
| GET | `/ops/campaigns/:id/preview` |

## Config

| Method | Path |
|--------|------|
| GET/PUT | `/ops/feature-flags` |
| GET/PUT | `/ops/retention` |
| GET/PUT | `/ops/settings` |

## Phase 32.2 defaults (still mounted)

| Method | Path |
|--------|------|
| GET/PUT | `/defaults` |
| POST | `/defaults/reset` |

## Compatibility

User `/api/notifications/*` unchanged. Soft 503 when Phase 32.4 tables missing on write paths.
