# Phase 32.4 — Campaigns & Emergency Broadcasts

## Types

| Type | Notes |
|------|-------|
| platform_announcement | Standard system notice |
| maintenance | Planned maintenance |
| security_notice | Treated with elevated priority / security category |
| feature_release | Product updates |
| emergency | Critical; requires confirmation + reason |

## Targeting (JSON)

```json
{ "all": true }
{ "roles": ["FREELANCER", "EMPLOYER"] }
{ "userIds": ["…"] }
{ "countries": ["PH", "US"] }
```

Audience resolution is **batched** (default `campaignBatchSize` = 100) for operational safety.

## Emergency policy

1. Create campaign with `type: emergency`  
2. `POST .../confirm` with reason (≥5 chars)  
3. `POST .../send` with optional `{ confirm, reason }`  
4. Emit uses `admin.broadcast_emergency` + `isEmergencySystem` so Phase 32.2 delivery policy delivers now  

Audited: `campaign_created`, `emergency_confirmed`, `emergency_broadcast_sent`, `campaign_sent`, `campaign_cancelled`.

## Channels

`IN_APP` and/or `PUSH` (skipPush when PUSH not selected). Email campaign channel can be added later via templates.

## Endpoints

- `GET/POST /ops/campaigns`  
- `PATCH /ops/campaigns/:id`  
- `POST /ops/campaigns/:id/confirm`  
- `POST /ops/campaigns/:id/send`  
- `POST /ops/campaigns/:id/cancel`  
- `GET /ops/campaigns/:id/preview`  
