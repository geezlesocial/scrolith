# Phase 33.0 — Testing

## Backend

`geezle-backend/src/services/scrolithaAi/__tests__/scrolithaAi.foundation.spec.ts`

Covers: privacy, redaction, safety, injection wrap, routing, fallbacks, prompts, structured outputs, cache restrictions, mock provider, quotas, execute lifecycle (master off, consent, prohibited, mock success, capability flags, kill switch), notification hook flag-disabled fallback.

## Frontend

`geezle/src/pages/settings/__tests__/AISettings.a11y.spec.tsx`

Covers: disclosure note, consent switches, usage table, save control.

## Integration expectations (manual / future CI)

- Feature → gateway → MOCK  
- Consent denial → no provider call  
- Sensitive → internal only  
- Notification flag off → Phase 32 deterministic path  

## Regression

Phases 22–32.4 code paths unchanged by additive mounts only.
