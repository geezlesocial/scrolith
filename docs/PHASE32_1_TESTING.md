# Phase 32.1 — Testing

## Automated

| Suite | Focus |
|-------|--------|
| `phase321.notificationInbox.unit.test.ts` | Pin limit, action vocabulary, category mapping |
| `NotificationCenter.smoke.test.ts` | UI contract (search, a11y, APIs, sockets) |
| Phase 32.0 taxonomy suite | Regression |

## Manual checklist (pre-deploy)

1. Open `/notifications` signed-in  
2. Generate activity (comment/message) → appears without full reload when socket connected  
3. Search by title fragment  
4. Filter Unread / Pinned / Critical  
5. Select multiple → Mark read / Archive / Pin  
6. Click item → lands on deep-link resource  
7. Navbar badge decreases after mark read  
8. Mobile shell → Full inbox  
9. Offline: loading/error does not crash shell  

## Regression posture

- Phases 22–32.0: additive only; no route removals  
- Messaging/HV/System Backup/Auth untouched  
