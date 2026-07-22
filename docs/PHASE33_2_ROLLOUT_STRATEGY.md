# Phase 33.2 — Rollout Strategy (future)

1. Apply migration in **non-production** only after approval.  
2. Enable flags in staging with MOCK / internal providers.  
3. Verify feed still uses deterministic order when scores ignored.  
4. Verify security notification path unchanged.  
5. Shadow-mode: log scores without UI.  
6. Limited cohorts with consent + personalization on.  
7. Production enablement requires separate approval phase.  

**Phase 33.2 itself performs no production deploy, migration, or AI provider calls.**
