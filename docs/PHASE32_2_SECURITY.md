# Phase 32.2 — Security & Privacy

## Access control

- All preference/focus/digest routes require authentication  
- Digests and preferences scoped by `userId = req.user.id`  
- Admin defaults require admin + quiet-hours permissions  
- Device token ownership remains on existing FCM registration endpoints  

## Mandatory notifications

- Security and emergency events bypass user mute/digest/quiet/focus suppression  
- Security category cannot set `inAppEnabled=false` or `deliveryMode=muted` via user API  

## Content safety

- Digest email HTML escapes titles/bodies/names  
- Email digests avoid dumping highly sensitive raw message content beyond summary text  
- Preview toggle available (`showPreviews`)  

## Injection / CSRF

- Express JSON body only; no template engine injection of user HTML into app shell  
- Same-site session/JWT patterns unchanged  
- Deep links are path-based (`/notifications?digest=…`, `/settings/notifications`)  

## Rate limiting / abuse

- Prefer existing API rate limiters; preference writes are user-scoped and versioned  
- Digest worker bounded (50 users/tick, 200 notifications/user)  

## Secrets

- No secrets stored in preference rows  
- Email uses existing `sendSystemEmail` infrastructure  

## Privacy

- No cross-user preference reads  
- Preference change audit does not log raw notification bodies  
- Marketing defaults off  

## Compliance hooks

- Digest footer links to preference management  
- Future channel unsubscribe flows remain on email infrastructure  
