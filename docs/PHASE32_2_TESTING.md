# Phase 32.2 — Testing

## Unit tests

**File:** `geezle-backend/src/__tests__/phase322.preferencesDigests.unit.test.ts`

Coverage:

- Preference hierarchy order  
- Mandatory / emergency event sets  
- Active vs future channels  
- Category catalog completeness  
- Policy: emergency, mandatory security, future channel suppress  
- Digest eligibility (critical, security, read state)  
- Digest grouping collapse  
- Email HTML escaping  
- Schedule due windows  
- Admin defaults version + future channel clamp  

Also retain:

- `phase320.notificationCenter.unit.test.ts`  
- `phase321.notificationInbox.unit.test.ts`  

## Manual / integration checklist

1. GET/PATCH preferences (with and without migration applied)  
2. Quiet hours create + midnight window (22:00–07:00)  
3. Focus start/stop across two browser sessions  
4. Digest schedule put + worker dry run (`processDueDigests`)  
5. Email digest render (dev SMTP)  
6. In-app digest notification deep link  
7. Settings page `/settings/notifications` tabs  
8. Notification Center Focus control  
9. Android: open settings deep link `/settings/notifications`  
10. Regression: inbox list/search/bulk/pin still works  

## Accessibility checks

- Tablist keyboard focus on settings sections  
- Switch `role="switch"` + labels  
- Time inputs labeled  
- Focus Mode status announced (`aria-live`)  
- Non-color cues for mandatory (badge text)  

## Known test env notes

- Without migration, write APIs return 503 for new tables; GET prefers soft defaults  
- Cron skipped when `NODE_ENV=test` server auto-start is disabled  
