# Phase 33.0 — Prompt Registry

## Record fields

Prompt ID, key, capability, version, status, system instructions, input template, output schema name, locale, max context, safety policy, timestamps.

## Statuses

`draft` | `testing` | `published` | `deprecated` (rollback supported via admin API)

## Seeds

Foundation prompts for all eight capabilities under `AIPromptRegistry` memory seeds.

## Rules

- No arbitrary user-controlled system prompts from end users  
- Admin can create/publish only after authz  
- Locale-specific variants with `en` fallback  
- Template tokens: `{{content}}`, `{{locale}}`, `{{context}}`
