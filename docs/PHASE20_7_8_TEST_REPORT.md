# Phase 20.7.8 — Test Report

```
npx tsx --test src/services/scrolitha/__tests__/scrolitha.phase2078.publicProfile.spec.ts
```
**2/2 PASS** (encryption audit honesty)

```
npx tsx --test src/components/messaging/__tests__/scrolithaMenuPolicy.spec.ts
```
**4/4 PASS** (menu selection policy)

## Security tests

- E2EE claim must be false
- Safety number null
- Impersonating username without flags ≠ Scrolitha menu
