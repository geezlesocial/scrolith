# Phase 20.4.1 — Prevention Actions

## Immediate (done)

1. **Source-order regression tests** for Overview TDZ  
2. **Emergency rollback runbook** validated (p203 tag)  
3. **Incident RCA** documented  

## Near-term (recommended)

| Action | Owner | Notes |
|---|---|---|
| Enable ESLint `no-use-before-define` (vars: true) for dashboard package | FE | Catches TDZ at lint time |
| Add React Testing Library smoke: mount Freelancer + Employer Overview with mocks | FE | Runtime catch |
| Production preview gate on Overview routes in CI | FE/DevOps | Puppeteer/Playwright against `vite preview` |
| Code-review checklist: “new useCallback deps declared above?” | FE | PR template |

## Process

- Prefer pure data fetches in callbacks; derive UI focus queues in later `useMemo`  
- Never add new deps to early hooks without scanning for later `const` bindings  
- Lazy Overview chunks require explicit smoke; homepage green ≠ dashboard green  
