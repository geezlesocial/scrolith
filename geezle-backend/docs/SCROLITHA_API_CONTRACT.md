# Scrolitha API Contract

Base namespace is additive and isolated:
- User: `/api/scrolitha/*`
- Admin: `/api/admin/scrolitha/*`

All responses follow:
```json
{ "success": true, "data": {}, "message": "" }
```

## User Endpoints

### POST `/api/scrolitha/chat`
Request:
```json
{
  "message": "Create a gig",
  "context": { "page": "/freelancer/dashboard", "entityId": "optional" },
  "conversationId": "optional"
}
```
Response:
```json
{
  "success": true,
  "data": {
    "conversationId": "c_123",
    "reply": "I prepared one action...",
    "suggestedActions": [
      {
        "actionId": "plan_1",
        "actionKey": "create_gig",
        "toolKey": "CREATE_GIG",
        "summary": "Create a gig draft.",
        "requiresConfirmation": true,
        "paramsPreview": {},
        "tool": { "endpoint": "/api/gigs", "method": "POST" }
      }
    ],
    "needsConfirmation": true,
    "draftChanges": {}
  },
  "message": "Scrolitha response ready"
}
```

### POST `/api/scrolitha/execute`
Request:
```json
{
  "actionId": "plan_1",
  "confirmed": true,
  "params": { "title": "My Gig", "price": 50 }
}
```
Response (completed):
```json
{
  "success": true,
  "data": {
    "success": true,
    "result": { "gigId": "gig_1", "status": "draft" },
    "emittedEvents": ["scrolitha:action_completed", "gigs:status_updated"],
    "actionId": "plan_1",
    "deepLink": "/freelancer/dashboard?tab=gigs"
  },
  "message": "Action executed"
}
```
Response (confirmation missing):
```json
{
  "success": true,
  "data": {
    "success": false,
    "needsConfirmation": true,
    "message": "Confirmation is required for this action."
  },
  "message": "Action pending confirmation"
}
```

### GET `/api/scrolitha/history?limit=20`
Response:
```json
{
  "success": true,
  "data": [
    {
      "id": "c_123",
      "scope": "user",
      "status": "open",
      "updatedAt": "...",
      "messages": [
        { "id": "m_1", "sender": "user", "content": "Create a gig", "createdAt": "..." },
        { "id": "m_2", "sender": "assistant", "content": "I prepared one action...", "createdAt": "..." }
      ]
    }
  ],
  "message": "Scrolitha history loaded"
}
```

### POST `/api/scrolitha/feedback`
Request:
```json
{ "conversationId": "c_123", "rating": 5, "note": "Helpful" }
```
Response:
```json
{
  "success": true,
  "data": { "id": "fb_1", "conversationId": "c_123", "rating": 5, "note": "Helpful" },
  "message": "Scrolitha feedback recorded"
}
```

## Admin Endpoints

### POST `/api/admin/scrolitha/chat`
Admin-scoped chat planning endpoint (same payload/shape as user chat). Use this from admin console.

### POST `/api/admin/scrolitha/execute`
Admin-scoped execution endpoint (same payload/shape as user execute). Use this from admin console.

### GET `/api/admin/scrolitha/config?scope=admin|user`
Response:
```json
{
  "success": true,
  "data": {
    "scope": "admin",
    "enabled": true,
    "safeMode": false,
    "requireConfirmationByDefault": true,
    "lowRiskAutoExecute": false,
    "denyListedTools": [],
    "promptBlocklist": [],
    "userRateLimitPerMinute": 30,
    "adminActionCapPerMinute": 10
  },
  "message": "Scrolitha config loaded"
}
```

### PUT `/api/admin/scrolitha/config`
Request:
```json
{
  "scope": "admin",
  "enabled": true,
  "safeMode": false,
  "requireConfirmationByDefault": true,
  "lowRiskAutoExecute": false,
  "denyListedTools": ["UPDATE_USER_STATUS"],
  "promptBlocklist": ["ignore previous instructions"],
  "userRateLimitPerMinute": 30,
  "adminActionCapPerMinute": 10
}
```
Response:
```json
{ "success": true, "data": { "scope": "admin", "enabled": true }, "message": "Scrolitha config updated" }
```

### GET `/api/admin/scrolitha/skills?includeInactive=true`
Returns skill rows with `id,key,name,roleScope,description,inputsSchema,stepsSchema,successCriteria,isActive,version`.

### POST `/api/admin/scrolitha/skills`
Request:
```json
{
  "key": "create_gig",
  "name": "Create a Gig",
  "roleScope": ["freelancer"],
  "description": "Guides gig creation",
  "inputsSchema": [],
  "stepsSchema": [],
  "successCriteria": []
}
```
Response: created skill row.

### PUT `/api/admin/scrolitha/skills/:id`
Supports partial updates plus `bumpVersion: true`.

### DELETE `/api/admin/scrolitha/skills/:id`
Response:
```json
{ "success": true, "data": { "id": "skill_1" }, "message": "Scrolitha skill deleted" }
```

### GET `/api/admin/scrolitha/audit?cursor=&limit=&scope=&actorId=`
Response:
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "audit_1",
        "actorId": "user_1",
        "actorRole": "admin",
        "actorScope": "admin",
        "eventType": "action_executed",
        "toolKey": "REVIEW_MONETIZATION_APPLICATION",
        "resultStatus": "ok",
        "resultSummary": "Monetization application reviewed.",
        "createdAt": "..."
      }
    ],
    "nextCursor": "audit_2"
  },
  "message": "Scrolitha audit loaded"
}
```

### GET `/api/admin/scrolitha/analytics`
Response:
```json
{
  "success": true,
  "data": {
    "totals": {
      "conversations": 12,
      "actions": 34,
      "completedActions": 30,
      "failedActions": 4,
      "failureRate": 0.117,
      "avgDurationSeconds": 2.3,
      "avgRating": 4.5,
      "feedbackCount": 8,
      "estimatedMinutesSaved": 60
    },
    "topTools": [{ "toolKey": "CREATE_GIG", "count": 10 }],
    "taskBreakdown": { "create_gig": 10 }
  },
  "message": "Scrolitha analytics loaded"
}
```

### GET `/api/admin/scrolitha/tools`
Returns the full whitelisted tool registry metadata.

## Realtime Events

Server emits:
- `scrolitha:config_updated`
- `scrolitha:skills_updated`
- `scrolitha:action_completed`
- plus domain events from tool execution (for example `gigs:status_updated`, `jobs:status_updated`, `notifications:new`).

Clients should re-fetch data on socket events; fallback polling interval is 60s.
