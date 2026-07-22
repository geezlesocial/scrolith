# Phase 33.2 — Monitoring

## Signals

| Area | What to watch |
|------|----------------|
| Cloud Run | Revision CPU/memory, request latency, error rate |
| AI gateway | Process metrics via admin overview (`requests`, `blocks`, `consentRejections`) |
| Discovery | Admin **Discovery Analytics**: acceptance, dismissal, CTR proxy, diversity |
| Provider | Health snapshots; `enableProviderCalls` must stay **false** in prod unless approved |
| Feed / search | Host latency unchanged when AI flags OFF |
| DB | Connection count; AI tables idle when flags OFF |

## Alerts (operator)

1. 5xx spike on `/api/ai/*` after traffic shift  
2. Cloud Run cold-start / OOM after deploy  
3. Migration failure on new revision startup (`migrate:apply`) — should no-op if pre-applied  
4. Unexpected `enableProviderCalls=true` in production  

## Internal enable path

AI discovery flags remain **OFF** by default after deploy.  
Internal enablement: Admin → Scrolitha AI → Feature Flags (requires RBAC + risk confirmation for high-risk flags).  
**Do not** set `SCROLITHA_AI_ENABLE_PROVIDER_CALLS` / `SCROLITHA_AI_ALLOW_PROD_PROVIDER` without explicit approval.
