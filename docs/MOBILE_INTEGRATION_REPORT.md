# Mobile Integration Report

## Base URL Handling
- `getApiBaseUrl()` in `Scrolith/src/utils/apiBase.ts`
  - Uses `VITE_MOBILE_API_BASE_URL` if set (mobile override)
  - Falls back to `VITE_API_BASE_URL` or `VITE_BACKEND_URL`
  - Native dev fallback:
    - Android emulator: `http://10.0.2.2:5000/api`
    - iOS simulator: `http://localhost:5000/api`

## Deep Links Mapping
Handled in `Scrolith/src/mobile/deeplinks.ts`
- `Scrolith://gigs/:id` -> `/gigs/:id`
- `Scrolith://jobs/:id` -> `/jobs/:id`
- `Scrolith://orders/:id` -> `/freelancer/dashboard?tab=orders&orderId=:id`
- `Scrolith://messages/:threadId` -> `/messages?thread=:threadId`
- `Scrolith://community/post/:id` -> `/community/post/:id`
- `Scrolith://auth/login` -> `/auth/login`

## Push Notification Payload Examples
Standard payload:
```
{
  "title": "New message",
  "body": "You have a new message from John",
  "data": {
    "type": "message",
    "deepLink": "Scrolith://messages/thread_123",
    "entityId": "thread_123"
  }
}
```

Order update:
```
{
  "title": "Order updated",
  "body": "Order #A102 is now Delivered",
  "data": {
    "type": "order",
    "deepLink": "Scrolith://orders/A102",
    "entityId": "A102"
  }
}
```

Gig moderation:
```
{
  "title": "Gig status changed",
  "body": "Your gig was approved",
  "data": {
    "type": "gig_status",
    "deepLink": "Scrolith://freelancer/dashboard?tab=my-gigs",
    "entityId": "gig_99"
  }
}
```

## Permissions Used
- Camera: only on capture flow (`Scrolith/src/mobile/uploads.ts`)
- Photos/Gallery: when user selects media
- Notifications: requested on authenticated user sessions (`Scrolith/src/mobile/push.ts`)


