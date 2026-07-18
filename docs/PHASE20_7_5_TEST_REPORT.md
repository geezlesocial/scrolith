# Phase 20.7.5 — Test Report

```
npx tsx --test src/services/scrolitha/__tests__/scrolitha.phase2075.dedupeSearch.spec.ts
```

**3/3 PASS** (pair key, exact DM, survivor ordering)

Manual operator checks:

1. Search “scrolitha” / a contact name → results, not raw 404.  
2. Open Messages twice / multi-tab → one Scrolitha row.  
3. Existing multi-row users → ensure collapses after open/refresh.
