# Phase 20.7.1 — Confirmation Security

## Model

1. Scrolitha prepares action plan (existing).  
2. Confirmation required → mint token (`sct_*`).  
3. UI confirmation card shows impact summary.  
4. Client sends `confirmed=true` + `confirmationToken`.  
5. Server revalidates policy, rate limits, and **consumes** token (single-use).  
6. Execute + audit log.

## Token properties

- Scoped to userId, toolKey, actionId  
- Payload hash binding available  
- TTL default 5 minutes  
- Single-use (reuse → TOKEN_USED)  
- User mismatch → TOKEN_USER_MISMATCH  

## Flag

`SCROLITHA_ROLLOUT_CONFIRMATION_TOKENS` — when false, legacy confirmed boolean path remains (still server-side plan ownership checks).
