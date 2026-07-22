# Phase 33.0 — Database

## Migration

`prisma/migrations/20260722190000_phase330_scrolitha_ai_foundation/migration.sql`

**Additive only. Do not apply to production without approval.**

## Models

- AIProviderConfiguration  
- AIModelConfiguration  
- AICapability  
- AIPrompt / AIPromptVersion  
- AIRequest  
- AIResponseMetadata  
- AIUsageLedger  
- AIConsent  
- AISafetyDecision  
- AIFeatureFlag  
- AIAuditLog  
- AIProviderHealthSnapshot  

## Storage principles

- Hashes / references preferred over full prompts  
- No provider secrets in DB  
- Soft-fail code paths if tables missing (memory fallback) for local/dev without migration
