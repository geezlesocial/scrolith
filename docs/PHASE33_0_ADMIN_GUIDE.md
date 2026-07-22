# Phase 33.0 — Admin Guide

## Access

Admin Dashboard → **Intelligence → Scrolitha AI** (`/admin/dashboard?tab=scrolitha-ai`)

## Sections

Overview, Providers, Models, Capabilities, Prompts, Usage, Safety, Health, Feature Flags, Audit Logs, Settings

## Safe operations

1. Leave `masterEnabled` and all capability flags **false** in production until approved.  
2. Never put API keys in the admin UI.  
3. Provider “Test” = health check only.  
4. Confirm high-risk flags (`enableProviderCalls`, `killSwitch`) via browser confirm + server header.  
5. Production blocks `enableProviderCalls` unless `SCROLITHA_AI_ALLOW_PROD_PROVIDER=1`.

## Emergency

- Set kill switch true, or `SCROLITHA_AI_KILL_SWITCH=true`  
- Set provider emergency shutdown  
- Core Scrolith features continue without AI
